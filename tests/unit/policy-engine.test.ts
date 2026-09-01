import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../src/security/policy-engine.js';

describe('PolicyEngine', () => {
  it('should allow safe actions without prompt', () => {
    const safeActions = [
      { type: 'CREATE_BRANCH' as const, name: 'feature/auth' },
      { type: 'STAGE_FILES' as const, files: ['src/app.ts'] },
      { type: 'CREATE_COMMIT' as const, message: 'feat: add login' },
      { type: 'PUSH' as const, remote: 'origin', branch: 'main', force: false },
      { type: 'SWITCH_BRANCH' as const, name: 'main' }
    ];

    for (const action of safeActions) {
      const evaluation = PolicyEngine.evaluateAction(action);
      expect(evaluation.isAllowed).toBe(true);
      expect(evaluation.requiresPrompt).toBe(false);
      expect(evaluation.level).toBe('SAFE');
    }
  });

  it('should flag destructive operations for confirmation', () => {
    // 1. Force push
    const forcePush = PolicyEngine.evaluateAction({
      type: 'PUSH',
      remote: 'origin',
      branch: 'main',
      force: true
    });
    expect(forcePush.level).toBe('DESTRUCTIVE');
    expect(forcePush.requiresPrompt).toBe(true);

    // 2. Hard reset
    const hardReset = PolicyEngine.evaluateAction({
      type: 'RESET',
      mode: 'hard',
      target: 'HEAD~1'
    });
    expect(hardReset.level).toBe('DESTRUCTIVE');
    expect(hardReset.requiresPrompt).toBe(true);

    // 3. Delete branch
    const deleteBranch = PolicyEngine.evaluateAction({
      type: 'DELETE_BRANCH',
      name: 'feature/old'
    });
    expect(deleteBranch.level).toBe('DESTRUCTIVE');
    expect(deleteBranch.requiresPrompt).toBe(true);
  });

  it('should block unapproved actions', () => {
    const blocked = PolicyEngine.evaluateAction({
      type: 'RUN_ARBITRARY_COMMAND' as any,
      command: 'rm -rf /'
    });
    expect(blocked.isAllowed).toBe(false);
    expect(blocked.level).toBe('BLOCKED');
  });

  it('should block shell injection payloads in arguments', () => {
    const injectionAction = PolicyEngine.evaluateAction({
      type: 'CREATE_BRANCH',
      name: 'feature/auth; cat /etc/passwd'
    });
    expect(injectionAction.isAllowed).toBe(false);
    expect(injectionAction.level).toBe('BLOCKED');
  });

  it('should allow natural language punctuation in summary and message fields', () => {
    const explainAction = PolicyEngine.evaluateAction({
      type: 'EXPLAIN_STATUS',
      summary: 'No commits exist; working tree has untracked .gitignore. Nothing to push until committed.'
    });
    expect(explainAction.isAllowed).toBe(true);
    expect(explainAction.level).toBe('SAFE');

    const commitAction = PolicyEngine.evaluateAction({
      type: 'CREATE_COMMIT',
      message: 'feat(core): support $vars & options; close issue'
    });
    expect(commitAction.isAllowed).toBe(true);
    expect(commitAction.level).toBe('SAFE');
  });
});
