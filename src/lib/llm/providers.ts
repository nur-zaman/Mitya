export type ProviderId = 'groq' | 'anthropic' | 'chatgpt' | 'openai';

export interface Provider {
  id: ProviderId;
  label: string;
  auth: 'key' | 'chatgpt';
  api: 'openai-chat' | 'chatgpt' | 'anthropic';
  baseUrl: string;
  defaultModel: string;
  keyUrl: string;
  keyPrefix: string;
  blurb: string;
  origins: string[];
  fastTier: boolean;
  livePromptChars: number;
  recapPromptChars: number;
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
  thinking: string[];
  defaultThinking: string | null;
  contextWindow?: number;
}

export function inferModelInfo(provider: ProviderId, id: string): ModelInfo {
  const info = (thinking: string[], defaultThinking: string | null): ModelInfo => ({
    id,
    label: id,
    thinking,
    defaultThinking,
  });

  if (provider === 'anthropic') {
    const tunable = !/claude-(3|haiku-4|sonnet-4-5|opus-4-[0-5])/.test(id);
    return tunable ? info(['low', 'medium', 'high', 'xhigh', 'max'], 'low') : info([], null);
  }
  if (id.includes('gpt-oss')) return info(['low', 'medium', 'high'], 'low');
  if (/qwen/i.test(id)) return info(['none', 'default'], 'none');
  if (provider === 'openai' && /^(gpt-[5-9]|o\d)/.test(id))
    return info(['low', 'medium', 'high'], 'low');
  return info([], null);
}

export function supportsStrictSchema(provider: ProviderId, model: string): boolean {
  if (provider !== 'groq') return true;
  return /gpt-oss|qwen/.test(model) && !model.includes('safeguard');
}

export function isChatModel(model: string): boolean {
  return !/whisper|guard|orpheus|tts|playai|distil|embedding|dall-e|image|audio|realtime|transcribe|moderation|search|computer-use/i.test(
    model,
  );
}
