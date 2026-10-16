import type { Provider } from './providers';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface JsonSchemaFormat {
  name: string;
  schema: Record<string, unknown>;
}

/** Everything needed to make one request: where, as whom, and how. */
export interface Connection {
  provider: Provider;
  model: string;
  /** API key, or a ChatGPT access token. */
  token: string;
  /** ChatGPT workspace id; only set for the ChatGPT provider. */
  accountId?: string;
  /** Reasoning effort, or null for the model's default. */
  thinking: string | null;
  /** Ask for the provider's priority tier where it has one. */
  fast: boolean;
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
