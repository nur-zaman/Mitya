import Anthropic from '@anthropic-ai/sdk';
import { inferModelInfo, type ModelInfo } from './providers';
import { LlmError, type ChatMessage, type Connection, type JsonSchemaFormat } from './types';

/*
 * Claude, through the official Anthropic SDK. The key lives in the user's own
 * browser storage and only ever goes to api.anthropic.com, which is why the
 * SDK's browser guard is switched off.
 */

/** Models that can rerun a declined request on a fallback model server-side. */
const SUPPORTS_FALLBACK = /claude-(fable-5|opus-5|sonnet-5-5)/;
/** Fast mode is a research preview on these models only. */
const SUPPORTS_FAST = /claude-opus-(5|4-8)/;

export async function completeClaudeJson(
  connection: Connection,
  options: { messages: ChatMessage[]; format: JsonSchemaFormat; maxTokens?: number },
): Promise<string> {
  const { model } = connection;
  const system = options.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const messages = options.messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const fast = connection.fast && SUPPORTS_FAST.test(model);
  const fallback = SUPPORTS_FALLBACK.test(model);
  const betas = [
    ...(fast ? ['fast-mode-2026-02-01'] : []),
    ...(fallback ? ['server-side-fallback-2026-07-01'] : []),
  ];

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client(connection).beta.messages.create({
      model,
      max_tokens: options.maxTokens ?? 8000,
      system,
      messages,
      output_config: {
        format: { type: 'json_schema', schema: options.format.schema },
        ...(connection.thinking ? { effort: connection.thinking as 'low' } : {}),
      },
      ...(fast ? { speed: 'fast' as const } : {}),
      ...(fallback ? { fallbacks: 'default' as const } : {}),
      ...(betas.length ? { betas } : {}),
    });
  } catch (error) {
    throw toLlmError(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new LlmError('Claude declined to answer this one', 0);
  }
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (!text) throw new LlmError(`Empty response (stop reason: ${response.stop_reason})`, 0);
  return text;
}

export async function listClaudeModels(connection: Connection): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
  try {
    for await (const model of client(connection).models.list()) {
      models.push({ ...inferModelInfo('anthropic', model.id), label: model.display_name });
    }
  } catch (error) {
    throw toLlmError(error);
  }
  return models;
}

function client(connection: Connection): Anthropic {
  if (!connection.token) throw new LlmError('Add your Anthropic API key in settings', 401);
  return new Anthropic({
    apiKey: connection.token,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new LlmError('Anthropic rejected the API key', 401);
  }
  if (error instanceof Anthropic.RateLimitError) {
    const seconds = Number(error.headers?.get('retry-after'));
    return new LlmError(
      'Anthropic rate limit reached, pausing briefly',
      429,
      Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
    );
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmError("Couldn't reach Anthropic", 0);
  }
  if (error instanceof Anthropic.APIError) {
    return new LlmError(error.message, error.status ?? 0);
  }
  return new LlmError(error instanceof Error ? error.message : String(error), 0);
}
