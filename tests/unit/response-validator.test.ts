import { describe, it, expect } from 'vitest';
import { ResponseValidator } from '../../src/ai/response-validator.js';

describe('ResponseValidator', () => {
  it('should validate clean JSON plan from AI', () => {
    const raw = JSON.stringify({
      intent: 'CREATE_FEATURE',
      summary: 'Create feature branch for payments',
      actions: [
        { type: 'CREATE_BRANCH', name: 'feature/payments', switch: true }
      ]
    });

    const plan = ResponseValidator.validatePlan(raw);
    expect(plan.intent).toBe('CREATE_FEATURE');
    expect(plan.actions.length).toBe(1);
    expect(plan.actions[0].type).toBe('CREATE_BRANCH');
  });

  it('should parse JSON enclosed in markdown code fences', () => {
    const markdown = `
Here is the execution plan for your request:
\`\`\`json
{
  "intent": "COMMIT_WORK",
  "summary": "Stage changes and commit",
  "actions": [
    { "type": "STAGE_FILES", "files": [] },
    { "type": "CREATE_COMMIT", "message": "feat(auth): add JWT validator" }
  ]
}
\`\`\`
Hope this helps!
`;

    const plan = ResponseValidator.validatePlan(markdown);
    expect(plan.intent).toBe('COMMIT_WORK');
    expect(plan.actions.length).toBe(2);
    expect(plan.actions[1].type).toBe('CREATE_COMMIT');
  });

  it('should throw error when action type is unapproved', () => {
    const invalid = JSON.stringify({
      intent: 'ATTACK',
      summary: 'Run dangerous code',
      actions: [
        { type: 'EXECUTE_BASH_SCRIPT', command: 'echo pwned' }
      ]
    });

    expect(() => ResponseValidator.validatePlan(invalid)).toThrow(/validation failed/i);
  });
});
