import { RepoContext } from '../git/repository-inspector.js';
import { ActionPayload } from '../security/policy-engine.js';

export interface AIPlanResponse {
  intent: string;
  summary: string;
  explanation?: string;
  actions: ActionPayload[];
}

export interface ConflictBlock {
  filePath: string;
  ours: string;
  theirs: string;
  base?: string;
}

export interface ConflictResolution {
  filePath: string;
  resolvedContent: string;
  explanation: string;
}

export interface AIErrorAnalysis {
  rootCause: string;
  explanation: string;
  recoverySummary: string;
  recoveryActions: ActionPayload[];
}

export interface AIProvider {
  readonly providerName: string;

  /**
   * Plan a git workflow based on natural language request and repository context
   */
  generatePlan(prompt: string, context: RepoContext, sessionContext?: import('../session/session-context.js').SessionContext): Promise<AIPlanResponse>;

  /**
   * Generate conventional commit message based on diff
   */
  generateCommitMessage(diff: string, context: RepoContext, userHint?: string): Promise<string>;

  /**
   * Resolve merge conflict in a file
   */
  resolveConflict(conflict: ConflictBlock, context: RepoContext): Promise<ConflictResolution>;

  /**
   * Explain an error and suggest resolution
   */
  explainError(errorMessage: string, context: RepoContext): Promise<{ reason: string; suggestion: string }>;

  /**
   * Dynamically analyze Git error output using AI and produce an executable recovery plan
   */
  analyzeError(errorMessage: string, failedAction: ActionPayload, context: RepoContext): Promise<AIErrorAnalysis>;

  /**
   * Summarize the output of a Git sync operation (pull, merge, rebase)
   */
  summarizeSync(output: string): Promise<string>;
}
