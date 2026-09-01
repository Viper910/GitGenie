import { describe, it, expect } from 'vitest';
import { theme, setNoColor, isNoColor } from '../../src/terminal/theme.js';

describe('Theme and NO_COLOR support', () => {
  it('should render colored or plain strings based on no-color configuration', () => {
    // Enable color
    setNoColor(false);
    expect(isNoColor()).toBe(false);
    const colored = theme.cyan('test-string');
    expect(typeof colored).toBe('string');
    expect(colored).toContain('test-string');

    // Disable color
    setNoColor(true);
    expect(isNoColor()).toBe(true);
    const plain = theme.cyan('test-string');
    expect(plain).toBe('test-string');

    // Reset
    setNoColor(false);
  });

  it('should provide formatted semantic badges', () => {
    setNoColor(true);
    expect(theme.badgeCyan('ACTION')).toBe('[ACTION]');
    expect(theme.badgeRed('DANGER')).toBe('[DANGER]');
    setNoColor(false);
  });
});
