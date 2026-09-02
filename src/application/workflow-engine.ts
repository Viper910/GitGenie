import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import { AIProvider } from '../ai/ai-provider.interface.js';
import { RepositoryInspector, RepoContext } from '../git/repository-inspector.js';
import { GitExecutor, GitErrorDiagnosis, GitRecoveryAction } from '../git/git-executor.js';
import { GitActions, ActionContext } from '../git/git-actions.js';
import { SecretDetector } from '../security/secret-detector.js';
import { PolicyEngine, ActionPayload } from '../security/policy-engine.js';
import { ConfirmationManager } from '../security/confirmation-manager.js';
import { ConflictResolver } from './conflict-resolver.js';
import { TerminalRenderer } from '../terminal/renderer.js';
import { NeonProgress } from '../terminal/progress.js';
import { theme } from '../terminal/theme.js';
import { Pager } from '../terminal/pager.js';
import { logger } from '../terminal/logger.js';

export interface WorkflowOptions {
  cwd?: string;
  dryRun?: boolean;
  autoConfirm?: boolean;
  verbose?: boolean;
  sessionContext?: import('../session/session-context.js').SessionContext;
}

export class WorkflowEngine {
  private aiProvider: AIProvider;
  private executor: GitExecutor;
  private inspector: RepositoryInspector;
  private conflictResolver: ConflictResolver;
  private defaultOptions: WorkflowOptions;

  constructor(aiProvider: AIProvider, options?: WorkflowOptions) {
    this.aiProvider = aiProvider;
    this.defaultOptions = options || {};
    this.executor = new GitExecutor(options?.cwd || process.cwd());
    this.inspector = new RepositoryInspector(this.executor);
    this.conflictResolver = new ConflictResolver(this.aiProvider, this.executor);
  }

  /**
   * Run the complete 5-phase GitGenie workflow
   */
  async run(userRequest: string, options?: WorkflowOptions): Promise<boolean> {
    const progress = new NeonProgress();
    const mergedOptions: WorkflowOptions = { ...this.defaultOptions, ...options };
    const dryRun = Boolean(mergedOptions.dryRun);
    const autoConfirm = Boolean(mergedOptions.autoConfirm);
    const isInteractive = !autoConfirm && Boolean(process.stdout.isTTY) && !process.env.VITEST && process.env.NODE_ENV !== 'test';

    if (mergedOptions.cwd) {
      this.executor.setCwd(mergedOptions.cwd);
    }

    // ==========================================
    // PHASE 1 — RECEIVE REQUEST
    // ==========================================
    console.log(`\n${theme.cyanBold(`${theme.symbols.lightning} GitGenie`)} is analyzing your request: "${theme.whiteBold(userRequest)}"\n`);

    // ==========================================
    // PHASE 2 — INSPECT REPOSITORY & SECRETS
    // ==========================================
    progress.start('Inspecting repository and project structure...');
    await NeonProgress.delay(100);

    const context = await this.inspector.inspect();
    progress.succeed('Repository inspected');

    TerminalRenderer.renderInspection({
      isRepo: context.isRepo,
      branch: context.currentBranch,
      clean: context.isClean,
      stagedCount: context.stagedCount,
      unstagedCount: context.unstagedCount,
      untrackedCount: context.untrackedCount,
      ahead: context.ahead,
      behind: context.behind,
      hasConflicts: context.hasConflicts,
      techStack: context.techStack
    });

    // Secret Protection Scan
    if (context.isRepo && context.changes.length > 0) {
      const filesToScan: Array<{ path: string; content?: string }> = [];
      const repoRoot = context.repoRoot || this.executor.getCwd();

      for (const change of context.changes) {
        const fullPath = path.join(repoRoot, change.path);
        let content: string | undefined;
        try {
          if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath);
            if (stat.size < 500000) { // Only read files < 500KB for secret check
              content = fs.readFileSync(fullPath, 'utf-8');
            }
          }
        } catch {
          // Skip unreadable files
        }
        filesToScan.push({ path: change.path, content });
      }

