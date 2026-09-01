import chalk, { Chalk } from 'chalk';

let isColorDisabled = Boolean(process.env.NO_COLOR && process.env.NO_COLOR !== '0');

export function setNoColor(disabled: boolean): void {
  isColorDisabled = disabled;
  if (disabled) {
    chalk.level = 0;
  } else {
    chalk.level = 3;
  }
}

export function isNoColor(): boolean {
  return isColorDisabled || chalk.level === 0;
}

// Colors: Hex codes for Neon Dark Palette
export const COLORS = {
  cyan: '#00F0FF',
  purple: '#B026FF',
  green: '#39FF14',
  yellow: '#FFE600',
  red: '#FF073A',
  gray: '#8A8F98',
  white: '#FFFFFF',
  dim: '#4A5568'
};

export const theme = {
  // Primary brand / action accents
  cyan: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.cyan)(str)),
  cyanBold: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.cyan).bold(str)),
  
  // AI & Planning
  purple: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.purple)(str)),
  purpleBold: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.purple).bold(str)),
  
  // Success
  green: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.green)(str)),
  greenBold: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.green).bold(str)),
  
  // Warning
  yellow: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.yellow)(str)),
  yellowBold: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.yellow).bold(str)),
  
  // Error & Danger
  red: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.red)(str)),
  redBold: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.red).bold(str)),
  
  // Muted / Neutral
  gray: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.gray)(str)),
  dim: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.dim)(str)),
  white: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.white)(str)),
  whiteBold: (str: string | number) => (isNoColor() ? String(str) : chalk.hex(COLORS.white).bold(str)),

  // Semantic UI badges
  badgeCyan: (text: string) => (isNoColor() ? `[${text}]` : chalk.bgHex(COLORS.cyan).hex('#000000').bold(` ${text} `)),
  badgePurple: (text: string) => (isNoColor() ? `[${text}]` : chalk.bgHex(COLORS.purple).hex('#000000').bold(` ${text} `)),
  badgeGreen: (text: string) => (isNoColor() ? `[${text}]` : chalk.bgHex(COLORS.green).hex('#000000').bold(` ${text} `)),
  badgeYellow: (text: string) => (isNoColor() ? `[${text}]` : chalk.bgHex(COLORS.yellow).hex('#000000').bold(` ${text} `)),
  badgeRed: (text: string) => (isNoColor() ? `[${text}]` : chalk.bgHex(COLORS.red).hex('#FFFFFF').bold(` ${text} `)),

  // Symbols
  symbols: {
    lightning: '⚡',
    diamond: '◈',
    bullet: '◇',
    solidBullet: '◆',
    check: '✓',
    cross: '✗',
    warning: '⚠',
    arrowRight: '→',
    line: '━',
    divider: '─'
  }
};
