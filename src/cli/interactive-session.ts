import { input } from '@inquirer/prompts';
import { theme } from '../terminal/theme.js';
import { renderBanner } from './banner.js';
import { TerminalRenderer } from '../terminal/renderer.js';
import { RepositoryInspector, RepoContext } from '../git/repository-inspector.js';
import { GitExecutor } from '../git/git-executor.js';
import { SessionContext } from '../session/session-context.js';
import { ConfigManager } from '../config/config-manager.js';
import { VoiceManager } from '../voice/voice-manager.js';
import { RequestHandler } from '../application/request-handler.js';

export class InteractiveSession {
  private sessionContext: SessionContext;
  private executor: GitExecutor;
  private inspector: RepositoryInspector;
  private voiceManager: VoiceManager;

  constructor() {
    this.sessionContext = new SessionContext();
    this.executor = new GitExecutor(process.cwd());
    this.inspector = new RepositoryInspector(this.executor);
    this.voiceManager = new VoiceManager();
    this.sessionContext.voiceManager = this.voiceManager;
  }

  public async start(): Promise<void> {
    renderBanner(false);
    console.log(theme.greenBold('⚡ AI-Powered Git Assistant\n'));

    // Initialize Voice Manager
    await this.voiceManager.initialize();

    // Initial inspection
    let repoContext = await this.inspector.inspect();
    this.renderContextPanel(repoContext);

    console.log(theme.cyan('\nWhat would you like to do?\n'));

    let active = true;

    // We must handle ctrl+c gracefully
    process.on('SIGINT', () => {
      console.log(`\n${theme.yellow('Use "exit" or "/exit" to close the session safely.')}`);
      // Don't kill process unless forced
    });

    while (active) {
      try {
        let trimmedInput = '';

        if (!this.sessionContext.voiceModeActive) {
          const promptPrefix = theme.cyanBold('⚡ gitgenie ❯ ');
            
          const userInput = await input({
            message: promptPrefix,
            theme: { prefix: '' }
          });

          trimmedInput = userInput.trim();
          if (!trimmedInput) continue;

          if (trimmedInput === '/voice off') {
            this.sessionContext.voiceModeActive = false;
            console.log(`\n${theme.purple('🎙 Voice mode disabled.')}`);
            continue;
          }

          if (trimmedInput === '/voice status') {
            console.log(`\n${theme.purple('🎙 Voice mode is ')}${this.sessionContext.voiceModeActive ? theme.green('ACTIVE') : theme.yellow('INACTIVE')}.`);
            continue;
          }

          if (trimmedInput === '/voice') {
            this.sessionContext.voiceModeActive = true;
            console.log(`\n${theme.purple('🎙 Voice mode enabled.')}`);
          }
        }

        let userCommand = trimmedInput;
        
        if (this.sessionContext.voiceModeActive) {
          const voiceInput = await this.voiceManager.listenForCommand();
          if (voiceInput) {
            userCommand = voiceInput;
          } else {
            // User might have aborted or it failed. If they aborted, voiceModeActive might be set to false.
            continue;
          }
        } else if (!userCommand) {
          continue;
        }

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
        const config = ConfigManager.getEffectiveConfig();
        const success = await RequestHandler.handle(userCommand, {
          verbose: process.argv.includes('--verbose'),
          sessionContext: this.sessionContext
        });

        // Add AI result placeholder in context (will be refined in AI Provider update)
        if (success) {
          this.sessionContext.addMessage('assistant', 'Action completed successfully.');
        } else {
          this.sessionContext.addMessage('assistant', 'Action failed or was cancelled.');
        }

        // Refresh context for next loop just in case
        repoContext = await this.inspector.inspect();

        console.log(''); // newline for spacing
      } catch (err: any) {
        // Handling `@inquirer/prompts` cancellation (Ctrl+C usually throws an Error with a specific name or message)
        if (err.name === 'ExitPromptError' || err.message.includes('User force closed the prompt')) {
          console.log(`\n${theme.yellow('Use "exit" or "/exit" to close the session safely.')}`);
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
    return ['exit', 'quit', 'close', 'goodbye', 'stop gitgenie', '/exit', '/quit'].includes(lower);
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
