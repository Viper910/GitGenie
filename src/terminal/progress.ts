import ora, { Ora } from 'ora';
import { theme, COLORS, isNoColor } from './theme.js';

export interface ProgressStep {
  text: string;
  subtext?: string;
}

export class NeonProgress {
  private spinner: Ora | null = null;
  private isInteractive: boolean;

  constructor() {
    const isTest = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
    this.isInteractive = Boolean(process.stdout.isTTY && !isNoColor() && !isTest);
  }

  start(text: string): void {
    if (this.isInteractive) {
      this.spinner = ora({
        text: theme.cyan(text),
        spinner: {
          interval: 80,
          frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        },
        color: 'cyan'
      }).start();
    } else {
      console.log(`${theme.cyan(`${theme.symbols.lightning} `)}${text}`);
    }
  }

  update(text: string): void {
    if (this.spinner) {
      this.spinner.text = theme.cyan(text);
    } else {
      console.log(`${theme.dim(`${theme.symbols.solidBullet} `)}${text}`);
    }
  }

  succeed(text: string): void {
    if (this.spinner) {
      this.spinner.stopAndPersist({
        symbol: theme.green(theme.symbols.check),
        text: theme.green(text)
      });
      this.spinner = null;
    } else {
      console.log(`${theme.green(`${theme.symbols.check} `)}${text}`);
    }
  }

  fail(text: string): void {
    if (this.spinner) {
      this.spinner.stopAndPersist({
        symbol: theme.red(theme.symbols.cross),
        text: theme.red(text)
      });
      this.spinner = null;
    } else {
      console.log(`${theme.red(`${theme.symbols.cross} `)}${text}`);
    }
  }

  warn(text: string): void {
    if (this.spinner) {
      this.spinner.stopAndPersist({
        symbol: theme.yellow(theme.symbols.warning),
        text: theme.yellow(text)
      });
      this.spinner = null;
    } else {
      console.log(`${theme.yellow(`${theme.symbols.warning} `)}${text}`);
    }
  }

  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  // Visual pulse / delay for realistic terminal UX polish
  static async delay(ms: number): Promise<void> {
    if (process.env.VITEST || process.env.NODE_ENV === 'test') {
      return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
