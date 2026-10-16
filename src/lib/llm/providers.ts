export type ProviderId = 'groq' | 'anthropic' | 'chatgpt' | 'openai';

export interface Provider {
  id: ProviderId;
  label: string;
  /** `key` providers take a pasted API key; `chatgpt` signs in with a ChatGPT account. */
  auth: 'key' | 'chatgpt';
  /** Which wire format the provider speaks. */
  api: 'openai-chat' | 'chatgpt' | 'anthropic';
  baseUrl: string;
  defaultModel: string;
  keyUrl: string;
  keyPrefix: string;
  blurb: string;
  /** Origins requested at runtime the first time this provider is picked. */
  origins: string[];
  /** Whether the provider has a paid low-latency tier we can switch on. */
  fastTier: boolean;
  /**
   * Rough ceiling for a live prompt, in characters (~4 per token). Free tiers
   * meter tokens per minute, so smaller prompts mean more suggestions.
   */
  livePromptChars: number;
  recapPromptChars: number;
  /** Floor between live calls, on top of the sensitivity setting. */
  minGapMs: number;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  groq: {
    id: 'groq',
    label: 'Groq',
    auth: 'key',
    api: 'openai-chat',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    keyUrl: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_',
    blurb: 'Free tier, very fast. Mitya paces itself to stay inside the limits.',
    origins: ['https://api.groq.com/*'],
    fastTier: false,
    // The free tier allows ~8k tokens a minute, so keep each call near 3k.
    livePromptChars: 11_000,
    recapPromptChars: 26_000,
    minGapMs: 20_000,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Claude',
    auth: 'key',
    api: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-5-5',
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyPrefix: 'sk-ant-',
    blurb: 'Anthropic API, billed per use. Fast mode is available on Opus models.',
    origins: ['https://api.anthropic.com/*'],
    fastTier: true,
    livePromptChars: 40_000,
    recapPromptChars: 300_000,
    minGapMs: 0,
  },
  chatgpt: {
    id: 'chatgpt',
    label: 'ChatGPT',
    auth: 'chatgpt',
    api: 'chatgpt',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    defaultModel: 'gpt-5.5',
    keyUrl: 'https://chatgpt.com',
    keyPrefix: '',
    blurb:
      'Experimental. Uses your ChatGPT plan through the same sign-in as the Codex CLI. Not an official OpenAI API and may stop working.',
    origins: ['https://auth.openai.com/*', 'https://chatgpt.com/*', 'http://localhost:1455/*'],
    fastTier: true,
    livePromptChars: 40_000,
    recapPromptChars: 300_000,
    minGapMs: 0,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    auth: 'key',
    api: 'openai-chat',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.5',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
    blurb: 'Official OpenAI API, billed per use.',
    origins: ['https://api.openai.com/*'],
    fastTier: true,
    livePromptChars: 40_000,
    recapPromptChars: 300_000,
    minGapMs: 0,
  },
};

export const PROVIDER_ORDER: ProviderId[] = ['groq', 'anthropic', 'chatgpt', 'openai'];

export interface ModelInfo {
  id: string;
  label: string;
  /** Reasoning levels the model accepts, in order. Empty when it can't be tuned. */
  thinking: string[];
  defaultThinking: string | null;
}

/** Best guess at a model's reasoning options when the provider doesn't list them. */
export function inferModelInfo(provider: ProviderId, id: string): ModelInfo {
  const info = (thinking: string[], defaultThinking: string | null): ModelInfo => ({
    id,
    label: id,
    thinking,
    defaultThinking,
  });

  if (provider === 'anthropic') {
    // Effort works on the 4.6 generation and newer.
    const tunable = !/claude-(3|haiku-4|sonnet-4-5|opus-4-[0-5])/.test(id);
    return tunable ? info(['low', 'medium', 'high', 'xhigh', 'max'], 'low') : info([], null);
  }
  if (id.includes('gpt-oss')) return info(['low', 'medium', 'high'], 'low');
  if (/qwen/i.test(id)) return info(['none', 'default'], 'none');
  if (provider === 'openai' && /^(gpt-[5-9]|o\d)/.test(id))
    return info(['low', 'medium', 'high'], 'low');
  return info([], null);
}

/**
 * Models that accept a strict JSON schema. Anything else falls back to JSON
 * mode with the schema described in the prompt.
 */
export function supportsStrictSchema(provider: ProviderId, model: string): boolean {
  if (provider !== 'groq') return true;
  return /gpt-oss|qwen/.test(model) && !model.includes('safeguard');
}

/** Hides models that can't chat: speech, guards, embeddings, images. */
export function isChatModel(model: string): boolean {
  return !/whisper|guard|orpheus|tts|playai|distil|embedding|dall-e|image|audio|realtime|transcribe|moderation|search|computer-use/i.test(
    model,
  );
}
