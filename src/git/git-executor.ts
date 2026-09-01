import { spawn } from 'child_process';
import { logger } from '../terminal/logger.js';

export interface GitExecutionResult {
  success: boolean;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: Error;
}

export interface GitRecoveryAction {
  type: 'SWITCH_TO_SSH' | 'CONFIG_CREDENTIAL_MANAGER' | 'PULL_REBASE' | 'SET_UPSTREAM_PUSH' | 'RESOLVE_CONFLICTS' | 'REMOVE_LOCK';
  title: string;
  description: string;
  payload?: Record<string, unknown>;
}

export interface GitErrorDiagnosis {
  code: 'AUTH_FAILED' | 'REJECTED_NON_FAST_FORWARD' | 'NO_UPSTREAM' | 'CONFLICT' | 'NOT_REPO' | 'IDENTITY_MISSING' | 'LOCK_FILE' | 'OVERWRITTEN_CHANGES' | 'UNKNOWN';
  reason: string;
  suggestion: string;
  recoveryActions: GitRecoveryAction[];
}

export interface GitExecOptions {
  ignoreErrors?: boolean;
  timeoutMs?: number;
  interactive?: boolean;
  extraEnv?: Record<string, string>;
}

export class GitExecutor {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Set the working directory for git commands
   */
  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  getCwd(): string {
    return this.cwd;
  }

