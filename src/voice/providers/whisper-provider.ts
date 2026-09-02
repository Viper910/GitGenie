import { SpeechRecognitionProvider, RecognizedText } from '../speech-provider.interface.js';
import { logger } from '../../terminal/logger.js';
import { theme } from '../../terminal/theme.js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import { initWhisper } from '@fugood/whisper.node';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL_DIR = path.join(__dirname, '..', 'models');
const MODEL_NAME = 'ggml-tiny.en.bin';
const MODEL_PATH = path.join(MODEL_DIR, MODEL_NAME);
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin';

export class WhisperProvider implements SpeechRecognitionProvider {
  private isListening: boolean = false;
  private whisperContext: any = null;
  private ffmpegProcess: ChildProcess | null = null;
  private audioChunks: Buffer[] = [];
  
  async initialize(): Promise<void> {
    logger.debug('Initializing Whisper.cpp provider...');
    await this.ensureModelExists();
    
    try {
      this.whisperContext = await initWhisper({
        filePath: MODEL_PATH,
        useGpu: false, // Fallback to CPU to ensure broad compatibility without driver issues
      });
      logger.debug('Whisper context initialized.');
    } catch (err: any) {
      logger.debug('Failed to initialize Whisper context', err);
      throw new Error('Failed to initialize Whisper engine: ' + err.message);
    }
  }

  private async ensureModelExists(): Promise<void> {
    if (!fs.existsSync(MODEL_DIR)) {
      fs.mkdirSync(MODEL_DIR, { recursive: true });
    }

    if (fs.existsSync(MODEL_PATH)) {
      return;
    }

    console.log(theme.cyan(`\nDownloading local Whisper AI model (tiny.en, ~75MB)...`));
    console.log(theme.gray(`This is a one-time download and runs completely offline afterwards.`));
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(MODEL_PATH);
      
      const download = (url: string) => {
        https.get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            return download(response.headers.location!);
          }
          if (response.statusCode !== 200) {
            file.close();
            fs.unlinkSync(MODEL_PATH);
            return reject(new Error(`Failed to download model: HTTP ${response.statusCode}`));
          }
          
          let downloaded = 0;
          const total = parseInt(response.headers['content-length'] || '0', 10);
          
          response.on('data', (chunk) => {
            downloaded += chunk.length;
            if (total > 0) {
              const percent = ((downloaded / total) * 100).toFixed(1);
              process.stdout.write(`\r${theme.cyan('Downloading:')} ${percent}% `);
            }
          });

          response.pipe(file);
          
          file.on('finish', () => {
            file.close();
            process.stdout.write('\n');
            console.log(theme.green('✓ Model downloaded successfully.'));
            resolve();
          });
        }).on('error', (err) => {
          fs.unlinkSync(MODEL_PATH);
          reject(err);
        });
      };
      
      download(MODEL_URL);
    });
  }

  private getFfmpegArgs(): string[] {
    const platform = os.platform();
    if (platform === 'win32') {
      // Find the first audio device using dshow
      let deviceName = 'audio=dummy';
      if (ffmpeg) {
        try {
          const ffmpegPath = ffmpeg as unknown as string;
          const out = spawnSync(ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { encoding: 'utf8' });
          const match = out.stderr.match(/\[dshow @ [^\]]+\] "(.*?)" \(audio\)/);
          if (match && match[1]) {
            deviceName = `audio=${match[1]}`;
          }
        } catch (e) {
          logger.debug('Failed to list dshow devices', e);
        }
      }
      return ['-f', 'dshow', '-i', deviceName, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'];
    } else if (platform === 'darwin') {
      return ['-f', 'avfoundation', '-i', ':0', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'];
    } else if (platform === 'linux') {
      // Assuming pulse is available, fallback to alsa default could also be tested
      return ['-f', 'pulse', '-i', 'default', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'];
    }
    
    throw new Error('Unsupported platform for audio recording.');
  }

  private getVolume(buffer: Buffer): number {
    let sum = 0;
    for (let i = 0; i < buffer.length - 1; i += 2) {
      const val = buffer.readInt16LE(i);
      sum += Math.abs(val);
    }
    return buffer.length > 0 ? sum / (buffer.length / 2) : 0;
  }

  async listen(): Promise<RecognizedText> {
    if (!this.whisperContext) {
      throw new Error('WhisperProvider not initialized');
    }

    this.isListening = true;
    this.audioChunks = [];

    const args = this.getFfmpegArgs();
    
    return new Promise((resolve, reject) => {
      if (!ffmpeg) {
        this.isListening = false;
        return reject(new Error('ffmpeg-static is not available.'));
      }

      const ffmpegPath = ffmpeg as unknown as string;
      this.ffmpegProcess = spawn(ffmpegPath, args);

      let speakingStarted = false;
      let silenceBytes = 0;
      const SPEAKING_THRESHOLD = 300; // Conservative threshold for voice activity
      const SILENCE_BYTES_THRESHOLD = 32000 * 1.5; // 1.5 seconds at 16kHz 16-bit mono

      this.ffmpegProcess.stdout!.on('data', (chunk: Buffer) => {
        if (this.isListening) {
          this.audioChunks.push(chunk);
          
          const volume = this.getVolume(chunk);
          if (volume > SPEAKING_THRESHOLD) {
            speakingStarted = true;
            silenceBytes = 0;
          } else if (speakingStarted) {
            silenceBytes += chunk.length;
            if (silenceBytes > SILENCE_BYTES_THRESHOLD) {
              this.stop();
            }
          }
        }
      });

      this.ffmpegProcess.on('error', (err) => {
        logger.debug('ffmpeg process error', err);
        this.isListening = false;
        resolve({ text: '', confidence: 0 });
      });

      this.ffmpegProcess.on('close', async () => {
        this.isListening = false;
        
        if (this.audioChunks.length === 0) {
          resolve({ text: '', confidence: 0 });
          return;
        }

        const audioBuffer = Buffer.concat(this.audioChunks);
        
        // Whisper node requires an ArrayBuffer
        const arrayBuffer = new Uint8Array(audioBuffer).buffer;

        try {
          const { promise } = this.whisperContext.transcribeData(arrayBuffer, {
            language: 'en',
            temperature: 0.0,
          });
          
          const result = await promise;
          // The result usually returns text, but we may need to access segments or similar depending on fugood API
          const text = (result && typeof result === 'object' && result.result) ? result.result.trim() : (result || '').toString().trim();
          
          resolve({
            text: text,
            confidence: 0.9 // Placeholder, as raw API doesn't cleanly expose overall confidence
          });
        } catch (e) {
          logger.debug('Transcription failed', e);
          resolve({ text: '', confidence: 0 });
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.isListening && this.ffmpegProcess) {
      this.isListening = false;
      this.ffmpegProcess.kill('SIGINT');
      this.ffmpegProcess = null;
    }
  }

  async cleanup(): Promise<void> {
    await this.stop();
    if (this.whisperContext) {
      try {
        await this.whisperContext.release();
      } catch (e) {
        // ignore
      }
    }
    logger.debug('Cleaned up Whisper resources');
  }
}
