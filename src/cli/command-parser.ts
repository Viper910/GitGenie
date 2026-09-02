import { renderBanner } from './banner.js';
import { theme, setNoColor } from '../terminal/theme.js';
import { setVerbose, logger } from '../terminal/logger.js';
import { ConfigManager } from '../config/config-manager.js';
import { RequestHandler } from '../application/request-handler.js';
import { SetupWizard } from './setup-wizard.js';
import { APP_NAME, APP_VERSION } from '../config/constants.js';

export class CommandParser {
  static async parseAndRun(args: string[]): Promise<number> {
    const rawArgs = args.slice(2);

    // 1. Check for --no-color flag early
    if (rawArgs.includes('--no-color')) {
      setNoColor(true);
    }

    // 2. Check for --verbose flag
    if (rawArgs.includes('--verbose') || rawArgs.includes('-V')) {
      setVerbose(true);
    }

    // Filter out known operational flags
    const dryRun = rawArgs.includes('--dry-run');
    const autoConfirm = rawArgs.includes('--yes') || rawArgs.includes('-y');

    const cleanArgs = rawArgs.filter(
      arg => !['--no-color', '--verbose', '-V', '--dry-run', '--yes', '-y'].includes(arg)
    );

    // 3. Check for --version / -v
    if (cleanArgs.includes('--version') || cleanArgs.includes('-v')) {
      console.log(`${APP_NAME} version ${APP_VERSION}`);
      return 0;
    }

    // 4. Check for --help / -h
    if (cleanArgs.includes('--help') || cleanArgs.includes('-h')) {
      this.printHelp();
      return 0;
    }

    // 5. Setup command: gitgenie setup
    if (cleanArgs[0] === 'setup') {
      return SetupWizard.run();
    }

    // 6. Config subcommands: gitgenie config ...
    if (cleanArgs[0] === 'config') {
      return this.handleConfigCommand(cleanArgs.slice(1));
    }

    // 7. Natural Language Request or Interactive Session
    const userPrompt = cleanArgs.join(' ').trim();
    if (!userPrompt) {
      // START INTERACTIVE SESSION
      const { InteractiveSession } = await import('./interactive-session.js');
      const session = new InteractiveSession();
      await session.start();
      return 0;
    }

    renderBanner(false);
    const success = await RequestHandler.handle(userPrompt, {
      dryRun,
      autoConfirm,
      verbose: rawArgs.includes('--verbose')
    });

    return success ? 0 : 1;
  }

  private static printHelp(): void {
    renderBanner(false);
    console.log(`${theme.cyanBold('USAGE:')}`);
    console.log(`  ${theme.whiteBold('gitgenie')} ${theme.green('"<natural language request>"')} ${theme.gray('[flags]')}`);
    console.log(`  ${theme.whiteBold('gitgenie')} ${theme.cyanBold('setup')}                       ${theme.gray('Run interactive setup wizard')}`);
    console.log(`  ${theme.whiteBold('gitgenie')} ${theme.purple('config')} ${theme.gray('<subcommand>')}\n`);

    console.log(`${theme.cyanBold('EXAMPLES:')}`);
    console.log(`  ${theme.dim('$')} gitgenie ${theme.cyanBold('setup')}`);
    console.log(`  ${theme.dim('$')} gitgenie ${theme.green('"Initialize this project and prepare .gitignore"')}`);
    console.log(`  ${theme.dim('$')} gitgenie ${theme.green('"Show me what changed"')}`);
    console.log(`  ${theme.dim('$')} gitgenie ${theme.green('"Create a feature branch for user auth"')}`);
    console.log(`  ${theme.dim('$')} gitgenie ${theme.green('"Commit all my changes with conventional commit"')}`);
    console.log(`  ${theme.dim('$')} gitgenie ${theme.green('"Push my branch with upstream setup"')}`);
    console.log(`  ${theme.dim('$')} gitgenie ${theme.green('"Sync with main and pull updates"')}`);
    console.log(`  ${theme.dim('$')} gitgenie ${theme.green('"Resolve the merge conflicts"')}`);
    console.log(`  ${theme.dim('$')} gitgenie ${theme.green('"Why is my push failing?"')}\n`);

    console.log(`${theme.cyanBold('OPTIONS:')}`);
    console.log(`  ${theme.purpleBold('--dry-run')}      Plan and validate actions without executing them`);
    console.log(`  ${theme.purpleBold('--verbose')}      Display verbose debug logs`);
    console.log(`  ${theme.purpleBold('--no-color')}     Disable ANSI colors (honors NO_COLOR=1)`);
    console.log(`  ${theme.purpleBold('-y, --yes')}      Auto-confirm non-destructive prompts`);
    console.log(`  ${theme.purpleBold('-v, --version')}  Show version number`);
    console.log(`  ${theme.purpleBold('-h, --help')}     Show this help screen\n`);

    console.log(`${theme.cyanBold('CONFIGURATION:')}`);
    console.log(`  ${theme.whiteBold('gitgenie setup')}                        Run interactive onboarding wizard`);
    console.log(`  ${theme.whiteBold('gitgenie config set api-key <KEY>')}   Set OpenRouter API Key`);
    console.log(`  ${theme.whiteBold('gitgenie config set model <MODEL>')}   Set AI Model (e.g. anthropic/claude-3.5-sonnet)`);
    console.log(`  ${theme.whiteBold('gitgenie config get <KEY>')}           Get configuration value`);
    console.log(`  ${theme.whiteBold('gitgenie config list')}                 List current configuration\n`);
  }

