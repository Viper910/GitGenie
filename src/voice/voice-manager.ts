import { SpeechRecognitionProvider, RecognizedText } from './speech-provider.interface.js';
import { SherpaProvider } from './providers/sherpa-provider.js';
import { theme } from '../terminal/theme.js';
import { EventEmitter } from 'events';
import { logger } from '../terminal/logger.js';
import { ConfigManager } from '../config/config-manager.js';

export class VoiceManager extends EventEmitter {
  private provider: SpeechRecognitionProvider;
  private isListening: boolean = false;
  private submitTimer: NodeJS.Timeout | null = null;
  private lastSubmittedText: string = '';

  constructor() {
    super();
    this.provider = new SherpaProvider();
  }

  async initialize(): Promise<void> {
    try {
      await this.provider.initialize();
    } catch (e) {
      logger.warn(`Voice recognition unavailable: ${(e as Error).message}`);
    }
  }

  get isCurrentlyListening(): boolean {
    return this.isListening;
  }

  /**
   * Starts listening in the background. Emits 'interim' and 'final' events.
   */
  async startListening(): Promise<void> {
    if (this.isListening) return;
    this.isListening = true;

    try {
      this.emit('start');
      const result = await this.provider.listen(
        (interimText) => {
          this.clearSubmitTimer();
          this.emit('interim', interimText);
        },
        (finalText) => {
          this.handleFinalText(finalText);
        }
      );
      
      this.isListening = false;
      this.emit('stop');
      
      if (result && result.text) {
        this.handleFinalText(result.text);
      }
    } catch (error) {
      this.isListening = false;
      this.emit('stop');
      logger.warn(`Voice recognition failed: ${(error as Error).message}`);
    }
  }

  async stopListening(): Promise<void> {
    this.clearSubmitTimer();
    if (!this.isListening) return;
    await this.provider.stop();
    this.isListening = false;
    this.emit('stop');
  }

  async shutdown(): Promise<void> {
    await this.stopListening();
    await this.provider.cleanup();
  }

  private handleFinalText(text: string) {
    if (!text.trim()) return;
    
    // Deduplication (prevent submitting same final text twice in a row if emitted again)
    if (this.lastSubmittedText === text) return;

    this.emit('final', text);
    
    const lower = text.toLowerCase().trim().replace(/[.,!?]+$/, '');
    
    // Check for explicit cancellation
    if (['cancel', 'never mind', 'clear that', 'stop listening'].includes(lower)) {
      this.clearSubmitTimer();
      this.emit('cancel');
      return;
    }

    // Check for interrupts / high priority commands
    if (['stop', 'abort', "stop what you're doing", 'cancel the current task', 'exit gitgenie', 'close gitgenie', 'quit'].includes(lower)) {
      this.clearSubmitTimer();
      this.lastSubmittedText = text;
      this.emit('interrupt');
      this.emit('submit');
      return;
    }

    // Normal command - start auto-submit timer if enabled
    const config = ConfigManager.getEffectiveConfig();
    if (config.voice.autoSubmit.enabled) {
      this.clearSubmitTimer();
      this.submitTimer = setTimeout(() => {
        this.lastSubmittedText = text;
        this.emit('submit');
      }, config.voice.autoSubmit.silenceTimeoutMs);
    }
  }

  private clearSubmitTimer() {
    if (this.submitTimer) {
      clearTimeout(this.submitTimer);
      this.submitTimer = null;
    }
  }

  /**
   * Checks if a transcribed text is an interruption command.
   * (Kept for backward compatibility, but mainly handled in handleFinalText now)
   */
  private checkInterruption(text: string) {
    const lower = text.toLowerCase().trim().replace(/[.,!?]+$/, '');
    if (['stop', 'cancel', 'abort', "stop what you're doing", 'cancel the current task'].includes(lower)) {
      this.emit('interrupt');
    }
  }

  /**
   * One-off listening for simple confirmations without terminal UI integration.
   */
  async listenForCommand(): Promise<string | null> {
    return new Promise((resolve) => {
      const onFinal = (text: string) => {
        this.stopListening();
        this.removeListener('final', onFinal);
        resolve(text);
      };
      
      this.on('final', onFinal);
      
      if (!this.isListening) {
        this.startListening().catch(() => resolve(null));
      }
    });
  }
}
