import { z } from 'zod';
import { AIPlanResponse } from './ai-provider.interface.js';
import { APPROVED_ACTIONS } from '../config/constants.js';

const ActionSchema = z.object({
  type: z.enum(APPROVED_ACTIONS as unknown as [string, ...string[]]),
  description: z.string().optional(),
  name: z.string().optional(),
  branchName: z.string().optional(),
  defaultBranch: z.string().optional(),
  generateGitignore: z.boolean().optional(),
  techStack: z.string().optional(),
  switch: z.boolean().optional(),
  oldName: z.string().optional(),
  newName: z.string().optional(),
  files: z.array(z.string()).optional(),
  message: z.string().optional(),
  remote: z.string().optional(),
  url: z.string().optional(),
  remoteUrl: z.string().optional(),
  branch: z.string().optional(),
  rebase: z.boolean().optional(),
  force: z.boolean().optional(),
  forceWithLease: z.boolean().optional(),
  setUpstream: z.boolean().optional(),
  target: z.string().optional(),
  mode: z.enum(['soft', 'mixed', 'hard']).optional(),
  commit: z.string().optional(),
  hash: z.string().optional(),
  index: z.union([z.number(), z.string()]).optional(),
  summary: z.string().optional()
}).passthrough();

const AIPlanSchema = z.object({
  intent: z.string(),
  summary: z.string(),
  explanation: z.string().optional(),
  actions: z.array(ActionSchema)
});

export class ResponseValidator {
  /**
   * Extract and parse JSON from LLM response text
   */
  static extractJSON(rawText: string): unknown {
    let clean = rawText.trim();

    // Strip markdown code fences if present (```json ... ``` or ``` ...)
    const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(clean);
    if (codeBlockMatch) {
      clean = codeBlockMatch[1].trim();
    } else {
      // Find first { and last }
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      }
    }

    try {
      return JSON.parse(clean);
    } catch (err) {
      throw new Error(`Failed to parse AI response as valid JSON: ${(err as Error).message}\nRaw response:\n${rawText.slice(0, 300)}`);
    }
  }

  /**
   * Validate and return typed AI plan
   */
  static validatePlan(rawOutput: string | unknown): AIPlanResponse {
    const parsed = typeof rawOutput === 'string' ? this.extractJSON(rawOutput) : rawOutput;
    const result = AIPlanSchema.safeParse(parsed);

    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`AI plan schema validation failed: ${issues}`);
    }

    return result.data as AIPlanResponse;
  }
}
