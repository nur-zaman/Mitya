import type { Provider } from './providers';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface JsonSchemaFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface Connection {
  provider: Provider;
  model: string;
  token: string;
  accountId?: string;
  thinking: string | null;
  fast: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  contextWindow: number | null;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** How long the provider asked us to wait, when it said so. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
