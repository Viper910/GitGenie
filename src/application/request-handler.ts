import { ConfigManager } from '../config/config-manager.js';
import { OpenRouterProvider } from '../ai/openrouter-provider.js';
import { MockAIProvider } from '../ai/mock-provider.js';
import { AIProvider } from '../ai/ai-provider.interface.js';
import { WorkflowEngine, WorkflowOptions } from './workflow-engine.js';
import { TerminalRenderer } from '../terminal/renderer.js';
import { theme } from '../terminal/theme.js';
import { logger } from '../terminal/logger.js';

export class RequestHandler {
  /**
   * Handle user prompt request
   */
  static async handle(userRequest: string, options?: WorkflowOptions): Promise<boolean> {
    const config = ConfigManager.getEffectiveConfig();

    let aiProvider: AIProvider;

    if (config.provider === 'mock' || !config.apiKey) {
      if (!config.apiKey && config.provider !== 'mock') {
        logger.warn(
          'No OPENROUTER_API_KEY detected. Running in Deterministic Mode. Set your API key with `gitgenie config set api-key <KEY>` to use OpenRouter AI models.'
        );
      }
      aiProvider = new MockAIProvider();
    } else {
      try {
        aiProvider = new OpenRouterProvider({
          apiKey: config.apiKey,
          model: config.model,
          timeoutMs: config.timeoutMs
        });
      } catch (err) {
        logger.warn(`Failed to initialize OpenRouter provider: ${(err as Error).message}. Falling back to deterministic mode.`);
        aiProvider = new MockAIProvider();
      }
    }

    const engine = new WorkflowEngine(aiProvider, options);

    try {
      const success = await engine.run(userRequest, options);
      return success;
    } catch (err) {
      const errorMessage = (err as Error).message || 'An unexpected error occurred';
      logger.debug('Workflow execution error:', err);

      TerminalRenderer.renderErrorCard(
        'GitGenie Workflow Error',
        errorMessage,
        'Check that your Git configuration is valid and that you have network access if using OpenRouter AI.'
      );

      return false;
    }
  }
}
