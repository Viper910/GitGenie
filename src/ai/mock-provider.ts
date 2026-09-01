import { AIProvider, AIPlanResponse, ConflictBlock, ConflictResolution, AIErrorAnalysis } from './ai-provider.interface.js';
import { RepoContext } from '../git/repository-inspector.js';
import { GitValidator } from '../git/git-validator.js';
import { ActionPayload } from '../security/policy-engine.js';

export class MockAIProvider implements AIProvider {
  readonly providerName = 'MockAIProvider (Deterministic)';

  async generatePlan(prompt: string, context: RepoContext): Promise<AIPlanResponse> {
    const lower = prompt.toLowerCase();

    // 1. Initialize repository: "init", "initialize", "setup git", "start repository"
    if (lower.includes('init') || lower.includes('initialize') || (lower.includes('setup') && !lower.includes('upstream'))) {
      return {
        intent: 'INIT_REPOSITORY',
        summary: 'Initialize Git repository and setup .gitignore for detected stack',
        actions: [
          {
            type: 'INIT_REPOSITORY',
            description: 'Initialize Git repository with default branch main',
            defaultBranch: 'main',
            generateGitignore: true,
            techStack: context.techStack || 'general'
          }
        ]
      };
    }

    // 2. Remote repository connection: "connect to remote", "link to github", "add remote", or URLs
    if (lower.includes('remote') || lower.includes('connect') || lower.includes('link') || /https?:\/\/|git@/i.test(prompt)) {
      const urlMatch = /(https?:\/\/[^\s"']+|git@[^\s"']+)/i.exec(prompt);
      if (urlMatch) {
        const url = urlMatch[1].replace(/["']/g, '');
        const remoteName = lower.includes('upstream') ? 'upstream' : 'origin';
        return {
          intent: 'CONNECT_REMOTE',
          summary: `Connect local repository to remote ${remoteName} (${url})`,
          actions: [
            {
              type: 'ADD_REMOTE',
              name: remoteName,
              url,
              description: `Connect remote ${remoteName} to ${url}`
            }
          ]
        };
      }
    }

    // 3. Sync / Pull / Fetch: "sync with remote", "pull changes", "fetch updates", "get latest commits"
    if (
      lower.includes('sync') ||
      lower.includes('pull') ||
      lower.includes('fetch') ||
      lower.includes('get latest') ||
      lower.includes('bring changes') ||
      lower.includes('update from')
    ) {
      const targetBranch = context.currentBranch || 'main';
      return {
        intent: 'SYNC_BRANCH',
        summary: `Sync and pull latest changes for ${targetBranch} from remote origin`,
        actions: [
          {
            type: 'PULL',
            description: `Fetch and integrate remote changes for ${targetBranch}`,
            remote: 'origin',
            branch: targetBranch,
            rebase: false
          }
        ]
      };
    }

    // 4. Branch Creation / Switching (with optional commit/push):
    // e.g. "create a branch for auth, commit my changes", "new branch feature/ui", "switch to branch auth"
    const isExplicitBranchRequest =
      lower.includes('create a branch') ||
      lower.includes('create branch') ||
      lower.includes('new branch') ||
      lower.includes('make a branch') ||
      lower.includes('checkout -b') ||
      lower.includes('switch to branch') ||
      lower.includes('switch branch') ||
      lower.includes('checkout branch') ||
      lower.includes('branch for') ||
      (lower.includes('branch') && (lower.includes('for') || lower.includes('named') || lower.includes('called')));

    if (isExplicitBranchRequest) {
      const match = /(?:branch\s+(?:for|named|called)\s+|branch\s+|feature\/|for\s+)([a-zA-Z0-9_\-/]+)/i.exec(prompt);
      let branchName = match ? match[1] : 'feature/update';
      if (branchName === 'for' || branchName === 'a' || branchName === 'the') {
        const altMatch = /(?:for|named|called)\s+([a-zA-Z0-9_\-/]+)/i.exec(prompt);
        if (altMatch) branchName = altMatch[1];
      }
      if (!branchName.includes('/') && !branchName.startsWith('feature')) {
        branchName = `feature/${branchName}`;
      }
      branchName = GitValidator.sanitizeBranchName(branchName);

      if (lower.includes('commit') || lower.includes('push')) {
        const actions: ActionPayload[] = [
          { type: 'CREATE_BRANCH', name: branchName, switch: true, description: `Create and switch to ${branchName}` },
          { type: 'STAGE_FILES', files: [], description: 'Stage all modified files' },
          { type: 'CREATE_COMMIT', message: `feat(${branchName.replace(/^feature\//, '')}): add implementation`, description: 'Commit changes' }
        ];
        if (lower.includes('push')) {
          actions.push({ type: 'PUSH', remote: 'origin', branch: branchName, setUpstream: true, description: `Push ${branchName} to origin` });
        }
        return {
          intent: 'CREATE_BRANCH_AND_COMMIT',
          summary: `Create branch ${branchName}, commit changes and push`,
          actions
        };
      }

      return {
        intent: 'CREATE_BRANCH',
        summary: `Create and switch to branch "${branchName}"`,
        actions: [
          {
            type: 'CREATE_BRANCH',
            description: `Create branch ${branchName}`,
            name: branchName,
            switch: true
          }
        ]
      };
    }

    // 5. Standalone Push: "push my changes", "upload commits", "publish branch"
    if (lower.includes('push') || lower.includes('publish') || lower.includes('upload')) {
      const targetBranch = context.currentBranch || 'main';
      return {
        intent: 'PUSH_CHANGES',
        summary: `Push active branch "${targetBranch}" to remote origin`,
        actions: [
          {
            type: 'PUSH',
            description: `Push ${targetBranch} to origin with upstream tracking`,
            remote: 'origin',
            branch: targetBranch,
            setUpstream: true
          }
        ]
      };
    }

    // 6. Standalone Commit: "commit changes", "save changes", "commit all", "record commit"
    if (lower.includes('commit') || lower.includes('save my changes') || lower.includes('save changes')) {
      const message = this.extractCommitMessageFromPrompt(prompt) || 'chore: update project files';
      return {
        intent: 'COMMIT_CHANGES',
        summary: `Stage all modified files and commit with message "${message}"`,
        actions: [
          {
            type: 'STAGE_FILES',
            description: 'Stage all working tree changes',
            files: []
          },
          {
            type: 'CREATE_COMMIT',
            description: `Commit changes with message "${message}"`,
            message
          }
        ]
      };
    }

    // 7. Stash: "stash changes", "save work for later"
    if (lower.includes('stash')) {
      return {
        intent: 'STASH_CHANGES',
        summary: 'Stash current uncommitted modifications',
        actions: [
          {
            type: 'STASH',
            description: 'Save working tree state to stash',
            message: 'WIP: GitGenie auto-stash'
          }
        ]
      };
    }

    // 8. Status / What changed / History: "what changed", "status", "diff", "show log"
    return {
      intent: 'EXPLAIN_STATUS',
      summary: 'Inspect repository status and changes',
      actions: [
        {
          type: 'EXPLAIN_STATUS',
          description: 'Review current working tree and branch status',
          summary: `Branch ${context.currentBranch || 'main'} is ${context.isClean ? 'clean' : `${context.unstagedCount} modified, ${context.stagedCount} staged`}.`
        }
      ]
    };
  }

  async generateCommitMessage(diff: string, context: RepoContext, userHint?: string): Promise<string> {
    if (userHint) {
      return `feat: ${userHint}`;
    }
    return `feat(core): update ${context.changes.length > 0 ? context.changes[0].path : 'project files'}`;
  }

  async resolveConflict(conflict: ConflictBlock, context: RepoContext): Promise<ConflictResolution> {
    const resolved = `${conflict.ours.trim()}\n${conflict.theirs.trim()}\n`;
    return {
      filePath: conflict.filePath,
      resolvedContent: resolved,
      explanation: 'Combined additions from both local and remote branches'
    };
  }

  async explainError(errorMessage: string, context: RepoContext): Promise<{ reason: string; suggestion: string }> {
    return {
      reason: errorMessage,
      suggestion: 'Check repository status and ensure you have correct remote permissions.'
    };
  }

  async analyzeError(errorMessage: string, failedAction: ActionPayload, context: RepoContext): Promise<AIErrorAnalysis> {
    const lower = errorMessage.toLowerCase();

    // 1. Auth failure on HTTPS push
    if (lower.includes('username') || lower.includes('authentication') || lower.includes('terminal prompts disabled')) {
      const remoteUrl = context.remotes.find(r => r.name === (failedAction.remote || 'origin'))?.url || context.remotes[0]?.url;
      const sshUrl = remoteUrl ? remoteUrl.replace(/^https?:\/\/github\.com\//i, 'git@github.com:') : 'git@github.com:user/repo.git';

      return {
        rootCause: 'GitHub HTTPS push requires authentication credentials (terminal prompts are disabled in automation mode).',
        explanation: `Switch the remote URL to SSH (${sshUrl}) to authenticate securely with your SSH key and complete the push.`,
        recoverySummary: 'Switch remote to SSH and retry push',
        recoveryActions: [
          {
            type: 'SET_REMOTE',
            name: (failedAction.remote as string) || 'origin',
            url: sshUrl,
            description: `Switch remote origin to SSH (${sshUrl})`
          },
          failedAction
        ]
      };
    }

    // 2. Non-fast-forward push
    if (lower.includes('rejected') || lower.includes('contains work')) {
      const branch = (failedAction.branch as string) || context.currentBranch || 'main';
      const remote = (failedAction.remote as string) || 'origin';
      return {
        rootCause: 'Remote branch has newer commits that are not present in your local branch.',
        explanation: `Pull remote changes using rebase to incorporate remote commits before pushing.`,
        recoverySummary: 'Pull latest remote commits with rebase and retry push',
        recoveryActions: [
          {
            type: 'PULL',
            remote,
            branch,
            rebase: true,
            description: `Pull remote changes for ${branch} with rebase`
          },
          failedAction
        ]
      };
    }

    // 3. No upstream
    if (lower.includes('no upstream') || lower.includes('set-upstream')) {
      const branch = (failedAction.branch as string) || context.currentBranch || 'main';
      const remote = (failedAction.remote as string) || 'origin';
      return {
        rootCause: 'No remote upstream tracking branch is configured for current branch.',
        explanation: 'Configure upstream tracking and push local commits.',
        recoverySummary: `Push and set upstream tracking for ${branch}`,
        recoveryActions: [
          {
            type: 'PUSH',
            remote,
            branch,
            setUpstream: true,
            description: `Push ${branch} to ${remote} with upstream tracking`
          }
        ]
      };
    }

    return {
      rootCause: errorMessage,
      explanation: 'Check repository status and verify remote permissions.',
      recoverySummary: 'Review repository status',
      recoveryActions: [
        {
          type: 'EXPLAIN_STATUS',
          description: 'Review current repository state'
        }
      ]
    };
  }

  async summarizeSync(output: string): Promise<string> {
    return 'Mock AI Sync Summary: Updated files successfully based on sync output.';
  }

  private extractCommitMessageFromPrompt(prompt: string): string | undefined {
    const quoted = /"([^"]+)"|'([^']+)'/.exec(prompt);
    if (quoted) {
      const msg = quoted[1] || quoted[2];
      if (msg.length > 3 && !msg.toLowerCase().includes('commit')) {
        return msg;
      }
    }
    return undefined;
  }
}
