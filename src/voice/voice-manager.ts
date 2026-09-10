import { SpeechRecognitionProvider, RecognizedText } from './speech-provider.interface.js';
import { SherpaProvider } from './providers/sherpa-provider.js';
import { theme } from '../terminal/theme.js';
import * as readline from 'readline';

export class VoiceManager {
  private provider: SpeechRecognitionProvider;

  constructor() {
    this.provider = new SherpaProvider();
  }

  async initialize(): Promise<void> {
    try {
      await this.provider.initialize();
    } catch (e) {
      console.log(theme.yellow(`⚠ Voice recognition unavailable: ${(e as Error).message}`));
    }
  }

  async listenForCommand(): Promise<string | null> {
    process.stdout.write(theme.purpleBold('\n🎙 Listening... '));

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
      });

      let stopped = false;
      const stopRecording = () => {
        if (stopped) return;
        stopped = true;
        rl.close();
        process.stdout.write(theme.gray('\nFinalizing transcription... '));
        this.provider.stop();
      };

      rl.on('line', () => { stopRecording(); });
      rl.on('SIGINT', () => { stopRecording(); });

      // The onInterim callback
      const onInterim = (text: string) => {
        if (stopped) return;
        // Move to start of line, clear it, and print the updated text
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`${theme.purpleBold('🎙 Listening...')} ${theme.cyan(text)}`);
      };

      this.provider.listen(onInterim).then((result: RecognizedText) => {
        if (!stopped) {
          stopped = true;
          rl.close();
          process.stdout.write(theme.gray('\nFinalizing transcription... '));
        }

        process.stdout.write(theme.green('Done.\n'));

        if (result && result.text) {
          console.log(`\n${theme.purple('Heard:')}`);
          console.log(`"${theme.whiteBold(result.text)}"\n`);
          resolve(result.text);
        } else {
          resolve(null);
        }
      }).catch((error) => {
        if (!stopped) rl.close();
        console.log(theme.yellow(`\n⚠ Voice recognition failed: ${error.message}`));
        resolve(null);
      });
    });
  }

  async stopListening(): Promise<void> {
    await this.provider.stop();
  }

  async shutdown(): Promise<void> {
    await this.provider.cleanup();
  }
}
