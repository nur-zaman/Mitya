import { completeClaudeJson, listClaudeModels } from './anthropic';
import { completeChatGptJson, listChatGptModels } from './chatgpt';
import { inferModelInfo, isChatModel, supportsStrictSchema, type ModelInfo } from './providers';
import {
  LlmError,
  type ChatMessage,
  type Connection,
  type JsonSchemaFormat,
  type Usage,
} from './types';

export { LlmError };
export type { ChatMessage, Connection, JsonSchemaFormat, Usage };

export async function listModels(connection: Connection): Promise<ModelInfo[]> {
  if (connection.provider.api === 'chatgpt') return listChatGptModels(connection);
  if (connection.provider.api === 'anthropic') return listClaudeModels(connection);

  const response = await request(connection, '/models', { method: 'GET' });
  const body = (await response.json()) as { data: { id: string }[] };
  return body.data
    .map((model) => model.id)
    .filter(isChatModel)
    .sort()
    .map((id) => inferModelInfo(connection.provider.id, id));
}

export async function completeJson<T>(
  connection: Connection,
  options: {
    messages: ChatMessage[];
    format: JsonSchemaFormat;
    maxTokens?: number;
    onUsage?: (usage: Usage) => void;
  },
): Promise<T> {
  const complete = {
    chatgpt: completeChatGptJson,
    anthropic: completeClaudeJson,
    'openai-chat': completeChat,
  }[connection.provider.api];
  const content = await complete(connection, options);

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new LlmError('The model returned malformed JSON', 0);
  }
}

async function completeChat(
  connection: Connection,
  options: { messages: ChatMessage[]; format: JsonSchemaFormat; maxTokens?: number },
): Promise<string> {
  const { provider, model } = connection;
  const strict = supportsStrictSchema(provider.id, model);
  const messages = strict
    ? options.messages
    : withSchemaInstructions(options.messages, options.format);

  const response = await request(connection, '/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: options.maxTokens ?? 2048,
      ...(connection.thinking ? { reasoning_effort: connection.thinking } : {}),
      ...(connection.fast && provider.fastTier ? { service_tier: 'priority' } : {}),
      response_format: strict
        ? {
            type: 'json_schema',
            json_schema: { name: options.format.name, schema: options.format.schema, strict: true },
          }
        : { type: 'json_object' },
    }),
  });

  const body = (await response.json()) as {
    choices: { message: { content: string | null }; finish_reason: string }[];
  };
  const choice = body.choices[0];
  if (!choice?.message.content) {
    throw new LlmError(`Empty response (finish reason: ${choice?.finish_reason})`, 0);
  }
  return choice.message.content;
}

function withSchemaInstructions(messages: ChatMessage[], format: JsonSchemaFormat): ChatMessage[] {
  const [system, ...rest] = messages;
  const instruction = `Respond with a single JSON object matching this JSON Schema, and nothing else:\n${JSON.stringify(format.schema)}`;
  if (system?.role !== 'system') return [{ role: 'system', content: instruction }, ...messages];
  return [{ role: 'system', content: `${system.content}\n\n${instruction}` }, ...rest];
}

async function request(connection: Connection, path: string, init: RequestInit): Promise<Response> {
  const { provider, token } = connection;
  if (!token) throw new LlmError(`Add your ${provider.label} API key in settings`, 401);

  let response: Response;
  try {
    response = await fetch(provider.baseUrl + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch {
    throw new LlmError(`Couldn't reach ${provider.label}`, 0);
  }
  if (response.ok) return response;

  let detail = response.statusText;
  try {
    const body = (await response.json()) as { message?: string; error?: { message?: string } };
    detail = body.error?.message ?? body.message ?? detail;
  } catch {
    // Not JSON. Keep the status text.
  }

  if (response.status === 401) detail = `${provider.label} rejected the API key`;
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    throw new LlmError(`${provider.label} rate limit reached, pausing briefly`, 429, retryAfterMs);
  }
  throw new LlmError(detail, response.status);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
