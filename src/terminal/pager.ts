import { spawnSync } from 'child_process';
import { logger } from './logger.js';

export class Pager {
  /**
   * Display text in a terminal pager if it exceeds the terminal height.
   * Otherwise, prints it normally.
   */
  static display(text: string): boolean {
    const lines = text.split('\n');
    const terminalHeight = process.stdout.rows || 24;
    
    // Only use pager if content is larger than screen
    if (lines.length <= terminalHeight - 5) {
      return false; // Return false to indicate we didn't page
    }

    // Determine the pager command
    let pagerCmd = process.env.PAGER;
    if (!pagerCmd) {
       // -R allows ANSI colors to pass through, -F quits if one screen, -X prevents clearing screen on exit
       pagerCmd = 'less -R -F -X'; 
    }

    const [cmd, ...args] = pagerCmd.split(' ');

    try {
      const res = spawnSync(cmd, args, {
        input: text,
        stdio: ['pipe', 'inherit', 'inherit']
      });
      if (res.error) {
        throw res.error;
      }
      return true;
    } catch (err) {
      logger.debug(`Pager '${pagerCmd}' failed, falling back to raw output:`, err);
      // If 'less' failed on Windows, try 'more'
      if (process.platform === 'win32' && cmd !== 'more') {
        try {
          const fallbackRes = spawnSync('more', [], {
            input: text,
            stdio: ['pipe', 'inherit', 'inherit']
          });
          if (!fallbackRes.error) return true;
        } catch {
          // ignore
        }
      }
      return false;
    }
  }
}