      const detectedSecrets = SecretDetector.scanFiles(filesToScan);
      if (detectedSecrets.length > 0) {
        TerminalRenderer.renderSecretAlert(detectedSecrets);

        // If user prompt was about committing, block automatic commit without user intervention
        if (userRequest.toLowerCase().includes('commit') || userRequest.toLowerCase().includes('push')) {
          console.log(theme.yellowBold(`${theme.symbols.warning} Automatic commit aborted to prevent secret leakage.`));
          console.log(theme.gray('Please add sensitive files to .gitignore or remove credentials before proceeding.\n'));
          return false;
        }
      }
    }

    // Check for merge conflicts request
    if (context.hasConflicts || userRequest.toLowerCase().includes('conflict')) {
      const resolved = await this.conflictResolver.resolveAllConflicts(context, autoConfirm);
      if (resolved) {
        console.log(theme.greenBold(`${theme.symbols.check} All merge conflicts resolved and staged.`));
      }
      return resolved;
    }

    // ==========================================
    // PHASE 3 — CREATE EXECUTION PLAN
    // ==========================================
    progress.start(`Planning safe Git operations with ${this.aiProvider.providerName}...`);
    let plan;
    try {
      plan = await this.aiProvider.generatePlan(userRequest, context, mergedOptions.sessionContext);
      progress.succeed('Execution plan created');
    } catch (err) {
      progress.fail('Failed to generate execution plan');
      throw err;
    }

    TerminalRenderer.renderPlan(plan.summary, plan.actions);

    if (dryRun) {
      console.log(`${theme.badgeYellow('DRY RUN')} ${theme.yellow('Dry run mode enabled. No actions executed.')}\n`);
      return true;
    }

    // Check if plan has mutating actions and prompt for user approval in interactive mode
    const isReadOnly = plan.actions.every(a => a.type === 'EXPLAIN_STATUS' || a.type === 'GET_STATUS' || a.type === 'GET_LOG' || a.type === 'GET_DIFF');

    if (!autoConfirm && !isReadOnly && process.stdout.isTTY && !process.env.VITEST && process.env.NODE_ENV !== 'test') {
      let isApproved = false;

      if (mergedOptions.sessionContext?.voiceModeActive && mergedOptions.sessionContext?.voiceManager) {
        console.log(theme.cyanBold('\nDo you want GitGenie to execute this plan? (Say Yes or No)'));
        const voiceInput = await mergedOptions.sessionContext.voiceManager.listenForCommand();
        const text = (voiceInput || '').toLowerCase();
        isApproved = ['yes', 'yep', 'sure', 'do it', 'ok', 'yeah', 'go ahead'].some(w => text.includes(w));
      } else {
        const approval = await prompts({
          type: 'confirm',
          name: 'value',
          message: theme.cyanBold('Do you want GitGenie to execute this plan?'),
          initial: true
        });
        isApproved = approval.value;
      }

      if (!isApproved) {
        console.log(`\n${theme.yellow(`${theme.symbols.warning} Plan execution cancelled by user.`)}`);
        this.renderSuggestions(context);
        return false;
      }
    }

    // ==========================================
    // PHASE 4 — EXECUTE WITH INTELLIGENT ERROR RECOVERY
    // ==========================================
    console.log(`${theme.cyanBold(`${theme.symbols.diamond} Executing Plan...`)}`);
    const actionCtx: ActionContext = {
      executor: this.executor,
      repoRoot: context.repoRoot || this.executor.getCwd()
    };

    for (let i = 0; i < plan.actions.length; i++) {
      const action = plan.actions[i];
      const desc = action.description || action.type;

      // Policy Evaluation
      const evaluation = PolicyEngine.evaluateAction(action);
      if (!evaluation.isAllowed) {
        console.log(`\n${theme.redBold(`${theme.symbols.cross} Action Blocked by Security Policy:`)} ${evaluation.warningMessage}\n`);
        return false;
      }

      // Check confirmation for destructive operations
      if (evaluation.requiresPrompt) {
        const approved = await ConfirmationManager.confirmAction(action.type, evaluation, autoConfirm);
        if (!approved) {
          console.log(theme.yellow(`Operation aborted before executing "${action.type}".`));
          return false;
        }
      }

      progress.start(`[${i + 1}/${plan.actions.length}] ${desc}...`);
      await NeonProgress.delay(80);

      const result = await GitActions.execute(actionCtx, action);

      if (!result.success) {
        progress.fail(`Failed: ${desc}`);
        progress.start(`AI (${this.aiProvider.providerName}) is analyzing error and formulating recovery plan...`);

        const analysis = await this.aiProvider.analyzeError(result.error || result.message, action, context);
        progress.succeed('AI error analysis complete');

        TerminalRenderer.renderErrorCard(`Step "${action.type}" Failed`, analysis.rootCause, analysis.explanation);

        // Check if authentication failed and offer interactive user input choices
        const isAuthError = (result.error || result.message || '').toLowerCase().includes('username') ||
                            (result.error || result.message || '').toLowerCase().includes('authentication') ||
                            (result.error || result.message || '').toLowerCase().includes('terminal prompts disabled');

        if (isInteractive && isAuthError) {
          const authChoice = await prompts({
            type: 'select',
            name: 'mode',
            message: theme.cyanBold('How would you like GitGenie to authenticate with your remote repository?'),
            choices: [
              { title: `${theme.cyanBold('[1]')} Open Interactive Browser Login (Windows Git Credential Manager)`, value: 'interactive' },
              { title: `${theme.cyanBold('[2]')} Enter GitHub Personal Access Token (PAT) securely`, value: 'token' },
              { title: `${theme.cyanBold('[3]')} Switch remote repository URL to SSH (git@github.com:...)`, value: 'ssh' },
              { title: `${theme.cyanBold('[4]')} Configure Git Credential Manager (git config --global credential.helper manager)`, value: 'helper' },
              { title: `${theme.yellowBold('[5]')} Cancel`, value: 'cancel' }
            ],
            initial: 0
          });

          if (authChoice.mode === 'interactive') {
            console.log(`\n${theme.cyanBold(`${theme.symbols.lightning} Launching interactive Git authentication...`)}`);
            const branch = (action.branch as string) || context.currentBranch || 'main';
            const remote = (action.remote as string) || 'origin';
            const interactiveRes = await this.executor.exec(['push', '-u', remote, branch], { interactive: true });
            if (interactiveRes.success) {
              console.log(theme.greenBold(`\n${theme.symbols.check} Authenticated and pushed successfully!\n`));
              continue;
            }
          } else if (authChoice.mode === 'token') {
            const patPrompt = await prompts([
              {
                type: 'password',
                name: 'token',
                message: theme.cyanBold('Enter your GitHub Personal Access Token:')
              },
              {
                type: 'text',
                name: 'username',
                message: theme.cyanBold('Enter your GitHub username (or press enter for default):'),
                initial: 'oauth2'
              }
            ]);

            if (patPrompt.token) {
              const branch = (action.branch as string) || context.currentBranch || 'main';
              const remote = (action.remote as string) || 'origin';
              const authHeader = Buffer.from(`${patPrompt.username || 'oauth2'}:${patPrompt.token}`).toString('base64');
              progress.start(`Pushing with authenticated token...`);
              const tokenRes = await this.executor.exec([
                '-c',
                `http.extraHeader=AUTHORIZATION: basic ${authHeader}`,
                'push',
                '-u',
                remote,
                branch
              ]);
              if (tokenRes.success) {
                progress.succeed(`[100% Complete] Authenticated and pushed to ${remote}/${branch}`);
                console.log(theme.greenBold(`\n${theme.symbols.check} Push completed securely with Personal Access Token!\n`));
                continue;
              } else {
                progress.fail(`Push with token failed: ${tokenRes.error || tokenRes.stderr}`);
              }
            }
          } else if (authChoice.mode === 'ssh') {
            const remoteUrl = context.remotes.find(r => r.name === (action.remote || 'origin'))?.url || context.remotes[0]?.url;
            const sshUrl = remoteUrl ? remoteUrl.replace(/^https?:\/\/github\.com\//i, 'git@github.com:') : 'git@github.com:user/repo.git';
            const remoteName = (action.remote as string) || 'origin';
            await this.executor.exec(['remote', 'set-url', remoteName, sshUrl]);
            console.log(theme.greenBold(`\n${theme.symbols.check} Switched remote "${remoteName}" to ${sshUrl}. Retrying...\n`));
            const retryRes = await GitActions.execute(actionCtx, action);
            if (retryRes.success) {
              console.log(theme.greenBold(`\n${theme.symbols.check} Successfully completed via SSH!\n`));
              continue;
            }
          } else if (authChoice.mode === 'helper') {
            await this.executor.exec(['config', '--global', 'credential.helper', 'manager']);
            console.log(theme.greenBold(`\n${theme.symbols.check} Configured Git Credential Manager. Retrying with interactive prompt...\n`));
            const branch = (action.branch as string) || context.currentBranch || 'main';
            const remote = (action.remote as string) || 'origin';
            const helperRes = await this.executor.exec(['push', '-u', remote, branch], { interactive: true });
            if (helperRes.success) {
              console.log(theme.greenBold(`\n${theme.symbols.check} Authenticated and pushed successfully!\n`));
              continue;
            }
          }
        }

        // If AI formulated an actionable recovery plan, present it and ask user for approval
        if (isInteractive && analysis.recoveryActions.length > 0) {
          TerminalRenderer.renderPlan(analysis.recoverySummary, analysis.recoveryActions);

          let executeRecovery = false;

          if (mergedOptions.sessionContext?.voiceModeActive && mergedOptions.sessionContext?.voiceManager) {
            console.log(theme.cyanBold('\nWould you like GitGenie to execute this AI recovery plan? (Say Yes or No)'));
            const voiceInput = await mergedOptions.sessionContext.voiceManager.listenForCommand();
            const text = (voiceInput || '').toLowerCase();
            executeRecovery = ['yes', 'yep', 'sure', 'do it', 'ok', 'yeah', 'go ahead'].some(w => text.includes(w));
          } else {
            const approval = await prompts({
              type: 'confirm',
              name: 'executeRecovery',
              message: theme.cyanBold('Would you like GitGenie to execute this AI recovery plan?'),
              initial: true
            });
            executeRecovery = approval.executeRecovery;
          }

          if (executeRecovery) {
            console.log(`\n${theme.cyanBold(`${theme.symbols.lightning} Executing AI Recovery Plan...`)}`);
            let allStepsRecovered = true;
            for (let r = 0; r < analysis.recoveryActions.length; r++) {
              const recAction = analysis.recoveryActions[r];
              const recDesc = recAction.description || recAction.type;
              progress.start(`[Recovery ${r + 1}/${analysis.recoveryActions.length}] ${recDesc}...`);
              const recRes = await GitActions.execute(actionCtx, recAction);
              if (!recRes.success) {
                progress.fail(`Recovery step failed: ${recRes.error || recRes.message}`);
                allStepsRecovered = false;
                break;
              }
              progress.succeed(`[Recovery ${r + 1}/${analysis.recoveryActions.length}] ${recRes.message}`);
            }

            if (allStepsRecovered) {
              console.log(theme.greenBold(`\n${theme.symbols.check} Error successfully resolved by AI recovery plan!\n`));
              continue; // Successfully recovered! Continue workflow
            }
          }
        }

        this.renderSuggestions(context);
        return false;
      }

      progress.succeed(`[${i + 1}/${plan.actions.length}] ${result.message}`);

      // Display output for informational commands
      const infoActions = ['GET_DIFF', 'GET_LOG', 'LIST_COMMITS', 'GET_SHOW', 'GET_REFLOG', 'LIST_BRANCHES', 'LIST_REMOTES', 'LIST_TAGS'];
      if (infoActions.includes(action.type) && result.details?.output) {
        const outText = (result.details.output as string).trim();
        if (outText) {
          console.log(`\n${theme.purpleBold(`${theme.symbols.diamond} Output:`)}`);
          
          const paged = Pager.display(outText);
          if (!paged) {
            // Only print inline if it didn't use the pager
            // Don't format with gray if it already has ANSI colors from git
            const hasColors = outText.includes('\x1b[');
            console.log(hasColors ? outText : theme.gray(outText));
          } else {
            console.log(theme.cyan(`  (Output displayed in pager)`));
          }
          console.log('');
        }
      }

      // Provide sync summary for actions that update the working tree from remote
      if (['PULL', 'MERGE', 'REBASE'].includes(action.type) && result.details?.output) {
        const outputStr = (result.details.output as string).trim();
        if (outputStr.includes('Already up to date') || outputStr.includes('Current branch') && outputStr.includes('is up to date')) {
          console.log(`\n  ${theme.gray('Already up to date.')}\n`);
        } else if (outputStr) {
          progress.start('AI is generating sync summary...');
          let summary = outputStr;
          try {
            summary = await this.aiProvider.summarizeSync(outputStr);
            progress.succeed('Sync summary generated');
          } catch {
            progress.fail('Failed to generate AI summary, using raw output');
          }
          console.log(`\n${theme.purpleBold(`${theme.symbols.diamond} AI Sync Summary:`)}`);
          console.log(theme.gray(summary));
          console.log('');
        }
      }
    }

    // ==========================================
    // PHASE 5 — VERIFY & COMPLETE
    // ==========================================
    progress.start('Verifying repository status...');
    await NeonProgress.delay(60);
    const finalContext = await this.inspector.inspect();
    progress.succeed('Repository verified');

    TerminalRenderer.renderCompletionCard(plan.summary || 'Task completed successfully', {
      'Active Branch': finalContext.currentBranch,
      'Working Tree': finalContext.isClean ? 'Clean' : `${finalContext.unstagedCount} modified, ${finalContext.stagedCount} staged`,
      'Last Action': plan.actions[plan.actions.length - 1]?.type,
      'Project Stack': finalContext.techStack
    });

    return true;
  }

  /**
   * Render context-aware suggestions when an action is cancelled or fails
   */
  private renderSuggestions(context: RepoContext): void {
    console.log(`\n${theme.purpleBold(`${theme.symbols.diamond} Suggested Next Steps:`)}`);
    if (!context.isRepo) {
      console.log(`  ${theme.symbols.bullet} ${theme.cyan('gitgenie "Initialize this project"')}`);
      return;
    }
    if (context.changes.length > 0) {
      console.log(`  ${theme.symbols.bullet} ${theme.cyan('gitgenie "Commit all my changes"')}`);
      console.log(`  ${theme.symbols.bullet} ${theme.cyan('gitgenie "Show me what changed"')}`);
      console.log(`  ${theme.symbols.bullet} ${theme.cyan('gitgenie "Stash my changes for later"')}`);
    }
    if (context.behind > 0) {
      console.log(`  ${theme.symbols.bullet} ${theme.cyan('gitgenie "Sync and pull changes from remote"')}`);
    }
    if (context.ahead > 0) {
      console.log(`  ${theme.symbols.bullet} ${theme.cyan('gitgenie "Push my commits to remote origin"')}`);
    }
    if (context.remotes.length === 0) {
      console.log(`  ${theme.symbols.bullet} ${theme.cyan('gitgenie "Connect this repo to https://github.com/user/repo.git"')}`);
    }
    console.log(`  ${theme.symbols.bullet} ${theme.cyan('gitgenie "Create a new branch for <feature-name>"')}\n`);
  }
}
