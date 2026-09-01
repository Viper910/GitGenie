import fs from 'fs';
import path from 'path';
import { GitExecutor } from './git-executor.js';
import { logger } from '../terminal/logger.js';

export interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  staged: boolean;
}

export interface RemoteInfo {
  name: string;
  url: string;
  type: 'fetch' | 'push';
}

export interface RepoContext {
  isRepo: boolean;
  repoRoot?: string;
  currentBranch?: string;
  isClean: boolean;
  changes: FileChange[];
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  ahead: number;
  behind: number;
  hasConflicts: boolean;
  conflictedFiles: string[];
  remotes: RemoteInfo[];
  techStack?: string;
  recentCommits: string[];
  diffSummary?: string;
  hasGitignore: boolean;
}

export class RepositoryInspector {
  private executor: GitExecutor;

  constructor(executor?: GitExecutor) {
    this.executor = executor || new GitExecutor();
  }

  /**
   * Complete inspection of repository state
   */
  async inspect(cwd?: string): Promise<RepoContext> {
    if (cwd) {
      this.executor.setCwd(cwd);
    }
    const currentCwd = this.executor.getCwd();

    // 1. Check if git repo (fast check for .git before running git process)
    const hasGitDir = fs.existsSync(path.join(currentCwd, '.git'));
    let isRepo = false;
    if (hasGitDir) {
      const isRepoRes = await this.executor.exec(['rev-parse', '--is-inside-work-tree'], { ignoreErrors: true, timeoutMs: 3000 });
      isRepo = isRepoRes.success && isRepoRes.stdout.trim() === 'true';
    }

    const techStack = this.detectTechStack(currentCwd);
    const hasGitignore = fs.existsSync(path.join(currentCwd, '.gitignore'));

    if (!isRepo) {
      return {
        isRepo: false,
        isClean: true,
        changes: [],
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        ahead: 0,
        behind: 0,
        hasConflicts: false,
        conflictedFiles: [],
        remotes: [],
        techStack,
        recentCommits: [],
        hasGitignore
      };
    }

    // 2. Get repo root
    const rootRes = await this.executor.exec(['rev-parse', '--show-toplevel'], { ignoreErrors: true });
    const repoRoot = rootRes.success ? rootRes.stdout.trim() : currentCwd;

    // Check if repo has any commits yet
    const hasCommitsRes = await this.executor.exec(['rev-parse', '--verify', 'HEAD'], { ignoreErrors: true });
    const hasCommits = hasCommitsRes.success;

    // 3. Get current branch
    const branchRes = await this.executor.exec(['branch', '--show-current'], { ignoreErrors: true });
    let currentBranch = branchRes.stdout.trim();
    if (!currentBranch) {
      if (hasCommits) {
        const headRes = await this.executor.exec(['rev-parse', '--short', 'HEAD'], { ignoreErrors: true });
        currentBranch = headRes.success ? `HEAD (${headRes.stdout.trim()})` : 'main';
      } else {
        currentBranch = 'main (initial)';
      }
    }

    // 4. Get status changes
    const statusRes = await this.executor.exec(['status', '--porcelain=v1', '-uall'], { ignoreErrors: true });
    const changes: FileChange[] = [];
    const conflictedFiles: string[] = [];

    let stagedCount = 0;
    let unstagedCount = 0;
    let untrackedCount = 0;

    if (statusRes.success && statusRes.stdout) {
      const lines = statusRes.stdout.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const x = line[0];
        const y = line[1];
        const filePath = line.slice(3).trim();

        const isConflict = (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D'));

        if (isConflict) {
          conflictedFiles.push(filePath);
          changes.push({ path: filePath, status: 'conflicted', staged: false });
        } else if (x === '?' && y === '?') {
          untrackedCount++;
          changes.push({ path: filePath, status: 'untracked', staged: false });
        } else {
          if (x !== ' ' && x !== '?') {
            stagedCount++;
            changes.push({
              path: filePath,
              status: x === 'A' ? 'added' : x === 'D' ? 'deleted' : x === 'R' ? 'renamed' : 'modified',
              staged: true
            });
          }
          if (y !== ' ' && y !== '?') {
            unstagedCount++;
            changes.push({
              path: filePath,
              status: y === 'D' ? 'deleted' : 'modified',
              staged: false
            });
          }
        }
      }
    }

    // 5. Ahead / Behind calculation (only if commits exist)
    let ahead = 0;
    let behind = 0;
    if (hasCommits) {
      const countRes = await this.executor.exec(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], { ignoreErrors: true });
      if (countRes.success && countRes.stdout) {
        const parts = countRes.stdout.trim().split(/\s+/);
        if (parts.length >= 2) {
          ahead = parseInt(parts[0], 10) || 0;
          behind = parseInt(parts[1], 10) || 0;
        }
      }
    }

    // 6. Remotes
    const remotes: RemoteInfo[] = [];
    const remoteRes = await this.executor.exec(['remote', '-v'], { ignoreErrors: true });
    if (remoteRes.success && remoteRes.stdout) {
      const rLines = remoteRes.stdout.split('\n');
      for (const rLine of rLines) {
        const match = /^([^\s]+)\s+([^\s]+)\s+\((fetch|push)\)$/.exec(rLine.trim());
        if (match) {
          remotes.push({
            name: match[1],
            url: match[2],
            type: match[3] as 'fetch' | 'push'
          });
        }
      }
    }

    // 7. Recent commits
    let recentCommits: string[] = [];
    if (hasCommits) {
      const logRes = await this.executor.exec(['log', '-n', '5', '--oneline'], { ignoreErrors: true });
      if (logRes.success && logRes.stdout) {
        recentCommits = logRes.stdout.split('\n').filter(Boolean);
      }
    }

    // 8. Diff summary
    let diffSummary = '';
    if (hasCommits || changes.length > 0) {
      const diffRes = await this.executor.exec(['diff', '--stat'], { ignoreErrors: true });
      const cachedDiffRes = await this.executor.exec(['diff', '--cached', '--stat'], { ignoreErrors: true });
      diffSummary = [diffRes.stdout, cachedDiffRes.stdout].filter(Boolean).join('\n');
    }

    return {
      isRepo: true,
      repoRoot,
      currentBranch,
      isClean: changes.length === 0,
      changes,
      stagedCount,
      unstagedCount,
      untrackedCount,
      ahead,
      behind,
      hasConflicts: conflictedFiles.length > 0,
      conflictedFiles,
      remotes,
      techStack,
      recentCommits,
      diffSummary,
      hasGitignore
    };
  }

  /**
   * Detect tech stack from project manifest files
   */
  detectTechStack(dir: string): string | undefined {
    try {
      if (fs.existsSync(path.join(dir, 'package.json'))) return 'Node.js / TypeScript';
      if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return 'Rust';
      if (fs.existsSync(path.join(dir, 'requirements.txt')) || fs.existsSync(path.join(dir, 'pyproject.toml'))) return 'Python';
      if (fs.existsSync(path.join(dir, 'go.mod'))) return 'Go';
      if (fs.existsSync(path.join(dir, 'pom.xml')) || fs.existsSync(path.join(dir, 'build.gradle'))) return 'Java';
      if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) return 'Flutter / Dart';
      const files = fs.readdirSync(dir);
      if (files.some(f => f.endsWith('.csproj') || f.endsWith('.sln'))) return '.NET / C#';
    } catch {
      // Ignore read errors
    }
    return undefined;
  }
}
