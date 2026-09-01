import prompts from 'prompts';
import boxen from 'boxen';
import { theme, isNoColor } from '../terminal/theme.js';
import { ConfigManager, GitGenieConfig } from '../config/config-manager.js';
import { GitExecutor } from '../git/git-executor.js';
import { DEFAULT_OPENROUTER_MODEL } from '../config/constants.js';
import { NeonProgress } from '../terminal/progress.js';

export class SetupWizard {
  /**
   * Run the interactive setup wizard
   */
  static async run(): Promise<number> {
    this.renderHeader();

    const currentConfig = ConfigManager.getEffectiveConfig();
    const executor = new GitExecutor();

    console.log(`${theme.white('Welcome! Let\'s configure GitGenie for your terminal environment.')}\n`);

    // ==========================================
    // STEP 1: AI Provider Selection
    // ==========================================
    const providerRes = await prompts({
      type: 'select',
      name: 'provider',
      message: theme.cyanBold('Select your AI Gateway:'),
      choices: [
        {
          title: `${theme.cyanBold('OpenRouter')} (Recommended - Claude 3.5, Gemini 2.5, GPT-4o, DeepSeek)`,
          value: 'openrouter'
        },
        {
          title: `${theme.gray('Offline / Deterministic Mode')} (No API key needed)`,
          value: 'mock'
        }
      ],
      initial: currentConfig.provider === 'mock' ? 1 : 0
    });

    if (!providerRes.provider) {
      console.log(`\n${theme.yellow(`${theme.symbols.warning} Setup cancelled.`)}\n`);
      return 1;
    }

    const selectedProvider = providerRes.provider as 'openrouter' | 'mock';
    let apiKey = currentConfig.apiKey;
    let selectedModel = currentConfig.model || DEFAULT_OPENROUTER_MODEL;

    // ==========================================
    // STEP 2 & 3: OpenRouter API Key & Model
    // ==========================================
    if (selectedProvider === 'openrouter') {
      console.log(`\n${theme.dim('Tip: Get an API key at https://openrouter.ai/keys')}`);

      const keyRes = await prompts({
        type: 'password',
        name: 'apiKey',
        message: currentConfig.apiKey
          ? theme.cyanBold(`Enter OpenRouter API Key (press Enter to keep existing key: ${currentConfig.apiKey.slice(0, 6)}****):`)
          : theme.cyanBold('Enter your OpenRouter API Key:'),
        validate: (val) => {
          if (!val && !currentConfig.apiKey) {
            return 'API key is required for OpenRouter mode (or choose Offline Mode).';
          }
          return true;
        }
      });

      if (keyRes.apiKey === undefined && !currentConfig.apiKey) {
        console.log(`\n${theme.yellow(`${theme.symbols.warning} Setup cancelled.`)}\n`);
        return 1;
      }

      apiKey = keyRes.apiKey ? keyRes.apiKey.trim() : currentConfig.apiKey;

      const modelRes = await prompts({
        type: 'select',
        name: 'model',
        message: theme.cyanBold('Select default AI Model:'),
        choices: [
          {
            title: `${theme.greenBold('anthropic/claude-3.5-sonnet')} (Recommended - Best Git Architect & Commit Author)`,
            value: 'anthropic/claude-3.5-sonnet'
          },
          {
            title: `${theme.cyanBold('nvidia/nemotron-3-ultra-550b-a55b:free')} (Free & High Capacity)`,
            value: 'nvidia/nemotron-3-ultra-550b-a55b:free'
          },
          {
            title: `${theme.cyanBold('google/gemini-2.5-flash')} (Fastest & Cost-Effective)`,
            value: 'google/gemini-2.5-flash'
          },
          {
            title: `${theme.purpleBold('openai/gpt-4o')} (High Precision)`,
            value: 'openai/gpt-4o'
          },
          {
            title: `${theme.yellowBold('deepseek/deepseek-chat')} (DeepSeek V3)`,
            value: 'deepseek/deepseek-chat'
          },
          {
            title: `${theme.whiteBold('Custom Model')} (Enter custom OpenRouter model ID)`,
            value: 'custom'
          }
        ],
        initial: 0
      });

      if (modelRes.model === 'custom') {
        const customRes = await prompts({
          type: 'text',
          name: 'customModel',
          message: theme.cyanBold('Enter custom model ID (e.g. meta-llama/llama-3.3-70b-instruct):'),
          initial: selectedModel
        });
        selectedModel = customRes.customModel || selectedModel;
      } else if (modelRes.model) {
        selectedModel = modelRes.model;
      }
    }

    // ==========================================
    // STEP 4: Git Identity Check
    // ==========================================
    console.log(`\n${theme.purpleBold(`${theme.symbols.diamond} Checking Git User Configuration...`)}`);
    const nameCheck = await executor.exec(['config', 'user.name'], { ignoreErrors: true });
    const emailCheck = await executor.exec(['config', 'user.email'], { ignoreErrors: true });

    const currentGitName = nameCheck.stdout.trim();
    const currentGitEmail = emailCheck.stdout.trim();

    if (currentGitName && currentGitEmail) {
      console.log(`  ${theme.symbols.check} Git Author configured: ${theme.cyanBold(currentGitName)} <${theme.gray(currentGitEmail)}>`);
    } else {
      console.log(`  ${theme.yellow(`${theme.symbols.warning} Git Author is not configured. Commits will fail without user.name and user.email.`)}`);
      
      const identityRes = await prompts([
        {
          type: 'text',
          name: 'gitName',
          message: theme.cyanBold('Enter your Git Author Name (e.g. John Doe):'),
          initial: currentGitName || ''
        },
        {
          type: 'text',
          name: 'gitEmail',
          message: theme.cyanBold('Enter your Git Author Email (e.g. john@example.com):'),
          initial: currentGitEmail || ''
        }
      ]);

      if (identityRes.gitName) {
        await executor.exec(['config', '--global', 'user.name', identityRes.gitName]);
        console.log(`  ${theme.symbols.check} Set global user.name: ${theme.cyan(identityRes.gitName)}`);
      }
      if (identityRes.gitEmail) {
        await executor.exec(['config', '--global', 'user.email', identityRes.gitEmail]);
        console.log(`  ${theme.symbols.check} Set global user.email: ${theme.cyan(identityRes.gitEmail)}`);
      }
    }

    // ==========================================
    // STEP 5: Preferences (Theme & Auto-Confirm)
    // ==========================================
    const prefRes = await prompts([
      {
        type: 'select',
        name: 'theme',
        message: theme.cyanBold('Select Terminal Theme:'),
        choices: [
          { title: `${theme.cyanBold('Neon Dark')} (Recommended - High Contrast Cyan/Purple/Green/Yellow/Red)`, value: 'neon' },
          { title: `${theme.gray('Plain')} (Minimal ANSI)`, value: 'plain' }
        ],
        initial: currentConfig.theme === 'plain' ? 1 : 0
      },
      {
        type: 'confirm',
        name: 'autoConfirm',
        message: theme.cyanBold('Auto-execute safe Git operations without manual confirmation prompts?'),
        initial: currentConfig.autoConfirm !== undefined ? currentConfig.autoConfirm : false
      }
    ]);

    // ==========================================
    // STEP 6: Save Configuration
    // ==========================================
    const newConfig: Partial<GitGenieConfig> = {
      provider: selectedProvider,
      apiKey: apiKey,
      model: selectedModel,
      theme: prefRes.theme || 'neon',
      autoConfirm: Boolean(prefRes.autoConfirm)
    };

    const progress = new NeonProgress();
    progress.start('Saving GitGenie configuration...');
    await NeonProgress.delay(200);

    try {
      ConfigManager.saveUserConfig(newConfig);
      progress.succeed('Configuration saved to ~/.gitgenie/config.json');
    } catch (err) {
      progress.fail(`Failed to save config: ${(err as Error).message}`);
      return 1;
    }

    // ==========================================
    // STEP 7: Completion Summary
    // ==========================================
    this.renderSuccessCard(newConfig);
    return 0;
  }