  private static handleConfigCommand(args: string[]): number {
    renderBanner(true);
    const sub = args[0];

    if (sub === 'set') {
      const key = args[1];
      const val = args[2];

      if (!key || !val) {
        console.log(theme.red('Usage: gitgenie config set <api-key|model|provider|verbose> <value>'));
        return 1;
      }

      if (key === 'api-key' || key === 'apiKey') {
        ConfigManager.saveUserConfig({ apiKey: val });
        console.log(theme.green(`${theme.symbols.check} OpenRouter API Key configured successfully.`));
      } else if (key === 'model') {
        ConfigManager.saveUserConfig({ model: val });
        console.log(theme.green(`${theme.symbols.check} AI Model set to "${val}".`));
      } else if (key === 'provider') {
        ConfigManager.saveUserConfig({ provider: val as 'openrouter' | 'mock' });
        console.log(theme.green(`${theme.symbols.check} Provider set to "${val}".`));
      } else {
        console.log(theme.yellow(`Unknown config key "${key}". Supported: api-key, model, provider.`));
        return 1;
      }
      return 0;
    }

    if (sub === 'get') {
      const key = args[1];
      const cfg = ConfigManager.getEffectiveConfig();
      if (key === 'api-key' || key === 'apiKey') {
        console.log(cfg.apiKey ? theme.green(`API Key: ${cfg.apiKey.slice(0, 6)}****`) : theme.yellow('No API Key set'));
      } else if (key === 'model') {
        console.log(theme.cyan(`Model: ${cfg.model}`));
      } else if (key === 'provider') {
        console.log(theme.cyan(`Provider: ${cfg.provider}`));
      }
      return 0;
    }

    if (sub === 'list' || !sub) {
      const cfg = ConfigManager.getEffectiveConfig();
      console.log(theme.cyanBold(`${theme.symbols.diamond} GitGenie Configuration:`));
      console.log(`  ${theme.symbols.bullet} Provider:  ${theme.whiteBold(cfg.provider)}`);
      console.log(`  ${theme.symbols.bullet} Model:     ${theme.whiteBold(cfg.model)}`);
      console.log(`  ${theme.symbols.bullet} API Key:   ${cfg.apiKey ? theme.green(`${cfg.apiKey.slice(0, 6)}****`) : theme.yellow('(Not set - using Deterministic Mode)')}`);
      console.log(`  ${theme.symbols.bullet} Timeout:   ${theme.whiteBold(`${cfg.timeoutMs}ms`)}`);
      console.log(`  ${theme.symbols.bullet} Config:    ${theme.dim(ConfigManager.getConfigPath())}\n`);
      return 0;
    }

    console.log(theme.red(`Unknown config subcommand "${sub}". Use: set, get, or list.`));
    return 1;
  }
}
