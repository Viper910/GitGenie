import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigManager } from '../../src/config/config-manager.js';

describe('Setup and Config Management', () => {
  let tempConfigDir: string;

  beforeEach(() => {
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgenie-cfg-test-'));
    ConfigManager.setCustomConfigDir(tempConfigDir);
  });

  afterEach(() => {
    ConfigManager.setCustomConfigDir(null);
    try {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    } catch {}
  });

  it('should load default effective configuration when empty', () => {
    const config = ConfigManager.getEffectiveConfig();
    expect(config.model).toBeDefined();
    expect(config.timeoutMs).toBeGreaterThan(0);
    expect(typeof config.autoConfirm).toBe('boolean');
  });

  it('should save and load user configuration updates', () => {
    ConfigManager.saveUserConfig({
      model: 'google/gemini-2.5-flash',
      provider: 'openrouter',
      autoConfirm: true
    });

    const updated = ConfigManager.getEffectiveConfig();
    expect(updated.model).toBe('google/gemini-2.5-flash');
    expect(updated.provider).toBe('openrouter');
    expect(updated.autoConfirm).toBe(true);
  });
});
