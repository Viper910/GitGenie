import * as readline from 'readline';
import { theme } from '../terminal/theme.js';
import { EventEmitter } from 'events';

export interface TerminalPromptOptions {
  promptPrefix: string;
}

export class TerminalPrompt extends EventEmitter {
  private rl: readline.Interface | null = null;
  private promptPrefix: string;
  private isActive: boolean = false;
  private currentResolve: ((value: string) => void) | null = null;
  
  // Track previous voice input length to replace it with interim updates
  private lastVoiceInputLength: number = 0;

  constructor(options: TerminalPromptOptions) {
    super();
    this.promptPrefix = options.promptPrefix;
  }

  /**
   * Starts the prompt and waits for the user to press Enter.
   */
  public async ask(): Promise<string> {
    if (this.isActive) {
      throw new Error('TerminalPrompt is already active.');
    }
    
    this.isActive = true;
    this.lastVoiceInputLength = 0;

    return new Promise((resolve) => {
      this.currentResolve = resolve;

      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: this.promptPrefix,
        terminal: true
      });

      // Handle custom keypresses (like Ctrl+O)
      process.stdin.on('keypress', this.handleKeypress);

      this.rl.prompt();

      this.rl.on('line', (line) => {
        this.finish(line);
      });

      this.rl.on('SIGINT', () => {
        this.emit('sigint');
        this.finish('');
      });
    });
  }

  /**
   * Inject interim text into the prompt buffer.
   * Interim text replaces the previous interim text.
   */
  public updateInterimText(text: string) {
    if (!this.rl || !this.isActive) return;

    // Get current line without the last voice input
    const currentLine = this.rl.line;
    const baseLine = currentLine.substring(0, currentLine.length - this.lastVoiceInputLength);
    
    // Calculate new line
    const newLine = baseLine + text;
    
    this.replaceLine(newLine);
    this.lastVoiceInputLength = text.length;
  }

  /**
   * Inject final text into the prompt buffer.
   */
  public commitFinalText(text: string) {
    if (!this.rl || !this.isActive) return;

    const currentLine = this.rl.line;
    const baseLine = currentLine.substring(0, currentLine.length - this.lastVoiceInputLength);
    
    // Add a space if baseline isn't empty and doesn't end with space
    const padding = (baseLine.length > 0 && !baseLine.endsWith(' ')) ? ' ' : '';
    const newLine = baseLine + padding + text;
    
    this.replaceLine(newLine);
    this.lastVoiceInputLength = 0; // Reset as it's now finalized and part of base typing
  }

  /**
   * Clears the current input buffer.
   */
  public clearBuffer() {
    if (!this.rl || !this.isActive) return;
    this.replaceLine('');
    this.lastVoiceInputLength = 0;
  }
  
  /**
   * Sets the prompt prefix dynamically (e.g. to show microphone icon)
   */
  public setPrompt(prefix: string) {
    this.promptPrefix = prefix;
    if (this.rl && this.isActive) {
      this.rl.setPrompt(prefix);
      this.rl.prompt(true); // true to keep the cursor position
    }
  }

  private replaceLine(newLine: string) {
    if (!this.rl) return;
    
    // Using internal readline properties to manipulate the buffer
    const anyRl = this.rl as any;
    
    // Clear line
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    
    // Write prompt and new line
    anyRl.line = newLine;
    anyRl.cursor = newLine.length;
    this.rl.prompt(true);
  }

  private handleKeypress = (str: string, key: any) => {
    if (!this.isActive) return;

    if (key && key.ctrl && key.name === 'o') {
      // Ctrl+O pressed
      this.emit('toggle-voice');
    }
  };

  private finish(line: string) {
    if (!this.isActive) return;
    
    this.isActive = false;
    process.stdin.removeListener('keypress', this.handleKeypress);
    
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.currentResolve) {
      this.currentResolve(line.trim());
      this.currentResolve = null;
    }
  }

  public forceClose() {
    this.finish('');
  }

  /**
   * Forces the prompt to submit the current line.
   */
  public forceSubmit() {
    if (!this.isActive || !this.rl) return;
    const currentLine = this.rl.line;
    this.finish(currentLine);
  }
}
