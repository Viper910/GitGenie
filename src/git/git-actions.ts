import fs from 'fs';
import path from 'path';
import { GitExecutor, GitExecutionResult } from './git-executor.js';
import { GitValidator } from './git-validator.js';
import { GITIGNORE_TEMPLATES } from '../config/constants.js';
import { logger } from '../terminal/logger.js';

export interface ActionContext {
  executor: GitExecutor;
  repoRoot: string;
}

export interface ActionResult {
  success: boolean;
  actionType: string;
  message: string;
  details?: Record<string, unknown>;
  error?: string;
}

export class GitActions {
  /**
   * Execute a structured action payload
   */
  static async execute(
    ctx: ActionContext,
    action: { type: string; [key: string]: unknown }
  ): Promise<ActionResult> {
    const { executor } = ctx;

    switch (action.type) {
      case 'INIT_REPOSITORY': {
        const initialBranch = (action.defaultBranch as string) || 'main';
        const initRes = await executor.exec(['init', '-b', initialBranch]);
        if (!initRes.success) {
          // Fallback if older git version doesn't support -b
          const fallback = await executor.exec(['init']);
          if (!fallback.success) {
            return { success: false, actionType: action.type, message: 'Failed to initialize Git repository', error: fallback.stderr };
          }
        }

        // Generate .gitignore if requested or missing
        if (action.generateGitignore || action.techStack) {
          await this.generateGitignore(ctx, (action.techStack as string) || 'general');
        }

        return {
          success: true,
          actionType: action.type,
          message: 'Initialized Git repository',
          details: { branch: initialBranch }
        };
      }

      case 'GENERATE_GITIGNORE': {
        const stack = (action.techStack as string) || 'general';
        const written = await this.generateGitignore(ctx, stack);
        return {
          success: true,
          actionType: action.type,
          message: written ? `Generated .gitignore for ${stack}` : '.gitignore already up to date'
        };
      }

      case 'CREATE_BRANCH': {
        const rawName = (action.name as string) || (action.branchName as string);
        const name = GitValidator.sanitizeBranchName(rawName);
        if (!GitValidator.isValidBranchName(name)) {
          return { success: false, actionType: action.type, message: `Invalid branch name: "${rawName}"`, error: 'Invalid name' };
        }

        const shouldSwitch = action.switch !== false;
        const res = shouldSwitch
          ? await executor.exec(['checkout', '-b', name])
          : await executor.exec(['branch', name]);

        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to create branch "${name}"`, error: res.stderr };
        }

        return {
          success: true,
          actionType: action.type,
          message: shouldSwitch ? `Created and switched to branch "${name}"` : `Created branch "${name}"`,
          details: { branch: name }
        };
      }

      case 'SWITCH_BRANCH': {
        const name = (action.name as string) || (action.branchName as string);
        const res = await executor.exec(['checkout', name]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to switch to branch "${name}"`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Switched to branch "${name}"`,
          details: { branch: name }
        };
      }

      case 'RENAME_BRANCH': {
        const oldName = action.oldName as string;
        const newName = GitValidator.sanitizeBranchName(action.newName as string);
        const args = oldName ? ['branch', '-m', oldName, newName] : ['branch', '-m', newName];
        const res = await executor.exec(args);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to rename branch to "${newName}"`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Renamed branch to "${newName}"`
        };
      }

      case 'DELETE_BRANCH': {
        const name = action.name as string;
        const force = Boolean(action.force);
        const res = await executor.exec(['branch', force ? '-D' : '-d', name]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to delete branch "${name}"`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Deleted branch "${name}"`
        };
      }

      case 'STAGE_FILES': {
        const files = (action.files as string[]) || [];
        const args = files.length > 0 ? ['add', ...files] : ['add', '.'];
        const res = await executor.exec(args);
        if (!res.success) {
          return { success: false, actionType: action.type, message: 'Failed to stage files', error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: files.length > 0 ? `Staged ${files.length} file(s)` : 'Staged all changes'
        };
      }

      case 'UNSTAGE_FILES': {
        const files = (action.files as string[]) || [];
        const args = files.length > 0 ? ['restore', '--staged', ...files] : ['restore', '--staged', '.'];
        const res = await executor.exec(args);
        if (!res.success) {
          // Fallback to git reset HEAD for older git
          const fallback = files.length > 0 ? ['reset', 'HEAD', '--', ...files] : ['reset', 'HEAD'];
          const fbRes = await executor.exec(fallback);
          if (!fbRes.success) {
            return { success: false, actionType: action.type, message: 'Failed to unstage files', error: fbRes.stderr };
          }
        }
        return {
          success: true,
          actionType: action.type,
          message: 'Unstaged changes'
        };
      }

      case 'RESTORE_FILES': {
        const files = (action.files as string[]) || [];
        if (files.length === 0) {
          return { success: false, actionType: action.type, message: 'No files specified to restore', error: 'No files' };
        }
        const res = await executor.exec(['restore', ...files]);
        if (!res.success) {
          const fallback = await executor.exec(['checkout', '--', ...files]);
          if (!fallback.success) {
            return { success: false, actionType: action.type, message: 'Failed to restore files', error: fallback.stderr };
          }
        }
        return {
          success: true,
          actionType: action.type,
          message: `Restored ${files.length} file(s)`
        };
      }

      case 'CREATE_COMMIT': {
        const message = (action.message as string) || 'chore: update repository';
        const res = await executor.exec(['commit', '-m', message]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: 'Failed to create commit', error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: 'Created commit',
          details: { commitMessage: message }
        };
      }

      case 'AMEND_COMMIT': {
        const message = action.message as string;
        const args = message ? ['commit', '--amend', '-m', message] : ['commit', '--amend', '--no-edit'];
        const res = await executor.exec(args);
        if (!res.success) {
          return { success: false, actionType: action.type, message: 'Failed to amend commit', error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: 'Amended previous commit'
        };
      }

      case 'REVERT_COMMIT': {
        const hash = (action.hash as string) || 'HEAD';
        const res = await executor.exec(['revert', '--no-edit', hash]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to revert commit ${hash}`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Reverted commit ${hash}`
        };
      }

      case 'ADD_REMOTE': {
        const name = (action.name as string) || (action.remote as string) || 'origin';
        const url = (action.url as string) || (action.remoteUrl as string);
        if (!url) {
          return { success: false, actionType: action.type, message: 'Remote URL is required', error: 'Missing URL' };
        }

        // If remote already exists, update its URL via set-url
        const checkRes = await executor.exec(['remote', 'get-url', name], { ignoreErrors: true });
        if (checkRes.success) {
          const setRes = await executor.exec(['remote', 'set-url', name, url]);
          if (!setRes.success) {
            return { success: false, actionType: action.type, message: `Failed to update remote "${name}" URL`, error: setRes.stderr };
          }
          return {
            success: true,
            actionType: action.type,
            message: `Updated remote "${name}" to ${url}`,
            details: { remote: name, url }
          };
        }

        const res = await executor.exec(['remote', 'add', name, url]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to connect remote "${name}"`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Connected remote "${name}" to ${url}`,
          details: { remote: name, url }
        };
      }

      case 'SET_REMOTE': {
        const name = (action.name as string) || (action.remote as string) || 'origin';
        const url = (action.url as string) || (action.remoteUrl as string);
        if (!url) {
          return { success: false, actionType: action.type, message: 'Remote URL is required', error: 'Missing URL' };
        }
        const res = await executor.exec(['remote', 'set-url', name, url]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to set remote "${name}" URL`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Set remote "${name}" URL to ${url}`,
          details: { remote: name, url }
        };
      }

      case 'REMOVE_REMOTE': {
        const name = (action.name as string) || (action.remote as string) || 'origin';
        const res = await executor.exec(['remote', 'remove', name]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to remove remote "${name}"`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Removed remote "${name}"`
        };
      }

      case 'FETCH': {
        const remote = (action.remote as string) || 'origin';
        const res = await executor.exec(['fetch', remote]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to fetch from ${remote}`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Fetched updates from ${remote}`
        };
      }

      case 'PULL': {
        const remote = (action.remote as string) || 'origin';
        let branch = action.branch as string;
        if (!branch) {
          const branchRes = await executor.exec(['rev-parse', '--abbrev-ref', 'HEAD'], { ignoreErrors: true });
          if (branchRes.success && branchRes.stdout.trim() && branchRes.stdout.trim() !== 'HEAD') {
            branch = branchRes.stdout.trim();
          }
        }
        const rebase = Boolean(action.rebase);
        const args = ['pull'];
        if (rebase) args.push('--rebase');
        if (remote) args.push(remote);
        if (branch) args.push(branch);

        const res = await executor.exec(args);
        if (!res.success) {
          return { success: false, actionType: action.type, message: 'Failed to pull changes', error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: 'Pulled latest changes',
          details: { output: res.stdout }
        };
      }

      case 'PUSH': {
        const remote = (action.remote as string) || 'origin';
        let branch = action.branch as string;
        if (!branch) {
          const branchRes = await executor.exec(['rev-parse', '--abbrev-ref', 'HEAD'], { ignoreErrors: true });
          if (branchRes.success && branchRes.stdout.trim() && branchRes.stdout.trim() !== 'HEAD') {
            branch = branchRes.stdout.trim();
          }
        }
        const force = Boolean(action.force || action.forceWithLease);
        const setUpstream = Boolean(action.setUpstream !== false);

        const args = ['push'];
        if (force) args.push(action.forceWithLease ? '--force-with-lease' : '--force');
        if (setUpstream && branch) {
          args.push('-u', remote, branch);
        } else {
          if (remote) args.push(remote);
          if (branch) args.push(branch);
        }

        const res = await executor.exec(args);
        if (!res.success) {
          return { success: false, actionType: action.type, message: 'Failed to push changes to remote', error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Pushed changes to ${remote}${branch ? `/${branch}` : ''}`
        };
      }

      case 'MERGE': {
        const branch = action.branch as string;
        const res = await executor.exec(['merge', branch]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to merge "${branch}"`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Merged branch "${branch}"`,
          details: { output: res.stdout }
        };
      }

      case 'ABORT_MERGE': {
        const res = await executor.exec(['merge', '--abort']);
        if (!res.success) {
          return { success: false, actionType: action.type, message: 'Failed to abort merge', error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: 'Aborted merge operation'
        };
      }

      case 'REBASE': {
        const target = action.target as string || 'main';
        const res = await executor.exec(['rebase', target]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to rebase onto "${target}"`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Rebased onto "${target}"`,
          details: { output: res.stdout }
        };
      }

      case 'CHERRY_PICK': {
        const commit = action.commit as string;
        const res = await executor.exec(['cherry-pick', commit]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to cherry-pick commit ${commit}`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Cherry-picked commit ${commit}`
        };
      }

      case 'RESET': {
        const mode = (action.mode as string) || 'mixed';
        const target = (action.target as string) || 'HEAD';
        const res = await executor.exec(['reset', `--${mode}`, target]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to reset to ${target}`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Reset working tree (${mode}) to ${target}`
        };
      }

      case 'STASH': {
        const message = action.message as string;
        const args = message ? ['stash', 'push', '-m', message] : ['stash'];
        const res = await executor.exec(args);
        if (!res.success) {
          return { success: false, actionType: action.type, message: 'Failed to stash changes', error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: 'Stashed working tree changes'
        };
      }

      case 'APPLY_STASH': {
        const index = action.index !== undefined ? `stash@{${action.index}}` : 'stash@{0}';
        const res = await executor.exec(['stash', 'apply', index]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to apply stash ${index}`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Applied stash ${index}`
        };
      }

      case 'DROP_STASH': {
        const index = action.index !== undefined ? `stash@{${action.index}}` : 'stash@{0}';
        const res = await executor.exec(['stash', 'drop', index]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to drop stash ${index}`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Dropped stash ${index}`
        };
      }

      case 'CREATE_TAG': {
        const name = action.name as string;
        const message = action.message as string;
        const args = message ? ['tag', '-a', name, '-m', message] : ['tag', name];
        const res = await executor.exec(args);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to create tag "${name}"`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Created tag "${name}"`
        };
      }

      case 'DELETE_TAG': {
        const name = action.name as string;
        const res = await executor.exec(['tag', '-d', name]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to delete tag "${name}"`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Deleted tag "${name}"`
        };
      }

      case 'DELETE_REMOTE_TAG': {
        const name = action.name as string;
        const remote = (action.remote as string) || 'origin';
        const res = await executor.exec(['push', '--delete', remote, name]);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to delete remote tag "${name}" from ${remote}`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Deleted remote tag "${name}" from ${remote}`
        };
      }

      case 'POP_STASH': {
        const index = action.index !== undefined ? `stash@{${action.index}}` : '';
        const args = index ? ['stash', 'pop', index] : ['stash', 'pop'];
        const res = await executor.exec(args);
        if (!res.success) {
          return { success: false, actionType: action.type, message: 'Failed to pop stash', error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: 'Popped stashed changes into working tree'
        };
      }

      case 'CLEAR_STASH': {
        const res = await executor.exec(['stash', 'clear']);
        if (!res.success) {
          return { success: false, actionType: action.type, message: 'Failed to clear stashes', error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: 'Cleared all stashes'
        };
      }

      case 'CLONE_REPOSITORY': {
        const url = (action.url as string) || (action.remoteUrl as string);
        if (!url) return { success: false, actionType: action.type, message: 'Missing clone URL', error: 'No URL' };
        const dest = (action.path as string) || (action.target as string) || '';
        const args = dest ? ['clone', url, dest] : ['clone', url];
        const res = await executor.exec(args);
        if (!res.success) {
          return { success: false, actionType: action.type, message: `Failed to clone repository from ${url}`, error: res.stderr };
        }
        return {
          success: true,
          actionType: action.type,
          message: `Cloned repository from ${url}`
        };
      }

      case 'GET_CONFIG': {
        const key = action.key as string;
        const res = await executor.exec(['config', '--get', key]);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Config ${key} = ${res.stdout.trim()}` : `Config key "${key}" not set`,
          details: { key, value: res.stdout.trim() }
        };
      }

      case 'SET_CONFIG': {
        const key = action.key as string;
        const value = String(action.value || '');
        const isGlobal = Boolean(action.global);
        const args = isGlobal ? ['config', '--global', key, value] : ['config', key, value];
        const res = await executor.exec(args);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Set ${isGlobal ? 'global ' : ''}config ${key} = "${value}"` : `Failed to set config ${key}`,
          error: res.stderr
        };
      }

      case 'STAGE_ALL': {
        const res = await executor.exec(['add', '-A']);
        if (!res.success) return { success: false, actionType: action.type, message: 'Failed to stage all changes', error: res.stderr };
        return { success: true, actionType: action.type, message: 'Staged all tracked and untracked changes' };
      }

      case 'CLEAN_UNTRACKED': {
        const res = await executor.exec(['clean', '-fd']);
        if (!res.success) return { success: false, actionType: action.type, message: 'Failed to clean untracked files', error: res.stderr };
        return { success: true, actionType: action.type, message: 'Removed untracked files and directories' };
      }

      case 'DISCARD_ALL_CHANGES': {
        const resetRes = await executor.exec(['reset', '--hard', 'HEAD']);
        const cleanRes = await executor.exec(['clean', '-fd']);
        if (!resetRes.success) return { success: false, actionType: action.type, message: 'Failed to discard changes', error: resetRes.stderr };
        return { success: true, actionType: action.type, message: 'Discarded all local changes and cleaned working tree' };
      }

      case 'RENAME_REMOTE': {
        const oldName = action.oldName as string;
        const newName = action.newName as string;
        const res = await executor.exec(['remote', 'rename', oldName, newName]);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Renamed remote "${oldName}" to "${newName}"` : `Failed to rename remote`,
          error: res.stderr
        };
      }

      case 'FETCH_PRUNE': {
        const remote = (action.remote as string) || 'origin';
        const res = await executor.exec(['fetch', '--prune', remote]);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Fetched and pruned remote "${remote}" branches` : 'Failed to fetch and prune',
          error: res.stderr
        };
      }

      case 'PUSH_TAGS': {
        const remote = (action.remote as string) || 'origin';
        const res = await executor.exec(['push', '--tags', remote]);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Pushed all tags to ${remote}` : 'Failed to push tags',
          error: res.stderr
        };
      }

      case 'PRUNE_REMOTE_BRANCHES': {
        const remote = (action.remote as string) || 'origin';
        const res = await executor.exec(['remote', 'prune', remote]);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Pruned stale remote tracking branches for ${remote}` : 'Failed to prune remotes',
          error: res.stderr
        };
      }

