import prompts from 'prompts';
import { TerminalRenderer } from '../terminal/renderer.js';
import { PolicyEvaluation } from './policy-engine.js';
import { theme } from '../terminal/theme.js';
import { logger } from '../terminal/logger.js';

export class ConfirmationManager {
  /**
   * Request confirmation for a dangerous or destructive action
   */
  static async confirmAction(
    actionName: string,
    evaluation: PolicyEvaluation,
    autoConfirm = false
  ): Promise<boolean> {
    if (autoConfirm) {
      logger.warn(`Auto-confirming destructive action "${actionName}" due to --yes / autoConfirm configuration.`);
      return true;
    }

    if (evaluation.level === 'DESTRUCTIVE') {
      TerminalRenderer.renderDestructiveWarning(
        actionName,
        evaluation.warningMessage || 'Destructive action that modifies or deletes history.',
        evaluation.destructiveCommandDescription || 'Unknown command'
      );

      // Require typing 'confirm'
      const response = await prompts({
        type: 'text',
        name: 'value',
        message: theme.redBold(`Type "confirm" to continue or press Enter to cancel:`),
        validate: (value) => true
      });

      const confirmed = response.value && response.value.trim().toLowerCase() === 'confirm';
      if (!confirmed) {
        console.log(`\n${theme.yellow(`${theme.symbols.warning} Action cancelled by user.`)}\n`);
      }
      return Boolean(confirmed);
    }

    if (evaluation.level === 'REQUIRES_CONFIRMATION') {
      const response = await prompts({
        type: 'confirm',
        name: 'value',
        message: theme.yellowBold(`${evaluation.warningMessage || `Confirm execution of ${actionName}?`}`),
        initial: true
      });

      return Boolean(response.value);
    }

    return true;
  }
}
