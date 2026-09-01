import boxen from 'boxen';
import Table from 'cli-table3';
import { theme, COLORS, isNoColor } from './theme.js';
import { DetectedSecret } from '../security/secret-detector.js';

export class TerminalRenderer {
  /**
   * Render an action plan cleanly
   */
  static renderPlan(summary: string, actions: Array<{ type: string; description?: string; [key: string]: unknown }>): void {
    console.log(`\n${theme.purpleBold(`${theme.symbols.diamond} Plan`)}`);
    if (summary) {
      console.log(`  ${theme.gray(summary)}\n`);
    }
    actions.forEach((act, idx) => {
      const num = theme.purple(`${idx + 1}.`);
      const type = theme.cyanBold(act.type);
      const desc = act.description ? theme.gray(` - ${act.description}`) : '';
      console.log(`  ${num} ${type}${desc}`);
    });
    console.log('');
  }

  /**
   * Render repository status inspection
   */
  static renderInspection(data: {
    isRepo: boolean;
    branch?: string;
    clean?: boolean;
    stagedCount?: number;
    unstagedCount?: number;
    untrackedCount?: number;
    ahead?: number;
    behind?: number;
    hasConflicts?: boolean;
    techStack?: string;
  }): void {
    console.log(`\n${theme.cyanBold(`${theme.symbols.diamond} Repository State`)}`);
    if (!data.isRepo) {
      console.log(`  ${theme.symbols.bullet} ${theme.yellow('Directory is not a Git repository')}`);
      if (data.techStack) {
        console.log(`  ${theme.symbols.bullet} Detected Project Stack: ${theme.cyanBold(data.techStack)}`);
      }
      console.log('');
      return;
    }

    console.log(`  ${theme.symbols.bullet} Current branch: ${theme.cyanBold(data.branch || 'unknown')}`);
    if (data.techStack) {
      console.log(`  ${theme.symbols.bullet} Detected Project Stack: ${theme.cyan(data.techStack)}`);
    }

    if (data.hasConflicts) {
      console.log(`  ${theme.symbols.bullet} Status: ${theme.redBold('Merge conflicts detected')}`);
    } else if (data.clean) {
      console.log(`  ${theme.symbols.bullet} Working tree: ${theme.green('Clean')}`);
    } else {
      const parts: string[] = [];
      if (data.stagedCount) parts.push(`${data.stagedCount} staged`);
      if (data.unstagedCount) parts.push(`${data.unstagedCount} modified`);
      if (data.untrackedCount) parts.push(`${data.untrackedCount} untracked`);
      console.log(`  ${theme.symbols.bullet} Working tree: ${theme.yellow(parts.join(', ') || 'Changes present')}`);
    }

    if (data.ahead || data.behind) {
      const syncInfo = [];
      if (data.ahead) syncInfo.push(theme.cyan(`Ahead: ${data.ahead}`));
      if (data.behind) syncInfo.push(theme.yellow(`Behind: ${data.behind}`));
      console.log(`  ${theme.symbols.bullet} Remote sync: ${syncInfo.join(' | ')}`);
    }
    console.log('');
  }

