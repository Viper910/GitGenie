import { theme } from './theme.js';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

let isVerbose = false;

export function setVerbose(enabled: boolean): void {
  isVerbose = enabled;
}

export function getVerbose(): boolean {
  return isVerbose;
}

// Regex to redact common secrets from logs
const SENSITIVE_PATTERNS = [
  /sk-or-v1-[a-zA-Z0-9]{64}/gi,
  /sk-[a-zA-Z0-9]{48}/gi,
  /ghp_[a-zA-Z0-9]{36}/gi,
  /github_pat_[a-zA-Z0-9_]{82}/gi,
  /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
  /password=["'][^"']+["']/gi,
  /api[_-]?key=["'][^"']+["']/gi,
  /AKIA[0-9A-Z]{16}/gi
];

export function maskSecrets(message: string): string {
  let masked = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      if (match.toLowerCase().startsWith('bearer ')) {
        return 'Bearer [REDACTED]';
      }
      return '[REDACTED_SECRET]';
    });
  }
  return masked;
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (!isVerbose) return;
    const cleanMsg = maskSecrets(message);
    const tag = theme.dim('[DEBUG]');
    console.log(`${tag} ${theme.gray(cleanMsg)}`, ...args.map(a => typeof a === 'string' ? maskSecrets(a) : a));
  },

  info(message: string, ...args: unknown[]): void {
    const cleanMsg = maskSecrets(message);
    console.log(theme.cyan(cleanMsg), ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    const cleanMsg = maskSecrets(message);
    console.warn(`${theme.yellow(`${theme.symbols.warning} `)}${theme.yellow(cleanMsg)}`, ...args);
  },

  error(message: string, ...args: unknown[]): void {
    const cleanMsg = maskSecrets(message);
    console.error(`${theme.red(`${theme.symbols.cross} `)}${theme.red(cleanMsg)}`, ...args);
  }
};
