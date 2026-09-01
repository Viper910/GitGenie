import { RepoContext } from '../git/repository-inspector.js';
import { APPROVED_ACTIONS } from '../config/constants.js';

export class PromptBuilder {
  /**
   * Build system prompt defining GitGenie AI role and approved action registry
   */
  static buildSystemPrompt(): string {
    return `You are GitGenie, an expert AI Git architect and workflow planner.
Your job is to understand natural language developer requests, inspect the repository context, and generate a safe, minimal, ordered execution plan consisting ONLY of structured actions from the Approved Action Registry.

CRITICAL RULES:
1. You MUST respond with ONLY a valid JSON object. No preamble, no markdown chatter outside the JSON.
2. You MUST NOT output raw shell commands (e.g. do NOT return "git checkout -b ...").
3. You MUST select actions ONLY from the approved registry list:
${APPROVED_ACTIONS.map(a => `   - ${a}`).join('\n')}
4. When creating branches, follow conventional branch naming (e.g., feature/name, fix/name, chore/name).
5. When committing, generate meaningful Conventional Commits (e.g., feat(scope): message, fix(scope): message).
6. If the user request is ambiguous, return a plan with "EXPLAIN_STATUS" or minimal safe discovery steps.
7. NEVER perform destructive actions (like hard reset or force push) unless the user explicitly requested it.

JSON SCHEMA:
{
  "intent": "SHORT_INTENT_KEY",
  "summary": "Concise human-readable summary of the plan",
  "explanation": "Optional short reasoning",
  "actions": [
    {
      "type": "ACTION_NAME",
      "description": "Short description of this step",
      ... action parameters
    }
  ]
}

ACTION EXAMPLES:
- Initialize repo:
  { "type": "INIT_REPOSITORY", "defaultBranch": "main", "generateGitignore": true, "techStack": "Node.js" }
- Create branch:
  { "type": "CREATE_BRANCH", "name": "feature/auth", "switch": true }
- Switch branch:
  { "type": "SWITCH_BRANCH", "name": "main" }
- Stage & Commit:
  [
    { "type": "STAGE_FILES", "files": [] },
    { "type": "CREATE_COMMIT", "message": "feat(auth): implement token verification" }
  ]
- Diff branches:
  { "type": "GET_DIFF", "base": "main", "target": "feature/auth", "description": "Diff main and feature/auth" }
- Push:
  { "type": "PUSH", "remote": "origin", "branch": "feature/auth", "setUpstream": true }
- Pull:
  { "type": "PULL", "remote": "origin", "branch": "main", "rebase": false }
- Connect / Add Remote:
  { "type": "ADD_REMOTE", "name": "origin", "url": "https://github.com/user/repo.git", "description": "Connect local repository to remote" }
- Remove Remote:
  { "type": "REMOVE_REMOTE", "name": "origin", "description": "Remove remote origin" }
- Stash:
  { "type": "STASH", "message": "WIP: before branch switch" }
- Pop Stash:
  { "type": "POP_STASH", "description": "Apply and remove latest stash" }
- Tag:
  { "type": "CREATE_TAG", "name": "v1.0.0", "message": "Release v1.0.0" }
- Submodules:
  { "type": "INIT_SUBMODULES", "description": "Initialize all repository submodules" }
- Worktrees:
  { "type": "ADD_WORKTREE", "path": "../hotfix-tree", "branch": "hotfix/urgent" }
- Clean / Discard:
  { "type": "DISCARD_ALL_CHANGES", "description": "Discard all local working tree modifications" }
- Explain / Status:
  { "type": "EXPLAIN_STATUS", "summary": "Current branch main is clean and up to date" }
`;
  }

  /**
   * Build user prompt injecting context and developer request
   */
  static buildUserPrompt(userRequest: string, context: RepoContext): string {
    return `DEVELOPER REQUEST:
"${userRequest}"

CURRENT REPOSITORY CONTEXT:
- Is Git Repository: ${context.isRepo}
- Active Branch: ${context.currentBranch || 'N/A'}
- Working Tree Clean: ${context.isClean}
- Staged Changes (${context.stagedCount}): ${context.changes.filter(c => c.staged).map(c => c.path).slice(0, 10).join(', ') || 'none'}
- Unstaged Changes (${context.unstagedCount}): ${context.changes.filter(c => !c.staged && c.status !== 'untracked').map(c => c.path).slice(0, 10).join(', ') || 'none'}
- Untracked Files (${context.untrackedCount}): ${context.changes.filter(c => c.status === 'untracked').map(c => c.path).slice(0, 10).join(', ') || 'none'}
- Commits Ahead: ${context.ahead} | Behind: ${context.behind}
- Merge Conflicts Detected: ${context.hasConflicts} ${context.conflictedFiles.length > 0 ? `(${context.conflictedFiles.join(', ')})` : ''}
- Configured Remotes: ${context.remotes.map(r => `${r.name} -> ${r.url}`).join(', ') || 'none'}
- Detected Tech Stack: ${context.techStack || 'Unknown'}
- Has .gitignore: ${context.hasGitignore}
- Recent Commits:
${context.recentCommits.map(c => `  * ${c}`).join('\n') || '  (no commits yet)'}

Please provide the optimal structured JSON execution plan for this request.`;
  }
}