  /**
   * Render a final completion card
   */
  static renderCompletionCard(title: string, details: Record<string, string | number | undefined>): void {
    let content = `${theme.greenBold(`${theme.symbols.check} ${title}`)}\n\n`;
    const entries = Object.entries(details).filter(([_, v]) => v !== undefined && v !== '');

    if (entries.length > 0) {
      for (const [k, v] of entries) {
        content += `${theme.cyanBold(`${k}:`)}\n${theme.white(`  ${v}`)}\n\n`;
      }
    }

    content += theme.cyan(`${theme.symbols.line.repeat(32)}\n${theme.symbols.lightning} GitGenie Automation Complete`);

    if (isNoColor()) {
      console.log(`\n========================================\n${content}\n========================================\n`);
      return;
    }

    const box = boxen(content.trim(), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderColor: '#00F0FF',
      borderStyle: 'round',
      dimBorder: false
    });
    console.log(box);
  }

  /**
   * Render a security warning for detected secrets
   */
  static renderSecretAlert(secrets: DetectedSecret[]): void {
    let text = `${theme.badgeYellow('SECURITY WARNING')} ${theme.yellowBold('Potential secret(s) detected!')}\n\n`;
    text += `${theme.white('GitGenie has stopped automatic staging/committing to prevent credential leaks.')}\n\n`;

    for (const secret of secrets) {
      text += `${theme.redBold(`${theme.symbols.warning} File:`)} ${theme.whiteBold(secret.file)}\n`;
      text += `  ${theme.cyan('Type:')} ${secret.ruleName}\n`;
      text += `  ${theme.dim('Match:')} ${secret.maskedMatch}\n`;
      if (secret.line) {
        text += `  ${theme.dim('Line:')} ${secret.line}\n`;
      }
      text += '\n';
    }

    text += `${theme.yellowBold('Recommended Actions:')}\n`;
    text += `  1. Add sensitive file(s) to ${theme.cyan('.gitignore')}\n`;
    text += `  2. Remove credentials and use environment variables\n`;
    text += `  3. Explicitly stage only intended safe files`;

    if (isNoColor()) {
      console.log(`\n[!] ${text}\n`);
      return;
    }

    const box = boxen(text.trim(), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderColor: '#FFE600',
      borderStyle: 'bold'
    });
    console.log(box);
  }

  /**
   * Render a destructive operation warning modal
   */
  static renderDestructiveWarning(action: string, description: string, command: string): void {
    let text = `${theme.badgeRed('DESTRUCTIVE OPERATION')} ${theme.redBold('Confirmation Required')}\n\n`;
    text += `${theme.whiteBold('GitGenie is about to execute a potentially destructive operation:')}\n\n`;
    text += `${theme.cyanBold('Action:')} ${action}\n`;
    text += `${theme.cyanBold('Impact:')} ${theme.yellow(description)}\n`;
    text += `${theme.cyanBold('Command:')} ${theme.red(command)}\n\n`;
    text += `${theme.white('This operation may permanently overwrite or discard changes.')}\n`;

    if (isNoColor()) {
      console.log(`\n${text}\n`);
      return;
    }

    const box = boxen(text.trim(), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderColor: '#FF073A',
      borderStyle: 'double'
    });
    console.log(box);
  }

  /**
   * Render syntax-highlighted git diff
   */
  static renderDiff(diffText: string): void {
    if (!diffText.trim()) return;
    const lines = diffText.split('\n');
    console.log(`\n${theme.cyanBold(`${theme.symbols.diamond} Diff Preview:`)}`);
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        console.log(theme.green(line));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        console.log(theme.red(line));
      } else if (line.startsWith('@@')) {
        console.log(theme.cyan(line));
      } else if (line.startsWith('diff ') || line.startsWith('index ')) {
        console.log(theme.purpleBold(line));
      } else {
        console.log(theme.dim(line));
      }
    }
    console.log('');
  }

  /**
   * Render clean error message with explanation and suggestions
   */
  static renderErrorCard(title: string, reason: string, suggestion?: string): void {
    let text = `${theme.redBold(`${theme.symbols.cross} ${title}`)}\n\n`;
    text += `${theme.whiteBold('Reason:')}\n${theme.gray(reason)}\n\n`;

    if (suggestion) {
      text += `${theme.greenBold('Suggested Resolution:')}\n${theme.cyan(suggestion)}\n\n`;
    }

    text += `${theme.dim('Your repository has been kept safe and unmodified.')}`;

    if (isNoColor()) {
      console.log(`\n[ERROR] ${text}\n`);
      return;
    }

    const box = boxen(text.trim(), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderColor: '#FF073A',
      borderStyle: 'round'
    });
    console.log(box);
  }
}
