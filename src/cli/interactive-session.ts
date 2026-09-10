import { theme } from '../terminal/theme.js';
import { renderBanner } from './banner.js';
import { TerminalRenderer } from '../terminal/renderer.js';
import { RepositoryInspector, RepoContext } from '../git/repository-inspector.js';
import { GitExecutor } from '../git/git-executor.js';
import { SessionContext } from '../session/session-context.js';
import { ConfigManager } from '../config/config-manager.js';
import { VoiceManager } from '../voice/voice-manager.js';
import { RequestHandler } from '../application/request-handler.js';
import { TerminalPrompt } from './terminal-prompt.js';

export class InteractiveSession {
  private sessionContext: SessionContext;
  private executor: GitExecutor;
  private inspector: RepositoryInspector;
  private voiceManager: VoiceManager;
  private terminalPrompt: TerminalPrompt | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    this.sessionContext = new SessionContext();
    this.executor = new GitExecutor(process.cwd());
    this.inspector = new RepositoryInspector(this.executor);
    this.voiceManager = new VoiceManager();
    this.sessionContext.voiceManager = this.voiceManager;

    // Handle global voice interrupts
    this.voiceManager.on('interrupt', () => {
      if (this.abortController) {
        console.log(`\n${theme.yellow('🎙 Voice interrupt received. Cancelling task...')}`);
        this.abortController.abort();
      }
    });
  }

  public async start(): Promise<void> {
    renderBanner(false);
    console.log(theme.greenBold('⚡ AI-Powered Git Assistant\n'));
    console.log(theme.gray('Tip: Press Ctrl+O at any time to toggle voice mode.\n'));

    // Initialize Voice Manager
    await this.voiceManager.initialize();

    // Initial inspection
    let repoContext = await this.inspector.inspect();
    this.renderContextPanel(repoContext);

    console.log(theme.cyan('\nWhat would you like to do?\n'));

    let active = true;

    // We must handle ctrl+c gracefully
    process.on('SIGINT', () => {
      if (this.terminalPrompt) {
         this.terminalPrompt.forceClose();
      } else {
         console.log(`\n${theme.yellow('Use "exit" or "/exit" to close the session safely.')}`);
      }
    });

    while (active) {
      const config = ConfigManager.getEffectiveConfig();
      try {
        const promptPrefixBase = theme.cyanBold('⚡ gitgenie ❯ ');
        this.terminalPrompt = new TerminalPrompt({ promptPrefix: promptPrefixBase });

        // Wire up terminal prompt and voice manager
        this.terminalPrompt.on('toggle-voice', () => {
          if (this.voiceManager.isCurrentlyListening) {
            this.voiceManager.stopListening();
            this.terminalPrompt?.setPrompt(promptPrefixBase);
            this.sessionContext.voiceModeActive = false;
          } else {
            this.sessionContext.voiceModeActive = true;
            this.terminalPrompt?.setPrompt(theme.purpleBold('🎤 Listening... ') + promptPrefixBase);
            this.voiceManager.startListening();
          }
        });

        this.terminalPrompt.on('sigint', () => {
           console.log(`\n${theme.yellow('Use "exit" or "/exit" to close the session safely.')}`);
        });

        const onInterim = (text: string) => {
          if (this.terminalPrompt) {
            this.terminalPrompt.setPrompt(theme.purpleBold('🎤 Listening... ') + promptPrefixBase);
            this.terminalPrompt.updateInterimText(text);
          }
        };

        const onFinal = (text: string) => {
          if (this.terminalPrompt) {
            this.terminalPrompt.commitFinalText(text);
            if (config.voice.autoSubmit.enabled) {
              this.terminalPrompt.setPrompt(theme.purple('Waiting for speech... ') + promptPrefixBase);
            }
          }
        };

        const onSubmit = () => {
          if (this.terminalPrompt) {
            this.terminalPrompt.setPrompt(theme.green('✓ Voice command detected ') + promptPrefixBase);
            this.terminalPrompt.forceSubmit();
          }
        };

        const onCancel = () => {
          if (this.terminalPrompt) {
            this.terminalPrompt.clearBuffer();
            this.terminalPrompt.setPrompt(theme.purpleBold('🎤 Listening... ') + promptPrefixBase);
          }
        };

        this.voiceManager.on('interim', onInterim);
        this.voiceManager.on('final', onFinal);
        this.voiceManager.on('submit', onSubmit);
        this.voiceManager.on('cancel', onCancel);

        // If continuous mode or we just toggled, ensure we start listening if active
        if (this.sessionContext.voiceModeActive && !this.voiceManager.isCurrentlyListening) {
          this.terminalPrompt.setPrompt(theme.purpleBold('🎤 Listening... ') + promptPrefixBase);
          this.voiceManager.startListening();
        }

        // Wait for user input (either typed or voice-transcribed + enter)
        const userInput = await this.terminalPrompt.ask();
        
        // Cleanup listeners
        this.voiceManager.removeListener('interim', onInterim);
        this.voiceManager.removeListener('final', onFinal);
        this.voiceManager.removeListener('submit', onSubmit);
        this.voiceManager.removeListener('cancel', onCancel);
        this.terminalPrompt = null;

        let userCommand = userInput.trim();
        if (!userCommand) continue;

        // Clean up trailing punctuation from Whisper (e.g., "exit." -> "exit")
        userCommand = userCommand.replace(/[.,!?]+$/, '').trim();

        if (this.isExitCommand(userCommand)) {
          console.log(`\n${theme.green('Thanks for using GitGenie ⚡')}`);
          console.log(theme.gray('Session ended safely.\n'));
          active = false;
          break;
        }

        if (userCommand === '/clear') {
          console.clear();
          renderBanner(false);
          repoContext = await this.inspector.inspect();
          this.renderContextPanel(repoContext);
          continue;
        }

        if (userCommand === '/status') {
          repoContext = await this.inspector.inspect();
          this.renderContextPanel(repoContext);
          continue;
        }

        // Add to context
        this.sessionContext.addMessage('user', userCommand);

        // Process request
        this.abortController = new AbortController();
        
        const success = await RequestHandler.handle(userCommand, {
          verbose: process.argv.includes('--verbose'),
          sessionContext: this.sessionContext,
          abortSignal: this.abortController.signal
        });

        this.abortController = null;

        // Add AI result placeholder in context (will be refined in AI Provider update)
        if (success) {
          this.sessionContext.addMessage('assistant', 'Action completed successfully.');
        } else {
          this.sessionContext.addMessage('assistant', 'Action failed or was cancelled.');
        }

        // Refresh context for next loop just in case
        repoContext = await this.inspector.inspect();

        console.log(''); // newline for spacing
        
        // Continuous mode logic
        if (this.sessionContext.voiceModeActive) {
           if (!config.voice.continuousMode.enabled) {
             this.sessionContext.voiceModeActive = false;
             if (this.voiceManager.isCurrentlyListening) {
               await this.voiceManager.stopListening();
             }
           }
        }
      } catch (err: any) {
        if (err.name === 'ExitPromptError' || err.message.includes('User force closed the prompt')) {
          console.log(`\n${theme.yellow('Use "exit" or "/exit" to close the session safely.')}`);
        } else if (err.message === 'TerminalPrompt is already active.') {
          // ignore double execution
        } else {
          console.error(theme.red(`\nAn unexpected error occurred: ${err.message}`));
        }
      }
    }
    
    // Graceful cleanup here
    await this.voiceManager.shutdown();
  }

  private isExitCommand(cmd: string): boolean {
    const lower = cmd.toLowerCase();
    return ['exit', 'quit', 'close', 'goodbye', 'stop gitgenie', 'close gitgenie', '/exit', '/quit'].includes(lower);
  }

  private renderContextPanel(context: RepoContext): void {
    const lines = [];
    lines.push(`│ Repository   ${theme.whiteBold(context.repoRoot ? context.repoRoot.split(/[\\/]/).pop() || 'unknown' : 'Not a git repo')}   `);
    lines.push(`│ Branch       ${theme.whiteBold(context.currentBranch || 'N/A')}      `);
    lines.push(`│ Status       ${context.isClean ? theme.green('✓ Clean') : theme.yellow(`${context.unstagedCount + context.stagedCount + context.untrackedCount} changes`)} `);
    lines.push(`│ Remote       ${theme.white(context.remotes.length > 0 ? context.remotes[0].name : 'None')} `);
    
    console.log(theme.gray('┌─ Repository Context ────────────────────┐'));
    for (const line of lines) {
      console.log(theme.gray(line) + theme.gray(' │')); // Padding could be dynamic but fixed for now conceptually
    }
    console.log(theme.gray('└─────────────────────────────────────────┘'));
  }
}
