import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { GitExecutor } from '../../src/git/git-executor.js';
import { RepositoryInspector } from '../../src/git/repository-inspector.js';
import { WorkflowEngine } from '../../src/application/workflow-engine.js';
import { MockAIProvider } from '../../src/ai/mock-provider.js';
import { ConflictResolver } from '../../src/application/conflict-resolver.js';

describe.sequential('Git Sandbox Integration Tests', () => {
  const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gitgenie-sandbox-'));

  it('should initialize a repository and generate .gitignore for Node project', async () => {
    const tempDir = createTempDir();
    try {
      const executor = new GitExecutor(tempDir);
      const inspector = new RepositoryInspector(executor);
      const mockAi = new MockAIProvider();

      // Create a mock package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'sandbox-project', version: '1.0.0' }, null, 2)
      );

      const engine = new WorkflowEngine(mockAi, { cwd: tempDir, autoConfirm: true });
      const success = await engine.run('Initialize this project', { cwd: tempDir, autoConfirm: true });

      expect(success).toBe(true);

      // Verify git initialized
      const context = await inspector.inspect();
      expect(context.isRepo).toBe(true);
      expect(context.techStack).toContain('Node');

      // Verify .gitignore exists and contains node_modules
      const gitignorePath = path.join(tempDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      expect(gitignoreContent).toContain('node_modules/');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should create feature branch and commit changes', async () => {
    const tempDir = createTempDir();
    try {
      const executor = new GitExecutor(tempDir);
      const inspector = new RepositoryInspector(executor);
      const mockAi = new MockAIProvider();

      // Initialize repo
      await executor.exec(['init', '-b', 'main']);
      await executor.exec(['config', 'user.name', 'GitGenie Tester']);
      await executor.exec(['config', 'user.email', 'tester@gitgenie.ai']);

      // Create initial commit
      fs.writeFileSync(path.join(tempDir, 'app.js'), 'console.log("hello");');
      await executor.exec(['add', '.']);
      await executor.exec(['commit', '-m', 'chore: initial']);

      // Add modification
      fs.writeFileSync(path.join(tempDir, 'auth.js'), 'export const auth = () => true;');

      const engine = new WorkflowEngine(mockAi, { cwd: tempDir, autoConfirm: true });
      const success = await engine.run('Create a branch for auth, commit my changes', { cwd: tempDir, autoConfirm: true });

      expect(success).toBe(true);

      const context = await inspector.inspect();
      expect(context.currentBranch).toBe('feature/auth');
      expect(context.isClean).toBe(true);
      expect(context.recentCommits[0]).toContain('feat(auth)');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should abort auto-commit when secret file is detected', async () => {
    const tempDir = createTempDir();
    try {
      const executor = new GitExecutor(tempDir);
      const inspector = new RepositoryInspector(executor);
      const mockAi = new MockAIProvider();

      // Initialize repo
      await executor.exec(['init', '-b', 'main']);
      await executor.exec(['config', 'user.name', 'GitGenie Tester']);
      await executor.exec(['config', 'user.email', 'tester@gitgenie.ai']);

      // Create initial commit
      fs.writeFileSync(path.join(tempDir, 'app.js'), 'console.log("hello");');
      await executor.exec(['add', '.']);
      await executor.exec(['commit', '-m', 'chore: initial']);

      // Create a .env file with private API key
      fs.writeFileSync(path.join(tempDir, '.env'), 'OPENAI_API_KEY=sk-1234567890abcdef1234567890abcdef1234567890abcdef\n');

      const engine = new WorkflowEngine(mockAi, { cwd: tempDir, autoConfirm: true });
      const success = await engine.run('Commit all changes', { cwd: tempDir, autoConfirm: true });

      // Should abort commit due to secret detection
      expect(success).toBe(false);

      const context = await inspector.inspect();
      // Working tree should still be uncommitted / safe
      expect(context.isClean).toBe(false);
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should parse and resolve merge conflict markers', async () => {
    const tempDir = createTempDir();
    try {
      const executor = new GitExecutor(tempDir);
      const inspector = new RepositoryInspector(executor);
      const mockAi = new MockAIProvider();

      // Initialize repo
      await executor.exec(['init', '-b', 'main']);
      await executor.exec(['config', 'user.name', 'GitGenie Tester']);
      await executor.exec(['config', 'user.email', 'tester@gitgenie.ai']);

      const conflictedFile = path.join(tempDir, 'calculator.js');
      const conflictContent = `function add(a, b) {
<<<<<<< HEAD
  return a + b + 0;
=======
  // Updated add implementation
  return a + b;
>>>>>>> feature/math
}`;

      fs.writeFileSync(conflictedFile, conflictContent, 'utf-8');

      const resolver = new ConflictResolver(mockAi, executor);
      const parsed = ConflictResolver.parseConflictFile('calculator.js', conflictContent);

      expect(parsed.length).toBe(1);
      expect(parsed[0].ours).toContain('return a + b + 0;');
      expect(parsed[0].theirs).toContain('return a + b;');

      const context = await inspector.inspect();
      context.conflictedFiles = ['calculator.js'];
      context.hasConflicts = true;
      const resolved = await resolver.resolveAllConflicts(context, true);
      expect(resolved).toBe(true);

      // Verify conflict markers removed from disk
      const resolvedContent = fs.readFileSync(conflictedFile, 'utf-8');
      expect(resolvedContent).not.toContain('<<<<<<<');
      expect(resolvedContent).not.toContain('=======');
      expect(resolvedContent).not.toContain('>>>>>>>');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should connect a local repo to a remote repository URL', async () => {
    const tempDir = createTempDir();
    try {
      const executor = new GitExecutor(tempDir);
      const inspector = new RepositoryInspector(executor);
      const mockAi = new MockAIProvider();

      // Initialize repo
      await executor.exec(['init', '-b', 'main']);

      const engine = new WorkflowEngine(mockAi, { cwd: tempDir, autoConfirm: true });
      const success = await engine.run(
        'Connect this local repo to the remote repo https://github.com/Viper910/TestingGitGenie.git',
        { cwd: tempDir, autoConfirm: true }
      );

      expect(success).toBe(true);

      const context = await inspector.inspect();
      expect(context.remotes.length).toBeGreaterThanOrEqual(1);
      expect(context.remotes[0].name).toBe('origin');
      expect(context.remotes[0].url).toBe('https://github.com/Viper910/TestingGitGenie.git');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  });
});