      case 'CONTINUE_MERGE': {
        const res = await executor.exec(['merge', '--continue']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Continued merge operation' : 'Failed to continue merge',
          error: res.stderr
        };
      }

      case 'CONTINUE_REBASE': {
        const res = await executor.exec(['rebase', '--continue']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Continued rebase operation' : 'Failed to continue rebase',
          error: res.stderr
        };
      }

      case 'ABORT_CHERRY_PICK': {
        const res = await executor.exec(['cherry-pick', '--abort']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Aborted cherry-pick operation' : 'Failed to abort cherry-pick',
          error: res.stderr
        };
      }

      case 'CONTINUE_CHERRY_PICK': {
        const res = await executor.exec(['cherry-pick', '--continue']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Continued cherry-pick operation' : 'Failed to continue cherry-pick',
          error: res.stderr
        };
      }

      case 'INIT_SUBMODULES': {
        const res = await executor.exec(['submodule', 'update', '--init', '--recursive']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Initialized and updated submodules' : 'Failed to init submodules',
          error: res.stderr
        };
      }

      case 'ADD_SUBMODULE': {
        const url = (action.url as string);
        const subPath = (action.path as string) || '';
        const args = subPath ? ['submodule', 'add', url, subPath] : ['submodule', 'add', url];
        const res = await executor.exec(args);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Added submodule ${url}` : 'Failed to add submodule',
          error: res.stderr
        };
      }

      case 'UPDATE_SUBMODULES': {
        const res = await executor.exec(['submodule', 'update', '--remote', '--recursive']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Updated submodules to latest remote commits' : 'Failed to update submodules',
          error: res.stderr
        };
      }

      case 'SYNC_SUBMODULES': {
        const res = await executor.exec(['submodule', 'sync', '--recursive']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Synchronized submodule URLs' : 'Failed to sync submodules',
          error: res.stderr
        };
      }

      case 'LIST_WORKTREES': {
        const res = await executor.exec(['worktree', 'list']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Worktrees:\n${res.stdout}` : 'Failed to list worktrees',
          details: { output: res.stdout }
        };
      }

      case 'ADD_WORKTREE': {
        const workPath = action.path as string;
        const branch = action.branch as string;
        const args = branch ? ['worktree', 'add', workPath, branch] : ['worktree', 'add', workPath];
        const res = await executor.exec(args);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Created worktree at ${workPath}` : 'Failed to add worktree',
          error: res.stderr
        };
      }

      case 'REMOVE_WORKTREE': {
        const workPath = action.path as string;
        const res = await executor.exec(['worktree', 'remove', workPath]);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Removed worktree at ${workPath}` : 'Failed to remove worktree',
          error: res.stderr
        };
      }

      case 'PRUNE_WORKTREES': {
        const res = await executor.exec(['worktree', 'prune']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Pruned stale worktree entries' : 'Failed to prune worktrees',
          error: res.stderr
        };
      }

      case 'BISECT_START': {
        const res = await executor.exec(['bisect', 'start']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Started git bisect session' : 'Failed to start bisect',
          error: res.stderr
        };
      }

      case 'BISECT_GOOD': {
        const commit = (action.commit as string) || '';
        const args = commit ? ['bisect', 'good', commit] : ['bisect', 'good'];
        const res = await executor.exec(args);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Marked ${commit || 'current commit'} as good in bisect` : 'Failed to mark bisect good',
          details: { output: res.stdout }
        };
      }

      case 'BISECT_BAD': {
        const commit = (action.commit as string) || '';
        const args = commit ? ['bisect', 'bad', commit] : ['bisect', 'bad'];
        const res = await executor.exec(args);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Marked ${commit || 'current commit'} as bad in bisect` : 'Failed to mark bisect bad',
          details: { output: res.stdout }
        };
      }

      case 'BISECT_RESET': {
        const res = await executor.exec(['bisect', 'reset']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Reset bisect session and restored branch state' : 'Failed to reset bisect'
        };
      }

      case 'GC_CLEANUP': {
        const res = await executor.exec(['gc', '--prune=now']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Ran garbage collection and optimized repository storage' : 'Failed to run git gc',
          error: res.stderr
        };
      }

      case 'VERIFY_INTEGRITY': {
        const res = await executor.exec(['fsck', '--full']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? 'Verified repository object database integrity' : 'Repository integrity issue detected',
          details: { output: res.stdout }
        };
      }

      case 'GET_DIFF': {
        const target = (action.target as string) || (action.branch as string);
        const base = action.base as string;
        
        let args = ['diff', '--color=always'];
        if (base && target) {
          args.push(`${base}...${target}`);
        } else if (target) {
          args.push(target);
        }

        const res = await executor.exec(args);
        return {
          success: true,
          actionType: action.type,
          message: 'Retrieved working tree diff',
          details: { output: res.stdout }
        };
      }

      case 'GET_LOG':
      case 'LIST_COMMITS': {
        const count = (action.count as number) || 10;
        const res = await executor.exec(['log', `--max-count=${count}`, '--oneline', '--color=always']);
        return {
          success: true,
          actionType: action.type,
          message: 'Retrieved commit log',
          details: { output: res.stdout }
        };
      }

      case 'GET_SHOW': {
        const commit = (action.commit as string) || (action.hash as string) || 'HEAD';
        const res = await executor.exec(['show', commit]);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Retrieved commit details for ${commit}` : `Failed to show commit ${commit}`,
          details: { output: res.stdout }
        };
      }

      case 'GET_BLAME': {
        const file = (action.files as string[])?.[0] || (action.path as string);
        if (!file) return { success: false, actionType: action.type, message: 'No file specified for git blame', error: 'Missing file' };
        const res = await executor.exec(['blame', file]);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Blame for ${file}` : `Failed to blame ${file}`,
          details: { blame: res.stdout }
        };
      }

      case 'GET_SHORTLOG': {
        const res = await executor.exec(['shortlog', '-sn', 'HEAD']);
        return {
          success: res.success,
          actionType: action.type,
          message: res.success ? `Contributors:\n${res.stdout}` : 'Failed to retrieve shortlog'
        };
      }

      case 'GET_REFLOG': {
        const res = await executor.exec(['reflog', '-n', '15']);
        return {
          success: true,
          actionType: action.type,
          message: 'Retrieved reflog',
          details: { output: res.stdout }
        };
      }

      case 'LIST_BRANCHES': {
        const res = await executor.exec(['branch', '-a']);
        return {
          success: true,
          actionType: action.type,
          message: 'Retrieved branches list',
          details: { output: res.stdout }
        };
      }

      case 'LIST_REMOTES': {
        const res = await executor.exec(['remote', '-v']);
        return {
          success: true,
          actionType: action.type,
          message: 'Retrieved remotes list',
          details: { output: res.stdout }
        };
      }

      case 'LIST_TAGS': {
        const res = await executor.exec(['tag', '-l']);
        return {
          success: true,
          actionType: action.type,
          message: 'Retrieved tags list',
          details: { output: res.stdout }
        };
      }

      case 'LIST_STASHES': {
        const res = await executor.exec(['stash', 'list']);
        return {
          success: true,
          actionType: action.type,
          message: res.stdout.trim() || 'No stash entries found',
          details: { stashes: res.stdout }
        };
      }

      case 'EXPLAIN_STATUS':
      case 'GET_STATUS': {
        return {
          success: true,
          actionType: action.type,
          message: (action.summary as string) || 'Repository status evaluated'
        };
      }

      default:
        return {
          success: false,
          actionType: action.type,
          message: `Unsupported action type: ${action.type}`,
          error: 'Unsupported action'
        };
    }
  }

  /**
   * Helper to write or update .gitignore for a tech stack
   */
  private static async generateGitignore(ctx: ActionContext, techStack: string): Promise<boolean> {
    const gitignorePath = path.join(ctx.repoRoot, '.gitignore');
    const key = techStack.toLowerCase().includes('node')
      ? 'node'
      : techStack.toLowerCase().includes('python')
      ? 'python'
      : techStack.toLowerCase().includes('rust')
      ? 'rust'
      : techStack.toLowerCase().includes('go')
      ? 'go'
      : techStack.toLowerCase().includes('java')
      ? 'java'
      : techStack.toLowerCase().includes('net') || techStack.toLowerCase().includes('c#')
      ? 'csharp'
      : 'general';

    const template = GITIGNORE_TEMPLATES[key] || GITIGNORE_TEMPLATES.general;

    if (fs.existsSync(gitignorePath)) {
      const existing = fs.readFileSync(gitignorePath, 'utf-8');
      // Append only rules not already in .gitignore
      const missingRules: string[] = [];
      for (const line of template.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !existing.includes(trimmed)) {
          missingRules.push(trimmed);
        }
      }

      if (missingRules.length > 0) {
        fs.appendFileSync(gitignorePath, `\n# Added by GitGenie for ${techStack}\n${missingRules.join('\n')}\n`);
        return true;
      }
      return false;
    } else {
      fs.writeFileSync(gitignorePath, template, 'utf-8');
      return true;
    }
  }
}
