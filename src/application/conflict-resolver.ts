import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import { AIProvider, ConflictBlock } from '../ai/ai-provider.interface.js';
import { RepoContext } from '../git/repository-inspector.js';
import { GitExecutor } from '../git/git-executor.js';
import { TerminalRenderer } from '../terminal/renderer.js';
import { theme } from '../terminal/theme.js';
import { logger } from '../terminal/logger.js';

export class ConflictResolver {
  private aiProvider: AIProvider;
  private executor: GitExecutor;

  constructor(aiProvider: AIProvider, executor: GitExecutor) {
    this.aiProvider = aiProvider;
    this.executor = executor;
  }

  /**
   * Parse conflict markers from a file
   */
  static parseConflictFile(filePath: string, fileContent: string): ConflictBlock[] {
    const blocks: ConflictBlock[] = [];
    const lines = fileContent.split('\n');

    let inConflict = false;
    let inTheirs = false;
    let oursLines: string[] = [];
    let theirsLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        inConflict = true;
        inTheirs = false;
        oursLines = [];
        theirsLines = [];
      } else if (line.startsWith('=======') && inConflict) {
        inTheirs = true;
      } else if (line.startsWith('>>>>>>>') && inConflict) {
        inConflict = false;
        blocks.push({
          filePath,
          ours: oursLines.join('\n'),
          theirs: theirsLines.join('\n')
        });
      } else if (inConflict) {
        if (inTheirs) {
          theirsLines.push(line);
        } else {
          oursLines.push(line);
        }
      }
    }

    return blocks;
  }

  /**
   * Automatically resolve all conflicted files with AI assistance
   */
  async resolveAllConflicts(context: RepoContext, autoConfirm = false): Promise<boolean> {
    if (!context.conflictedFiles || context.conflictedFiles.length === 0) {
      console.log(theme.green(`${theme.symbols.check} No merge conflicts detected.`));
      return true;
    }

    const repoRoot = context.repoRoot || this.executor.getCwd();
    console.log(`\n${theme.purpleBold(`${theme.symbols.diamond} Resolving ${context.conflictedFiles.length} conflicted file(s) with AI...`)}\n`);

    for (const fileRel of context.conflictedFiles) {
      const fullPath = path.isAbsolute(fileRel) ? fileRel : path.join(repoRoot, fileRel);

      if (!fs.existsSync(fullPath)) {
        logger.warn(`Conflicted file not found on disk: ${fullPath}`);
        continue;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const conflicts = ConflictResolver.parseConflictFile(fileRel, content);

      if (conflicts.length === 0) {
        logger.debug(`No conflict markers found in ${fileRel}`);
        continue;
      }

      console.log(`${theme.cyanBold(`${theme.symbols.bullet} Analyzing conflict in:`)} ${theme.whiteBold(fileRel)}`);

      let newContent = content;
      for (const block of conflicts) {
        const resolution = await this.aiProvider.resolveConflict(block, context);

        console.log(`\n  ${theme.greenBold('AI Resolution Explanation:')} ${theme.gray(resolution.explanation)}`);
        console.log(`  ${theme.cyanBold('Proposed Content Preview:')}`);
        const previewLines = resolution.resolvedContent.split('\n').map(l => `    ${theme.green(`+ ${l}`)}`).join('\n');
        console.log(previewLines);

        let accept = autoConfirm;
        if (!accept) {
          const res = await prompts({
            type: 'confirm',
            name: 'value',
            message: theme.cyanBold(`Apply this resolution for ${fileRel}?`),
            initial: true
          });
          accept = Boolean(res.value);
        }

        if (accept) {
          // Replace raw conflict block inside file with resolvedContent
          const conflictRegex = new RegExp(
            `<<<<<<<[\\s\\S]*?=======[\\s\\S]*?>>>>>>>[^\\n]*\\n?`,
            'm'
          );
          newContent = newContent.replace(conflictRegex, `${resolution.resolvedContent}\n`);
        } else {
          console.log(theme.yellow(`Skipped manual resolution for ${fileRel}`));
          return false;
        }
      }

      // Write resolved file
      fs.writeFileSync(fullPath, newContent, 'utf-8');

      // Stage the resolved file
      await this.executor.exec(['add', fileRel]);
      console.log(`\n${theme.green(`${theme.symbols.check} Staged resolved file:`)} ${theme.whiteBold(fileRel)}\n`);
    }

    return true;
  }
}
