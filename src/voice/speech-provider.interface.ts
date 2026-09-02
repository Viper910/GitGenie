export interface RecognizedText {
  text: string;
  confidence: number;
}

export interface SpeechRecognitionProvider {
  /**
   * Initialize the provider, load models, request permissions, etc.
   */
  initialize(): Promise<void>;

  /**
   * Start listening for voice input.
   * Returns a promise that resolves with the transcribed text when recording stops (e.g., silence detected or manual stop).
   */
  listen(): Promise<RecognizedText>;

  /**
   * Stop the current listening session.
   */
  stop(): Promise<void>;

  /**
   * Clean up resources when exiting GitGenie.
   */
  cleanup(): Promise<void>;
}
