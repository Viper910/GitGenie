import { describe, it, expect } from 'vitest';
import { SecretDetector } from '../../src/security/secret-detector.js';

describe('SecretDetector', () => {
  it('should detect sensitive filenames like .env and private keys', () => {
    const files = [
      { path: '.env' },
      { path: '.env.local' },
      { path: 'id_rsa' },
      { path: 'server.key' },
      { path: 'cert.pem' },
      { path: 'src/index.ts' } // safe
    ];

    const detected = SecretDetector.scanFiles(files);
    expect(detected.length).toBe(5);
    expect(detected.map(d => d.file)).toContain('.env');
    expect(detected.map(d => d.file)).toContain('server.key');
    expect(detected.map(d => d.file)).not.toContain('src/index.ts');
  });

  it('should detect API keys and tokens in file content', () => {
    const content = `
const apiKey = "sk-1234567890abcdef1234567890abcdef1234567890abcdef";
const awsKey = "AKIA1234567890ABCDEF";
const githubToken = "ghp_1234567890abcdefghijklmnopqrstuv";
const dbUrl = "postgres://user:supersecretpass@localhost:5432/mydb";
const cleanVar = "hello world";
`;

    const secrets = SecretDetector.scanContent('config.js', content);
    expect(secrets.length).toBeGreaterThanOrEqual(4);

    const ruleNames = secrets.map(s => s.ruleName);
    expect(ruleNames).toContain('OpenAI API Key');
    expect(ruleNames).toContain('AWS Access Key ID');
    expect(ruleNames).toContain('GitHub Personal Access Token');
    expect(ruleNames).toContain('Database Connection String');
  });

  it('should correctly mask detected secret strings', () => {
    const masked = SecretDetector.maskSecretString('sk-1234567890abcdef1234567890abcdef1234567890abcdef');
    expect(masked).toBe('sk-1****cdef');
    expect(masked).not.toContain('1234567890');
  });
});
