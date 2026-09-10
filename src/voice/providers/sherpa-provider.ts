import { SpeechRecognitionProvider, RecognizedText } from '../speech-provider.interface.js';
import { logger } from '../../terminal/logger.js';
import { theme } from '../../terminal/theme.js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import { fileURLToPath } from 'url';
// @ts-ignore
import sherpa from 'sherpa-onnx';

const MODEL_DIR = path.join(os.homedir(), '.gitgenie', 'models', 'sherpa');

const BASE_URL = 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-02-21/resolve/main/';
const FILES = [
  'encoder-epoch-99-avg-1.onnx',
  'decoder-epoch-99-avg-1.onnx',
  'joiner-epoch-99-avg-1.onnx',
  'tokens.txt'
];

export class SherpaProvider implements SpeechRecognitionProvider {
  private isListening: boolean = false;
  private recognizer: any = null;
  private ffmpegProcess: ChildProcess | null = null;

  async initialize(): Promise<void> {
    logger.debug('Initializing Sherpa-ONNX provider...');
    await this.ensureModelExists();

    try {
      const config = {
        featConfig: {
          sampleRate: 16000,
          featureDim: 80,
        },
        modelConfig: {
          transducer: {
            encoder: path.join(MODEL_DIR, 'encoder-epoch-99-avg-1.onnx'),
            decoder: path.join(MODEL_DIR, 'decoder-epoch-99-avg-1.onnx'),
            joiner: path.join(MODEL_DIR, 'joiner-epoch-99-avg-1.onnx'),
          },
          tokens: path.join(MODEL_DIR, 'tokens.txt'),
          numThreads: 2,
          provider: 'cpu',
          debug: 0,
        },
        decodingMethod: 'greedy_search',
        maxActivePaths: 4,
        enableEndpoint: 1, // Sherpa's endpointing (VAD)
        rule1MinTrailingSilence: 1.5,
        rule2MinTrailingSilence: 0.8,
        rule3MinUtteranceLength: 20,
      };

      this.recognizer = sherpa.createOnlineRecognizer(config);
      logger.debug('Sherpa-ONNX context initialized.');
    } catch (err: any) {
      logger.debug('Failed to initialize Sherpa-ONNX context', err);
      throw new Error('Failed to initialize Sherpa-ONNX engine: ' + err.message);
    }
  }

  private async ensureModelExists(): Promise<void> {
    if (!fs.existsSync(MODEL_DIR)) {
      fs.mkdirSync(MODEL_DIR, { recursive: true });
    }

    const missingFiles = FILES.filter(f => !fs.existsSync(path.join(MODEL_DIR, f)));
    if (missingFiles.length === 0) {
      return;
    }

    console.log(theme.cyan(`\nDownloading local Sherpa-ONNX AI model (~140MB)...`));
    console.log(theme.gray(`This is a one-time download and runs completely offline afterwards.`));

    for (const filename of missingFiles) {
      await this.downloadFile(BASE_URL + filename, path.join(MODEL_DIR, filename), filename);
    }

    console.log(theme.green('\n✓ Model downloaded successfully.'));
  }

  private downloadFile(url: string, dest: string, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);

      const download = (url: string) => {
        https.get(url, (response) => {
          if ([301, 302, 307, 308].includes(response.statusCode || 0)) {
            let redirectUrl = response.headers.location!;
            if (redirectUrl.startsWith('/')) {
              const urlObj = new URL(url);
              redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
            }
            return download(redirectUrl);
          }
          if (response.statusCode !== 200) {
            file.close();
            fs.unlinkSync(dest);
            return reject(new Error(`Failed to download model file ${name}: HTTP ${response.statusCode}`));
          }

          let downloaded = 0;
          const total = parseInt(response.headers['content-length'] || '0', 10);

          response.on('data', (chunk) => {
            downloaded += chunk.length;
            if (total > 0) {
              const percent = ((downloaded / total) * 100).toFixed(1);
              process.stdout.write(`\r${theme.cyan('Downloading')} ${name}: ${percent}% `);
            }
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            process.stdout.write('\n');
            resolve();
          });
        }).on('error', (err) => {
          fs.unlinkSync(dest);
          reject(err);
        });
      };

      download(url);
    });
  }

  private getFfmpegArgs(): string[] {
    const platform = os.platform();
    if (platform === 'win32') {
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
      return ['-f', 'pulse', '-i', 'default', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'];
    }

    throw new Error('Unsupported platform for audio recording.');
  }

  async listen(onInterim?: (text: string) => void, onFinal?: (text: string) => void): Promise<RecognizedText> {
    if (!this.recognizer) {
      throw new Error('SherpaProvider not initialized');
    }

    this.isListening = true;
    const stream = this.recognizer.createStream();

    const args = this.getFfmpegArgs();

    return new Promise((resolve, reject) => {
      if (!ffmpeg) {
        this.isListening = false;
        return reject(new Error('ffmpeg-static is not available.'));
      }

      const ffmpegPath = ffmpeg as unknown as string;
      this.ffmpegProcess = spawn(ffmpegPath, args);

      let lastText = '';

      this.ffmpegProcess.stdout!.on('data', (chunk: Buffer) => {
        if (!this.isListening) return;

        try {
          // Convert PCM 16-bit to Float32 [-1, 1]
          const floatSamples = new Float32Array(chunk.length / 2);
          for (let i = 0; i < chunk.length - 1; i += 2) {
            const val = chunk.readInt16LE(i);
            floatSamples[i / 2] = val / 32768.0;
          }

          stream.acceptWaveform(16000, floatSamples);

          while (this.recognizer.isReady(stream)) {
            this.recognizer.decode(stream);
          }

          const result = this.recognizer.getResult(stream);
          if (result && result.text && result.text !== lastText) {
            lastText = result.text;
            if (onInterim) {
              onInterim(result.text);
            }
          }

          if (this.recognizer.isEndpoint(stream)) {
            if (onFinal && lastText) {
               onFinal(lastText);
            }
            if (typeof this.recognizer.reset === 'function') {
              this.recognizer.reset(stream);
            } else if (typeof stream.reset === 'function') {
              // @ts-ignore
              stream.reset();
            }
            lastText = '';
          }
        } catch (e: any) {
          logger.debug('Sherpa stream error:', e);
          // Don't throw, just ignore to avoid crashing process
        }
      });

      this.ffmpegProcess.on('error', (err) => {
        logger.debug('ffmpeg process error', err);
        this.isListening = false;
        stream.free();
        resolve({ text: '', confidence: 0 });
      });

      this.ffmpegProcess.on('close', () => {
        this.isListening = false;

        // Finalize stream
        stream.inputFinished();
        while (this.recognizer.isReady(stream)) {
          this.recognizer.decode(stream);
        }

        const result = this.recognizer.getResult(stream);
        const finalText = result && result.text ? result.text.trim() : '';
        stream.free();

        resolve({
          text: finalText,
          confidence: 0.9
        });
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
    if (this.recognizer) {
      try {
        this.recognizer.free();
      } catch (e) {
        // ignore
      }
      this.recognizer = null;
    }
    logger.debug('Cleaned up Sherpa-ONNX resources');
  }
}