  private static renderHeader(): void {
    const text = `
⚡ GITGENIE SETUP WIZARD
AI-Powered Git Automation Terminal Configuration
`;
    if (isNoColor()) {
      console.log(`\n========================================${text}========================================\n`);
      return;
    }

    const box = boxen(text.trim(), {
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
      margin: { top: 1, bottom: 1 },
      borderColor: '#00F0FF',
      borderStyle: 'double',
      textAlignment: 'center'
    });
    console.log(box);
  }

  private static renderSuccessCard(config: Partial<GitGenieConfig>): void {
    let content = `${theme.greenBold(`${theme.symbols.check} GitGenie Setup Completed Successfully!`)}\n\n`;
    content += `${theme.cyanBold('Provider:')}     ${theme.whiteBold(config.provider || 'openrouter')}\n`;
    content += `${theme.cyanBold('Model:')}        ${theme.whiteBold(config.model || DEFAULT_OPENROUTER_MODEL)}\n`;
    content += `${theme.cyanBold('API Key:')}      ${config.apiKey ? theme.green(`${config.apiKey.slice(0, 6)}****`) : theme.yellow('Not configured (Offline Mode)')}\n`;
    content += `${theme.cyanBold('Theme:')}        ${theme.whiteBold(config.theme || 'neon')}\n`;
    content += `${theme.cyanBold('Auto-Confirm:')} ${config.autoConfirm ? theme.green('Enabled') : theme.yellow('Disabled (Safe prompts enabled)')}\n\n`;
    content += `${theme.purpleBold('Ready to start! Try running:')}\n`;
    content += `  ${theme.dim('$')} ${theme.greenBold('gitgenie "Initialize this project"')}\n`;
    content += `  ${theme.dim('$')} ${theme.greenBold('gitgenie "Show me what changed"')}\n`;
    content += `  ${theme.dim('$')} ${theme.greenBold('gitgenie "Create a branch for user auth"')}\n`;

    if (isNoColor()) {
      console.log(`\n========================================\n${content}\n========================================\n`);
      return;
    }

    const box = boxen(content.trim(), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderColor: '#39FF14',
      borderStyle: 'round'
    });
    console.log(box);
  }
}
