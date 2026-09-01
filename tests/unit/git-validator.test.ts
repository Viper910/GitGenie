import { describe, it, expect } from 'vitest';
import { GitValidator } from '../../src/git/git-validator.js';

describe('GitValidator', () => {
  it('should validate valid branch names', () => {
    expect(GitValidator.isValidBranchName('main')).toBe(true);
    expect(GitValidator.isValidBranchName('feature/user-auth')).toBe(true);
    expect(GitValidator.isValidBranchName('bugfix/issue-123')).toBe(true);
    expect(GitValidator.isValidBranchName('v1.0.0-release')).toBe(true);
  });

  it('should reject invalid branch names', () => {
    expect(GitValidator.isValidBranchName('')).toBe(false);
    expect(GitValidator.isValidBranchName('/leading-slash')).toBe(false);
    expect(GitValidator.isValidBranchName('-leading-dash')).toBe(false);
    expect(GitValidator.isValidBranchName('branch with space')).toBe(false);
    expect(GitValidator.isValidBranchName('double..dot')).toBe(false);
    expect(GitValidator.isValidBranchName('branch~1')).toBe(false);
    expect(GitValidator.isValidBranchName('branch^2')).toBe(false);
    expect(GitValidator.isValidBranchName('branch:colon')).toBe(false);
  });

  it('should sanitize raw input into clean branch names', () => {
    expect(GitValidator.sanitizeBranchName('Add User Authentication!')).toBe('add-user-authentication');
    expect(GitValidator.sanitizeBranchName('feature/payment gateway 2.0')).toBe('feature/payment-gateway-2.0');
  });

  it('should validate safe file paths and reject traversal', () => {
    expect(GitValidator.isSafeFilePath('src/app.ts')).toBe(true);
    expect(GitValidator.isSafeFilePath('package.json')).toBe(true);
    expect(GitValidator.isSafeFilePath('../../etc/passwd')).toBe(false);
  });
});
