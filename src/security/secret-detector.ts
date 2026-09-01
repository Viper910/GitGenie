import path from 'path';

export interface DetectedSecret {
  file: string;
  ruleName: string;
  maskedMatch: string;
  line?: number;
}

// Rules for sensitive files by name
const SENSITIVE_FILENAMES = [
  /^\.env(\..+)?$/i,
  /^id_rsa$/i,
  /^id_dsa$/i,
  /^id_ecdsa$/i,
  /^id_ed25519$/i,
  /.*\.pem$/i,
  /.*\.key$/i,
  /.*\.pkcs12$/i,
  /.*\.pfx$/i,
  /.*\.p12$/i,
  /^credentials\.json$/i,
  /^service-account.*\.json$/i,
  /^secrets?\.(yaml|yml|json)$/i
];

// Content scanning patterns
const CONTENT_RULES: Array<{ name: string; regex: RegExp }> = [
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{20,60}/ },
  { name: 'OpenRouter API Key', regex: /sk-or-v1-[a-zA-Z0-9]{30,70}/ },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Access Key', regex: /(?:aws_secret_access_key|aws_sec_key)\s*=\s*['"]?[A-Za-z0-9/+=]{30,50}['"]?/i },
  { name: 'GitHub Personal Access Token', regex: /(ghp_[a-zA-Z0-9]{20,40}|github_pat_[a-zA-Z0-9_]{50,90})/ },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z\-_]{30,40}/ },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{20,35}/ },
  { name: 'Private Key Header', regex: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP|PRIVATE)\s+KEY-----/ },
  { name: 'Database Connection String', regex: /(postgres|mysql|mongodb|redis|mssql):\/\/[^\s:"']+:[^\s:"']+@[^\s:]+:\d+/i },
  { name: 'Generic Password Assignment', regex: /(?:password|passwd|secret|api_key|apikey)\s*=\s*['"][a-zA-Z0-9!@#$%^&*()_+=-]{8,}['"]/i }
];

export class SecretDetector {
  /**
   * Scan a list of modified/untracked files for sensitive filenames or contents
   */
  static scanFiles(files: Array<{ path: string; content?: string }>): DetectedSecret[] {
    const detected: DetectedSecret[] = [];

    for (const item of files) {
      // Skip test files, as they often contain mock secrets for unit testing
      if (item.path.includes('.test.') || item.path.includes('.spec.') || item.path.includes('__tests__')) {
        continue;
      }

      const fileName = path.basename(item.path);

      // Check filename
      for (const pattern of SENSITIVE_FILENAMES) {
        if (pattern.test(fileName)) {
          detected.push({
            file: item.path,
            ruleName: 'Sensitive File Name Pattern',
            maskedMatch: `Filename '${fileName}' matches sensitive file filter`
          });
          break;
        }
      }

      // Check content if provided
      if (item.content) {
        const contentSecrets = this.scanContent(item.path, item.content);
        detected.push(...contentSecrets);
      }
    }

    return detected;
  }

  /**
   * Scan text content line by line for secrets
   */
  static scanContent(filePath: string, content: string): DetectedSecret[] {
    const detected: DetectedSecret[] = [];

    // Skip test files
    if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')) {
      return detected;
    }
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const rule of CONTENT_RULES) {
        const match = rule.regex.exec(line);
        if (match) {
          const rawMatch = match[0];
          const masked = this.maskSecretString(rawMatch);
          detected.push({
            file: filePath,
            ruleName: rule.name,
            maskedMatch: masked,
            line: i + 1
          });
        }
      }
    }

    return detected;
  }

  /**
   * Helper to mask a secret string showing only prefix/suffix
   */
  static maskSecretString(secret: string): string {
    if (secret.length <= 8) {
      return '****';
    }
    const prefix = secret.slice(0, 4);
    const suffix = secret.slice(-4);
    return `${prefix}****${suffix}`;
  }
}
