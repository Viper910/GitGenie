import { RepoContext } from '../git/repository-inspector.js';
import type { VoiceManager } from '../voice/voice-manager.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class SessionContext {
  public conversationContext: ChatMessage[] = [];
  public voiceModeActive: boolean = false;
  public voiceAwakeMode: boolean = false;
  public voiceManager?: VoiceManager;
  
  constructor() {
    this.conversationContext = [];
  }

  public addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    this.conversationContext.push({ role, content });
    
    // Keep context window bounded, e.g., last 20 messages
    if (this.conversationContext.length > 20) {
      this.conversationContext.shift();
    }
  }

  public getHistory(): ChatMessage[] {
    return this.conversationContext;
  }
  
  public clearHistory(): void {
    this.conversationContext = [];
  }
}
