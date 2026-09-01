export const APP_NAME = 'GitGenie';
export const APP_VERSION = '1.0.0';
export const APP_TAGLINE = 'AI-Powered Git Automation CLI';

export const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-3.5-sonnet';
export const FALLBACK_OPENROUTER_MODEL = 'google/gemini-2.5-flash';

export const DEFAULT_TIMEOUT_MS = 45000;
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_BASE_MS = 1000;

export const APPROVED_ACTIONS = [
  // Repository Initialization & Cloning
  'INIT_REPOSITORY',
  'CLONE_REPOSITORY',
  'GENERATE_GITIGNORE',
  'GET_CONFIG',
  'SET_CONFIG',

  // Inspection, Status & Log
  'GET_STATUS',
  'GET_LOG',
  'GET_DIFF',
  'GET_SHOW',
  'GET_BLAME',
  'GET_SHORTLOG',
  'GET_REFLOG',
  'EXPLAIN_STATUS',
  'LIST_BRANCHES',
  'LIST_REMOTES',
  'LIST_TAGS',
  'LIST_STASHES',
  'LIST_COMMITS',

  // Branch Operations
  'CREATE_BRANCH',
  'SWITCH_BRANCH',
  'RENAME_BRANCH',
  'DELETE_BRANCH',
  'SET_UPSTREAM',

  // Staging & Working Tree Management
  'STAGE_FILES',
  'STAGE_ALL',
  'UNSTAGE_FILES',
  'RESTORE_FILES',
  'CLEAN_UNTRACKED',
  'DISCARD_ALL_CHANGES',

  // Commits & History Modification
  'CREATE_COMMIT',
  'AMEND_COMMIT',
  'REVERT_COMMIT',
  'RESET',
  'SQUASH_COMMITS',

  // Remotes & Network Sync
  'ADD_REMOTE',
  'SET_REMOTE',
  'RENAME_REMOTE',
  'REMOVE_REMOTE',
  'FETCH',
  'FETCH_PRUNE',
  'PULL',
  'PUSH',
  'PUSH_TAGS',
  'PRUNE_REMOTE_BRANCHES',

  // Merging, Rebasing & Cherry-Pick
  'MERGE',
  'ABORT_MERGE',
  'CONTINUE_MERGE',
  'REBASE',
  'ABORT_REBASE',
  'CONTINUE_REBASE',
  'CHERRY_PICK',
  'ABORT_CHERRY_PICK',
  'CONTINUE_CHERRY_PICK',
  'RESOLVE_CONFLICT',

  // Stashing
  'STASH',
  'APPLY_STASH',
  'POP_STASH',
  'DROP_STASH',
  'CLEAR_STASH',

  // Tags & Releases
  'CREATE_TAG',
  'DELETE_TAG',
  'DELETE_REMOTE_TAG',

  // Submodules
  'INIT_SUBMODULES',
  'ADD_SUBMODULE',
  'UPDATE_SUBMODULES',
  'SYNC_SUBMODULES',

  // Worktrees
  'LIST_WORKTREES',
  'ADD_WORKTREE',
  'REMOVE_WORKTREE',
  'PRUNE_WORKTREES',

  // Maintenance & Bisect
  'BISECT_START',
  'BISECT_GOOD',
  'BISECT_BAD',
  'BISECT_RESET',
  'GC_CLEANUP',
  'VERIFY_INTEGRITY'
] as const;

export type ActionType = (typeof APPROVED_ACTIONS)[number];

export const GITIGNORE_TEMPLATES: Record<string, string> = {
  node: `# Node / JavaScript / TypeScript
node_modules/
dist/
build/
.next/
out/
.nuxt/
.cache/
.env
.env.local
.env.*.local
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.DS_Store
Thumbs.db
coverage/
`,
  python: `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
.venv/
ENV/
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg
.pytest_cache/
.coverage
htmlcov/
.env
`,
  rust: `# Rust / Cargo
/target
Cargo.lock
**/*.rs.bk
*.pdb
.env
`,
  go: `# Go
bin/
pkg/
vendor/
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
.env
`,
  java: `# Java / Maven / Gradle
target/
*.class
*.jar
*.war
*.ear
*.nar
.gradle/
build/
out/
.idea/
*.iml
.project
.classpath
.settings/
.env
`,
  csharp: `# .NET / C#
bin/
obj/
*.user
*.suo
*.userosscache
*.sln.docstates
.vs/
.env
`,
  general: `# General
.env
.env.local
.env.*.local
*.pem
*.key
*.cert
*.crt
*.log
.DS_Store
Thumbs.db
`
};
