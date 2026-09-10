import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { DEFAULT_OPENROUTER_MODEL, DEFAULT_TIMEOUT_MS } from './constants.js';

// Load local .env if present
dotenv.config();

export interface GitGenieConfig {
  apiKey?: string;
  model?: string;
  provider?: 'openrouter' | 'mock' | 'openai' | 'anthropic';
  timeoutMs?: number;
  autoConfirm?: boolean;
  verbose?: boolean;
  theme?: 'neon' | 'plain';
  voiceModel?: 'tiny.en' | 'base.en' | 'small.en' | 'medium.en' | 'large-v1' | 'large-v2' | 'large-v3';
}

export class ConfigManager {
  private static customConfigDir: string | null = null;

  static setCustomConfigDir(dir: string | null): void {
    this.customConfigDir = dir;
  }

  private static getConfigDir(): string {
    return this.customConfigDir || path.join(os.homedir(), '.gitgenie');
  }

  private static getConfigFile(): string {
    return path.join(this.getConfigDir(), 'config.json');
  }

  /**
   * Load stored user config from config.json
   */
  static loadUserConfig(): GitGenieConfig {
    try {
      const file = this.getConfigFile();
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {
      // Ignore corrupt config file
    }
    return {};
  }

  /**
   * Save configuration to config.json
   */
  static saveUserConfig(newConfig: Partial<GitGenieConfig>): void {
    try {
      const dir = this.getConfigDir();
      const file = this.getConfigFile();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const current = this.loadUserConfig();
      const merged = { ...current, ...newConfig };
      fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (err) {
      throw new Error(`Failed to write config file to ${this.getConfigFile()}: ${(err as Error).message}`);
    }
  }

  /**
   * Get merged effective configuration
   */
  static getEffectiveConfig(): Required<GitGenieConfig> {
    const userCfg = this.loadUserConfig();

    const apiKey =
      process.env.OPENROUTER_API_KEY ||
      process.env.GITGENIE_API_KEY ||
      userCfg.apiKey ||
      '';

    const model =
      process.env.GITGENIE_AI_MODEL ||
      process.env.OPENROUTER_MODEL ||
      userCfg.model ||
      DEFAULT_OPENROUTER_MODEL;

    let provider: 'openrouter' | 'mock' | 'openai' | 'anthropic' = 'openrouter';
    if (process.env.GITGENIE_PROVIDER) {
      provider = process.env.GITGENIE_PROVIDER as 'openrouter' | 'mock' | 'openai' | 'anthropic';
    } else if (apiKey && apiKey.trim().length > 0) {
      // If user has an API key configured, use OpenRouter by default
      provider = (userCfg.provider === 'mock' ? 'openrouter' : userCfg.provider) || 'openrouter';
    } else if (userCfg.provider) {
      provider = userCfg.provider;
    } else {
      provider = 'mock';
    }

    const timeoutMs =
      Number(process.env.GITGENIE_TIMEOUT_MS) ||
      userCfg.timeoutMs ||
      DEFAULT_TIMEOUT_MS;

    const autoConfirm =
      process.env.GITGENIE_AUTO_CONFIRM === 'true' ||
      userCfg.autoConfirm ||
      false;

    const verbose =
      process.env.GITGENIE_VERBOSE === 'true' ||
      userCfg.verbose ||
      false;

    const theme = (userCfg.theme || 'neon') as 'neon' | 'plain';

    const voiceModel = (process.env.GITGENIE_VOICE_MODEL || userCfg.voiceModel || 'base.en') as 'tiny.en' | 'base.en' | 'small.en' | 'medium.en' | 'large-v1' | 'large-v2' | 'large-v3';

    return {
      apiKey,
      model,
      provider,
      timeoutMs,
      autoConfirm,
      verbose,
      theme,
      voiceModel
    };
  }

  /**
   * Check if an API key is available
   */
  static hasApiKey(): boolean {
    const cfg = this.getEffectiveConfig();
    return Boolean(cfg.apiKey && cfg.apiKey.trim().length > 0);
  }

  /**
   * Get configuration file path
   */
  static getConfigPath(): string {
    return this.getConfigFile();
  }
}
