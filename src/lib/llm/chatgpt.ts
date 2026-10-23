import {
  LlmError,
  type ChatMessage,
  type Connection,
  type JsonSchemaFormat,
  type Usage,
} from './types';
import type { ModelInfo } from './providers';


const CLIENT_VERSION = '0.160.0';

let contextWindows: Promise<Map<string, number>> | null = null;

export async function completeChatGptJson(
  connection: Connection,
  options: {
    messages: ChatMessage[];
    format: JsonSchemaFormat;
    onUsage?: (usage: Usage) => void;
  },
): Promise<string> {
  const system = options.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const input = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      type: 'message',
      role: m.role,
      content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content }],
    }));

  const response = await fetch(`${connection.provider.baseUrl}/responses`, {
    method: 'POST',
    headers: { ...headers(connection), accept: 'text/event-stream' },
    body: JSON.stringify({
      model: connection.model,
      instructions: system,
      input,
      store: false,
      stream: true,
      text: {
        format: {
          type: 'json_schema',
          name: options.format.name,
          schema: options.format.schema,
          strict: true,
        },
      },
      ...(connection.thinking ? { reasoning: { effort: connection.thinking } } : {}),
      ...(connection.fast ? { service_tier: 'priority' } : {}),
    }),
  });
  if (!response.ok) throw await toError(response);

  const { text, tokens } = await readOutput(response);
  if (options.onUsage && tokens) {
    options.onUsage({ ...tokens, contextWindow: await contextWindow(connection) });
  }
  return text;
}

export async function listChatGptModels(connection: Connection): Promise<ModelInfo[]> {
  const response = await fetch(
    `${connection.provider.baseUrl}/models?client_version=${CLIENT_VERSION}`,
    { headers: headers(connection) },
  );
  if (!response.ok) throw await toError(response);

  const body = (await response.json()) as {
    models: {
      slug: string;
      display_name?: string;
      visibility?: string;
      default_reasoning_level?: string;
      supported_reasoning_levels?: { effort: string }[];
      context_window?: number | null;
    }[];
  };

  return body.models
    .filter((m) => m.visibility !== 'hide')
    .map((m) => ({
      id: m.slug,
      label: m.display_name ?? m.slug,
      thinking: (m.supported_reasoning_levels ?? []).map((level) => level.effort),
      defaultThinking: m.default_reasoning_level ?? null,
      contextWindow: m.context_window ?? undefined,
    }));
}

async function contextWindow(connection: Connection): Promise<number | null> {
  contextWindows ??= listChatGptModels(connection)
    .then(
      (models) =>
        new Map(models.flatMap((m) => (m.contextWindow ? [[m.id, m.contextWindow]] : []))),
    )
    .catch(() => {
      contextWindows = null;
      return new Map();
    });
  return (await contextWindows).get(connection.model) ?? null;
}

function headers(connection: Connection): Record<string, string> {
  return {
    Authorization: `Bearer ${connection.token}`,
    'chatgpt-account-id': connection.accountId ?? '',
    'OpenAI-Beta': 'responses=experimental',
    originator: 'codex_cli_rs',
    'Content-Type': 'application/json',
  };
}

async function readOutput(
  response: Response,
): Promise<{ text: string; tokens: Omit<Usage, 'contextWindow'> | null }> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let text = '';
  let tokens: Omit<Usage, 'contextWindow'> | null = null;

  for (; ;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    // Events are separated by a blank line; keep any partial event for later.
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (!data || data === '[DONE]') continue;

      const parsed = JSON.parse(data) as {
        type: string;
        delta?: string;
        response?: {
          error?: { message?: string };
          usage?: { input_tokens?: number; output_tokens?: number };
        };
      };
      if (parsed.type === 'response.output_text.delta' && parsed.delta) text += parsed.delta;
      if (parsed.type === 'response.completed' && parsed.response?.usage) {
        const { input_tokens = 0, output_tokens = 0 } = parsed.response.usage;
        tokens = { inputTokens: input_tokens, outputTokens: output_tokens };
      }
      if (parsed.type === 'response.failed' || parsed.type === 'error') {
        throw new LlmError(parsed.response?.error?.message ?? 'ChatGPT request failed', 0);
      }
    }
  }

  if (!text) throw new LlmError('ChatGPT returned an empty response', 0);
  return { text, tokens };
}

async function toError(response: Response): Promise<LlmError> {
  let detail = response.statusText;
  try {
    const body = (await response.json()) as { detail?: string; error?: { message?: string } };
    detail = body.error?.message ?? body.detail ?? detail;
  } catch {
    // Not JSON.
  }
  if (response.status === 401) detail = 'ChatGPT session is no longer valid. Sign in again';
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'));
    return new LlmError(
      'ChatGPT usage limit reached, pausing',
      429,
      Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
    );
  }
  return new LlmError(detail, response.status);
}
