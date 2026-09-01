import path from 'path';

export class GitValidator {
  /**
   * Validate git branch name according to git-check-ref-format rules
   */
  static isValidBranchName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 255) return false;

    // Must not start with / or - or .
    if (/^[./-]/.test(trimmed)) return false;

    // Must not end with / or . or .lock
    if (/[./]$|\.lock$/i.test(trimmed)) return false;

    // Must not contain ..
    if (/\.\./.test(trimmed)) return false;

    // Must not contain consecutive slashes
    if (/\/\//.test(trimmed)) return false;

    // Must not contain ASCII control chars or space, ~, ^, :, ?, *, [, \, @{
    if (/[\x00-\x20\x7F ~^:?*[\\]|@\{/.test(trimmed)) return false;

    return true;
  }

  /**
   * Sanitize a candidate branch name (e.g. from user prompt "feature for auth system")
   */
  static sanitizeBranchName(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9\-/.]/g, '')
      .replace(/\/{2,}/g, '/')
      .replace(/\.{2,}/g, '.')
      .replace(/^-+|-+$/g, '')
      .replace(/^\/+|\/+$/g, '')
      .slice(0, 80);
  }

  /**
   * Validate safe file path inside workspace
   */
  static isSafeFilePath(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    // Check for null bytes
    if (filePath.includes('\0')) return false;

    // Prevent directory traversal escaping
    const normalized = path.normalize(filePath);
    if (normalized.startsWith('..') || path.isAbsolute(filePath)) {
      // Relative subpaths are expected, absolute paths must be checked carefully
      if (normalized.startsWith('..')) return false;
    }

    return true;
  }
}