  /**
   * Execute git command safely using spawn with parameterized arguments
   */
  async exec(args: string[], options?: GitExecOptions): Promise<GitExecutionResult> {
    const fullCmd = `git ${args.join(' ')}`;
    logger.debug(`Executing: ${fullCmd} (in ${this.cwd})`);

    const isInteractive = Boolean(options?.interactive);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const isRemoteCommand = args.length > 0 && ['push', 'pull', 'fetch', 'clone', 'ls-remote'].includes(args[0]);
      const defaultTimeout = isRemoteCommand ? 45000 : 15000;
      const timeoutMs = options?.timeoutMs || (isInteractive ? 90000 : defaultTimeout);
      const timeoutTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { child.kill('SIGKILL'); } catch {}
          resolve({
            success: false,
            command: fullCmd,
            args,
            stdout: stdout.trim(),
            stderr: stderr.trim() || 'Git command timed out',
            exitCode: -1,
            error: new Error(`Command "${fullCmd}" timed out after ${timeoutMs}ms`)
          });
        }
      }, timeoutMs);

      const stdioConfig = isInteractive ? 'inherit' : ['ignore', 'pipe', 'pipe'];

      const envConfig: NodeJS.ProcessEnv = {
        ...process.env,
        LC_ALL: 'C', // Consistent English output for parsing
        ...options?.extraEnv
      };

      // In headless test environments, disable interactive prompts to prevent test hanging
      if (process.env.VITEST || process.env.NODE_ENV === 'test') {
        envConfig.GIT_TERMINAL_PROMPT = '0';
      }

      const child = spawn('git', args, {
        cwd: this.cwd,
        stdio: stdioConfig as any,
        env: envConfig,
        shell: false // CRITICAL: Never use shell to prevent command injection
      });

      if (!isInteractive) {
        child.stdout?.on('data', (data: any) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: any) => {
          stderr += data.toString();
        });
      }

      child.on('error', (err: any) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutTimer);
          logger.debug(`Process spawn error: ${err.message}`);
          resolve({
            success: false,
            command: fullCmd,
            args,
            stdout: stdout.trim(),
            stderr: stderr.trim() || err.message,
            exitCode: -1,
            error: err
          });
        }
      });

      child.on('close', (code: number | null) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutTimer);
          const exitCode = code ?? 0;
          const success = exitCode === 0;

          if (!success && !options?.ignoreErrors) {
            logger.debug(`Command failed with code ${exitCode}: ${stderr.trim()}`);
          }

          resolve({
            success,
            command: fullCmd,
            args,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode
          });
        }
      });
    });
  }

  /**
   * Deep diagnosis of Git error output with actionable recovery steps
   */
  static diagnoseError(stderr: string, remoteUrl?: string): GitErrorDiagnosis {
    const text = stderr.toLowerCase();

    // 1. Authentication & Terminal Prompts Disabled (e.g. GitHub HTTPS push)
    if (
      text.includes('could not read username') ||
      text.includes('terminal prompts disabled') ||
      text.includes('authentication failed') ||
      text.includes('permission denied (publickey)') ||
      text.includes('invalid username or token') ||
      text.includes('remote: invalid username or password')
    ) {
      const recoveryActions: GitRecoveryAction[] = [];

      if (remoteUrl && remoteUrl.startsWith('http')) {
        const sshUrl = remoteUrl.replace(/^https?:\/\/github\.com\//i, 'git@github.com:');
        recoveryActions.push({
          type: 'SWITCH_TO_SSH',
          title: 'Switch remote URL to SSH (git@github.com:...)',
          description: `Update origin to use SSH authentication: ${sshUrl}`,
          payload: { sshUrl }
        });
      }

      recoveryActions.push({
        type: 'CONFIG_CREDENTIAL_MANAGER',
        title: 'Configure Git Credential Manager for HTTPS auth',
        description: 'Enable Git Credential Manager to cache Windows/GitHub credentials securely'
      });

      return {
        code: 'AUTH_FAILED',
        reason: 'GitHub/Remote rejected authentication over HTTPS because no cached credentials or SSH key was available.',
        suggestion: 'Either configure Git Credential Manager (git config --global credential.helper manager), login via GitHub CLI (gh auth login), or switch your remote URL to SSH (git@github.com:...).',
        recoveryActions
      };
    }

    // 2. Non-fast-forward / Remote contains work
    if (
      text.includes('updates were rejected because the remote contains work') ||
      text.includes('non-fast-forward') ||
      text.includes('fetch first')
    ) {
      return {
        code: 'REJECTED_NON_FAST_FORWARD',
        reason: 'The remote branch contains newer commits that are not present in your local branch.',
        suggestion: 'Pull and integrate the remote changes before pushing.',
        recoveryActions: [
          {
            type: 'PULL_REBASE',
            title: 'Pull latest remote commits with rebase and retry push',
            description: 'Execute git pull --rebase origin <branch> and automatically resume pushing'
          }
        ]
      };
    }

    // 3. No upstream branch configured
    if (text.includes('no upstream branch') || text.includes('set-upstream')) {
      return {
        code: 'NO_UPSTREAM',
        reason: 'The current branch does not have an upstream remote tracking branch configured.',
        suggestion: 'Set upstream tracking using git push -u origin <branch>.',
        recoveryActions: [
          {
            type: 'SET_UPSTREAM_PUSH',
            title: 'Push with upstream tracking set',
            description: 'Execute git push -u origin <branch>'
          }
        ]
      };
    }

    // 4. Merge conflict markers
    if (text.includes('unmerged files') || text.includes('fix conflicts') || text.includes('automatic merge failed')) {
      return {
        code: 'CONFLICT',
        reason: 'Unresolved merge conflict markers detected in your working tree.',
        suggestion: 'Resolve conflict markers with GitGenie AI Conflict Resolver.',
        recoveryActions: [
          {
            type: 'RESOLVE_CONFLICTS',
            title: 'Launch GitGenie AI Conflict Resolver',
            description: 'Parse conflicted files and combine branch additions automatically'
          }
        ]
      };
    }

    // 5. Index lock file contention
    if (text.includes('index.lock') || text.includes('another git process seems to be running')) {
      return {
        code: 'LOCK_FILE',
        reason: 'A stale Git index lock file (.git/index.lock) is blocking Git operations.',
        suggestion: 'Ensure no other Git command is running, then remove .git/index.lock.',
        recoveryActions: [
          {
            type: 'REMOVE_LOCK',
            title: 'Remove stale .git/index.lock file',
            description: 'Delete the lock file to unblock Git operations'
          }
        ]
      };
    }

    // 6. Identity missing
    if (text.includes('please tell me who you are') || text.includes('user.email')) {
      return {
        code: 'IDENTITY_MISSING',
        reason: 'Git author identity (user.name / user.email) is not configured in git config.',
        suggestion: 'Run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`.',
        recoveryActions: []
      };
    }

    // 7. Not a repository
    if (text.includes('not a git repository')) {
      return {
        code: 'NOT_REPO',
        reason: 'The current working directory is not a Git repository.',
        suggestion: 'Initialize a repository using: gitgenie "Initialize this repository"',
        recoveryActions: []
      };
    }

    return {
      code: 'UNKNOWN',
      reason: stderr.trim() || 'An unexpected Git error occurred during execution.',
      suggestion: 'Check repository status with gitgenie "Show status" and verify your Git network access.',
      recoveryActions: []
    };
  }

  /**
   * Legacy wrapper for backward compatibility
   */
  static parseErrorCause(stderr: string): { reason: string; suggestion: string } {
    const diag = this.diagnoseError(stderr);
    return { reason: diag.reason, suggestion: diag.suggestion };
  }
}
