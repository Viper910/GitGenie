import { SpeechRecognitionProvider, RecognizedText } from './speech-provider.interface.js';
import { WhisperProvider } from './providers/whisper-provider.js';
import { theme } from '../terminal/theme.js';
import * as readline from 'readline';

export class VoiceManager {
  private provider: SpeechRecognitionProvider;

  constructor() {
    this.provider = new WhisperProvider();
  }

  async initialize(): Promise<void> {
    try {
      await this.provider.initialize();
    } catch (e) {
      console.log(theme.yellow(`⚠ Voice recognition unavailable: ${(e as Error).message}`));
    }
  }

  async listenForCommand(): Promise<string | null> {
    process.stdout.write(theme.purpleBold('\n🎙 Listening... (Auto-stops when you stop speaking)\n'));

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
        process.stdout.write(theme.gray('Transcribing... '));
        this.provider.stop(); 
      };

      // Optional manual override if they press enter
      rl.on('line', () => {
        stopRecording();
      });

      rl.on('SIGINT', () => {
        // Handle Ctrl+C gracefully
        stopRecording();
      });

      this.provider.listen().then((result: RecognizedText) => {
        if (!stopped) {
          stopped = true;
          rl.close();
          process.stdout.write(theme.gray('Transcribing... '));
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
