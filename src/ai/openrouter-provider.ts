import { AIProvider, AIPlanResponse, ConflictBlock, ConflictResolution, AIErrorAnalysis } from './ai-provider.interface.js';
import { RepoContext } from '../git/repository-inspector.js';
import { PromptBuilder } from './prompt-builder.js';
import { ResponseValidator } from './response-validator.js';
import { logger } from '../terminal/logger.js';
import { DEFAULT_OPENROUTER_MODEL, FALLBACK_OPENROUTER_MODEL, DEFAULT_TIMEOUT_MS, MAX_RETRY_ATTEMPTS, RETRY_BACKOFF_BASE_MS, APPROVED_ACTIONS } from '../config/constants.js';
import { ActionPayload } from '../security/policy-engine.js';
import { GitExecutor } from '../git/git-executor.js';

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

export class OpenRouterProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  get providerName(): string {
    return `OpenRouter (${this.model})`;
  }

  constructor(config: OpenRouterConfig) {
    if (!config.apiKey || !config.apiKey.trim()) {
      throw new Error(
        'OpenRouter API key is missing. Please set OPENROUTER_API_KEY environment variable or run `gitgenie config set api-key <key>`.'
      );
    }
    this.apiKey = config.apiKey.trim();
    this.model = config.model || DEFAULT_OPENROUTER_MODEL;
    this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  /**
   * Plan git workflow using OpenRouter LLM
   */
  async generatePlan(prompt: string, context: RepoContext, sessionContext?: import('../session/session-context.js').SessionContext): Promise<AIPlanResponse> {
    const systemPrompt = PromptBuilder.buildSystemPrompt();
    const userPrompt = PromptBuilder.buildUserPrompt(prompt, context, sessionContext);

    const responseText = await this.callChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    return ResponseValidator.validatePlan(responseText);
  }

  /**
   * Generate conventional commit message
   */
  async generateCommitMessage(diff: string, context: RepoContext, userHint?: string): Promise<string> {
    const systemPrompt = `You are an expert Git commit author. You follow the Conventional Commits specification (e.g. feat(scope): subject, fix(scope): subject, chore: subject, refactor(scope): subject).
Output ONLY the single-line commit message. No explanations, no markdown quotes.`;

    const userPrompt = `Given the following Git diff and context, produce a concise, professional Conventional Commit message:
${userHint ? `Developer Hint: ${userHint}\n` : ''}
Branch: ${context.currentBranch || 'main'}
Diff:
${diff.slice(0, 4000)}`;

    const res = await this.callChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // Clean up output
    return res.trim().replace(/^["']|["']$/g, '').split('\n')[0];
  }

  /**
   * Resolve merge conflict in a file
   */
  async resolveConflict(conflict: ConflictBlock, context: RepoContext): Promise<ConflictResolution> {
    const systemPrompt = `You are an expert Git conflict resolution engine.
Given the conflicting sections from OUR branch and THEIR branch for a file, produce the optimal, reconciled resolution code.
Output ONLY a JSON object:
{
  "resolvedContent": "<complete resolved code section without any conflict markers>",
  "explanation": "<short explanation of how differences were reconciled>"
}`;

    const userPrompt = `File: ${conflict.filePath}
--- OUR VERSION (Current Branch) ---
${conflict.ours}

--- THEIR VERSION (Incoming Branch) ---
${conflict.theirs}
${conflict.base ? `\n--- BASE VERSION ---\n${conflict.base}` : ''}`;

    const res = await this.callChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const parsed = ResponseValidator.extractJSON(res) as { resolvedContent: string; explanation: string };
    return {
      filePath: conflict.filePath,
      resolvedContent: parsed.resolvedContent,
      explanation: parsed.explanation || 'Reconciled branch changes'
    };
  }

  /**
   * Explain an error and suggest resolution
   */
  async explainError(errorMessage: string, context: RepoContext): Promise<{ reason: string; suggestion: string }> {
    const systemPrompt = `You are a helpful Git assistant. Explain the following Git error concisely and suggest the single best next action.
Output ONLY a JSON object:
{
  "reason": "Clear explanation in plain developer English",
  "suggestion": "Recommended command or step to fix"
}`;

    const userPrompt = `Error:
${errorMessage}

Context:
Branch: ${context.currentBranch || 'unknown'}
Working tree clean: ${context.isClean}`;

    try {
      const res = await this.callChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      return ResponseValidator.extractJSON(res) as { reason: string; suggestion: string };
    } catch {
      return {
        reason: errorMessage,
        suggestion: 'Check repository status and verify permissions.'
      };
    }
  }

  /**
   * Dynamically analyze Git error output using AI LLM and formulate an executable recovery plan
   */
  async analyzeError(errorMessage: string, failedAction: ActionPayload, context: RepoContext): Promise<AIErrorAnalysis> {
    const systemPrompt = `You are GitGenie's intelligent AI diagnostic and recovery engine.
A Git command just failed during repository automation.
Your task is to:
1. Deeply analyze the error output (stderr) and repository context.
2. Explain the root cause in clear developer terms.
3. Formulate a minimal, safe, ordered JSON recovery plan using ONLY actions from the Approved Action Registry to resolve the error and successfully complete the developer's intent.

APPROVED ACTIONS:
${APPROVED_ACTIONS.map(a => `   - ${a}`).join('\n')}

Common Fix Patterns:
- If GitHub HTTPS auth failed (terminal prompts disabled): If remote is https://github.com/owner/repo.git, propose SET_REMOTE with SSH url git@github.com:owner/repo.git or SET_CONFIG for credential.helper, then retry PUSH.
- If non-fast-forward push rejected: Propose PULL (with rebase: true) then retry PUSH.
- If no upstream tracking: Propose PUSH with setUpstream: true.
- If index.lock exists: Propose minimal recovery steps.
- If uncommitted changes block pull: Propose STASH, PULL, then POP_STASH.

Output ONLY a valid JSON object matching this schema:
{
  "rootCause": "Clear explanation of why this error happened",
  "explanation": "How the recovery plan resolves this issue",
  "recoverySummary": "Short action title (e.g. 'Switch remote to SSH and push' or 'Pull remote changes with rebase and retry push')",
  "recoveryActions": [
    {
      "type": "ACTION_TYPE",
      "description": "Short description of this step",
      ...action parameters
    }
  ]
}`;

    const userPrompt = `FAILED ACTION:
Type: ${failedAction.type}
Parameters: ${JSON.stringify(failedAction, null, 2)}

GIT ERROR OUTPUT (STDERR):
${errorMessage}

REPOSITORY CONTEXT:
- Branch: ${context.currentBranch || 'unknown'}
- Working tree clean: ${context.isClean}
- Remotes: ${context.remotes.map(r => `${r.name} -> ${r.url}`).join(', ') || 'none'}
- Staged count: ${context.stagedCount}
- Unstaged count: ${context.unstagedCount}
- Ahead: ${context.ahead} | Behind: ${context.behind}

Please provide the AI diagnosis and recovery plan:`;

    try {
      const res = await this.callChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      const parsed = ResponseValidator.extractJSON(res) as {
        rootCause?: string;
        explanation?: string;
        recoverySummary?: string;
        recoveryActions?: ActionPayload[];
      };

      return {
        rootCause: parsed.rootCause || errorMessage,
        explanation: parsed.explanation || 'Proposed AI recovery steps to resolve this failure.',
        recoverySummary: parsed.recoverySummary || 'AI Recovery Plan',
        recoveryActions: Array.isArray(parsed.recoveryActions) ? parsed.recoveryActions : []
      };
    } catch (err) {
      logger.debug('AI error analysis failed, using fallback:', err);
      const fallbackDiag = GitExecutor.diagnoseError(errorMessage, context.remotes[0]?.url);
      const fallbackActions: ActionPayload[] = [];
      if (fallbackDiag.recoveryActions.length > 0) {
        const first = fallbackDiag.recoveryActions[0];
        if (first.type === 'SWITCH_TO_SSH' && first.payload?.sshUrl) {
          fallbackActions.push({
            type: 'SET_REMOTE',
            name: (failedAction.remote as string) || 'origin',
            url: first.payload.sshUrl as string,
            description: `Switch remote origin to SSH (${first.payload.sshUrl})`
          });
          fallbackActions.push(failedAction);
        } else if (first.type === 'PULL_REBASE') {
          fallbackActions.push({
            type: 'PULL',
            remote: (failedAction.remote as string) || 'origin',
            branch: (failedAction.branch as string) || context.currentBranch || 'main',
            rebase: true,
            description: 'Pull remote changes with rebase'
          });
          fallbackActions.push(failedAction);
        } else if (first.type === 'SET_UPSTREAM_PUSH') {
          fallbackActions.push({
            type: 'PUSH',
            remote: (failedAction.remote as string) || 'origin',
            branch: (failedAction.branch as string) || context.currentBranch || 'main',
            setUpstream: true,
            description: 'Push with upstream tracking'
          });
        }
      }

      return {
        rootCause: fallbackDiag.reason,
        explanation: fallbackDiag.suggestion,
        recoverySummary: fallbackDiag.recoveryActions[0]?.title || 'Git Error Recovery',
        recoveryActions: fallbackActions
      };
    }
  }

  /**
   * Summarize the output of a Git sync operation (pull, merge, rebase)
   */
  async summarizeSync(output: string): Promise<string> {
    const systemPrompt = `You are GitGenie. Summarize the following Git sync output in 1-2 concise sentences, focusing on what was changed.
Output ONLY a JSON object:
{
  "summary": "<the concise summary string>"
}`;
    const userPrompt = `GIT OUTPUT:\n${output.slice(0, 4000)}`;
    
    try {
      const res = await this.callChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      const parsed = ResponseValidator.extractJSON(res) as { summary: string };
      return parsed.summary || output;
    } catch (err) {
      logger.debug('AI summarizeSync failed:', err);
      return output; // Fallback to raw output
    }
  }

  /**
   * Core HTTP request handler with backoff and retry
   */
  private async callChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    let attempt = 0;
    let lastError: Error | null = null;
    let currentModel = this.model;

    while (attempt < MAX_RETRY_ATTEMPTS) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        logger.debug(`Calling OpenRouter API (Model: ${currentModel}, Attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com/GitGenie/gitgenie',
            'X-Title': 'GitGenie Terminal Assistant',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: currentModel,
            messages,
            temperature: 0.1,
            response_format: { type: 'json_object' }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          logger.warn(`OpenRouter rate limit encountered (429). Retrying in ${RETRY_BACKOFF_BASE_MS * attempt}ms...`);
          await new Promise(r => setTimeout(r, RETRY_BACKOFF_BASE_MS * attempt));
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid OpenRouter API Key. Please verify your OPENROUTER_API_KEY environment variable.');
        }

        if (!response.ok) {
          const errBody = await response.text();
          logger.debug(`OpenRouter HTTP ${response.status}: ${errBody}`);

          // Try fallback model if primary model fails
          if (attempt === 1 && currentModel !== FALLBACK_OPENROUTER_MODEL) {
            logger.warn(`Model ${currentModel} returned error. Trying fallback model ${FALLBACK_OPENROUTER_MODEL}...`);
            currentModel = FALLBACK_OPENROUTER_MODEL;
            continue;
          }

          throw new Error(`OpenRouter API error (HTTP ${response.status}): ${errBody.slice(0, 150)}`);
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('Received empty response payload from OpenRouter AI model.');
        }

        return content;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err as Error;

        if ((err as Error).name === 'AbortError') {
          throw new Error(`OpenRouter request timed out after ${this.timeoutMs / 1000}s.`);
        }

        if (attempt < MAX_RETRY_ATTEMPTS) {
          const backoff = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
          logger.debug(`Request failed: ${(err as Error).message}. Retrying in ${backoff}ms...`);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }

    throw lastError || new Error('Failed to connect to OpenRouter AI gateway.');
  }
}
