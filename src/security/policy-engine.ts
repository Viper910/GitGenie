import { ActionType, APPROVED_ACTIONS } from '../config/constants.js';

export type PolicySafetyLevel = 'SAFE' | 'REQUIRES_CONFIRMATION' | 'DESTRUCTIVE' | 'BLOCKED';

export interface ActionPayload {
  type: ActionType;
  description?: string;
  [key: string]: unknown;
}

export interface PolicyEvaluation {
  level: PolicySafetyLevel;
  isAllowed: boolean;
  requiresPrompt: boolean;
  warningMessage?: string;
  destructiveCommandDescription?: string;
}

export class PolicyEngine {
  /**
   * Check whether an action type is recognized and approved
   */
  static isApprovedAction(type: string): type is ActionType {
    return (APPROVED_ACTIONS as readonly string[]).includes(type);
  }

  /**
   * Evaluate a structured action payload against security policies
   */
  static evaluateAction(action: ActionPayload): PolicyEvaluation {
    // 1. Check if action type is approved
    if (!this.isApprovedAction(action.type)) {
      return {
        level: 'BLOCKED',
        isAllowed: false,
        requiresPrompt: false,
        warningMessage: `Unknown or unapproved action type: "${action.type}"`
      };
    }

    // 2. Check for shell injection attempts in command parameters (excluding natural language text fields)
    const textFields = new Set([
      'description',
      'summary',
      'message',
      'explanation',
      'reason',
      'suggestion',
      'details',
      'techStack',
      'defaultBranch'
    ]);

    for (const [key, value] of Object.entries(action)) {
      if (typeof value === 'string' && !textFields.has(key)) {
        if (this.containsShellInjection(value)) {
          return {
            level: 'BLOCKED',
            isAllowed: false,
            requiresPrompt: false,
            warningMessage: `Illegal characters or injection sequence detected in field "${key}": "${value}"`
          };
        }
      }
    }

    // 3. Destructive action checks
    switch (action.type) {
      case 'PUSH': {
        const isForce = Boolean(action.force || action.forceWithLease);
        if (isForce) {
          return {
            level: 'DESTRUCTIVE',
            isAllowed: true,
            requiresPrompt: true,
            warningMessage: 'Force push will overwrite remote commit history.',
            destructiveCommandDescription: `git push ${action.force ? '--force' : '--force-with-lease'} ${action.remote || 'origin'} ${action.branch || ''}`
          };
        }
        return { level: 'SAFE', isAllowed: true, requiresPrompt: false };
      }

      case 'RESET': {
        const mode = (action.mode as string) || 'mixed';
        if (mode === 'hard') {
          return {
            level: 'DESTRUCTIVE',
            isAllowed: true,
            requiresPrompt: true,
            warningMessage: 'Hard reset will discard all uncommitted changes and move HEAD permanently.',
            destructiveCommandDescription: `git reset --hard ${action.target || 'HEAD'}`
          };
        }
        return { level: 'REQUIRES_CONFIRMATION', isAllowed: true, requiresPrompt: true, warningMessage: `Reset working tree to ${action.target || 'HEAD'}` };
      }

      case 'DELETE_BRANCH': {
        return {
          level: 'DESTRUCTIVE',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: `Branch "${action.name}" will be deleted.`,
          destructiveCommandDescription: `git branch -D ${action.name}`
        };
      }

      case 'DROP_STASH': {
        return {
          level: 'DESTRUCTIVE',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: 'Stashed changes will be permanently removed.',
          destructiveCommandDescription: `git stash drop ${action.index || ''}`
        };
      }

      case 'DELETE_TAG': {
        return {
          level: 'DESTRUCTIVE',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: `Tag "${action.name}" will be permanently deleted.`,
          destructiveCommandDescription: `git tag -d ${action.name}`
        };
      }

      case 'DELETE_REMOTE_TAG': {
        return {
          level: 'DESTRUCTIVE',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: `Remote tag "${action.name}" will be deleted from remote "${action.remote || 'origin'}".`,
          destructiveCommandDescription: `git push --delete ${action.remote || 'origin'} ${action.name}`
        };
      }

      case 'CLEAR_STASH': {
        return {
          level: 'DESTRUCTIVE',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: 'All stashes will be permanently removed from repository history.',
          destructiveCommandDescription: 'git stash clear'
        };
      }

      case 'DISCARD_ALL_CHANGES': {
        return {
          level: 'DESTRUCTIVE',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: 'All uncommitted tracked modifications and untracked files will be permanently deleted.',
          destructiveCommandDescription: 'git reset --hard HEAD && git clean -fd'
        };
      }

      case 'CLEAN_UNTRACKED': {
        return {
          level: 'DESTRUCTIVE',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: 'Untracked files and directories will be permanently removed.',
          destructiveCommandDescription: 'git clean -fd'
        };
      }

      case 'REMOVE_REMOTE': {
        return {
          level: 'REQUIRES_CONFIRMATION',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: `Remove configured remote "${action.name || 'origin'}"`
        };
      }

      case 'REMOVE_WORKTREE': {
        return {
          level: 'REQUIRES_CONFIRMATION',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: `Remove worktree at "${action.path || action.name}"`
        };
      }

      case 'ABORT_MERGE': {
        return {
          level: 'REQUIRES_CONFIRMATION',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: 'Abort the current merge operation and revert working tree to pre-merge state.'
        };
      }

      case 'ABORT_REBASE': {
        return {
          level: 'REQUIRES_CONFIRMATION',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: 'Abort the current rebase operation and restore original branch state.'
        };
      }

      case 'ABORT_CHERRY_PICK': {
        return {
          level: 'REQUIRES_CONFIRMATION',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: 'Abort the ongoing cherry-pick operation.'
        };
      }

      case 'RESTORE_FILES': {
        return {
          level: 'REQUIRES_CONFIRMATION',
          isAllowed: true,
          requiresPrompt: true,
          warningMessage: `Discards changes in files: ${(action.files as string[] || []).join(', ')}`
        };
      }

      default:
        return {
          level: 'SAFE',
          isAllowed: true,
          requiresPrompt: false
        };
    }
  }

  /**
   * Helper to detect obvious shell injection payloads in parameters
   */
  private static containsShellInjection(str: string): boolean {
    // Check for pipes, backticks, dollar expansions, command separators
    const dangerousPatterns = /[;&|`$\n\r]/;
    return dangerousPatterns.test(str);
  }
}
