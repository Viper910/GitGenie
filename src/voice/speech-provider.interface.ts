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
   * Resolves when the session stops (e.g., silence detected or manual stop).
   * @param onInterim Callback for interim updates
   * @param onFinal Callback for finalized sentences (for continuous mode)
   */
  listen(onInterim?: (text: string) => void, onFinal?: (text: string) => void): Promise<RecognizedText>;

  /**
   * Stop the current listening session.
   */
  stop(): Promise<void>;

  /**
   * Clean up resources when exiting GitGenie.
   */
  cleanup(): Promise<void>;
}
