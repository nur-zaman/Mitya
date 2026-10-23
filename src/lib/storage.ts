import { storage } from 'wxt/utils/storage';
import { PROVIDER_ORDER, PROVIDERS, type ProviderId } from './llm/providers';
import type { PronunciationStore } from './names';
import type { Brief, Session, SessionSummary, Settings } from './session/types';

export const DEFAULT_SETTINGS: Settings = {
  provider: 'groq',
  apiKeys: perProvider(() => ''),
  models: perProvider((id) => PROVIDERS[id].defaultModel),
  thinking: perProvider(() => 'low'),
  fastMode: false,
  chatgptAccount: null,
  sensitivity: 'balanced',
  showOverlay: true,
  selfLabel: 'You',
};

export const EMPTY_BRIEF: Brief = {
  mode: 'general',
  title: '',
  goal: '',
  agenda: [],
  context: '',
  names: [],
  durationMinutes: null,
};

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export const briefItem = storage.defineItem<Brief>('local:brief', {
  fallback: EMPTY_BRIEF,
});

export const pronunciationsItem = storage.defineItem<PronunciationStore>('local:pronunciations', {
  fallback: {},
});

export const currentSessionItem = storage.defineItem<Session | null>('local:currentSession', {
  fallback: null,
});

export const historyItem = storage.defineItem<SessionSummary[]>('local:history', {
  fallback: [],
});

export const overlayPositionItem = storage.defineItem<{ x: number; y: number } | null>(
  'local:overlayPosition',
  { fallback: null },
);

export function archivedSessionItem(id: string) {
  return storage.defineItem<Session | null>(`local:session:${id}`, { fallback: null });
}

export async function getSettings(): Promise<Settings> {
  return normalizeSettings(await settingsItem.getValue());
}

export function normalizeSettings(stored: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    provider: stored.provider && stored.provider in PROVIDERS ? stored.provider : 'groq',
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...stored.apiKeys },
    models: { ...DEFAULT_SETTINGS.models, ...stored.models },
    thinking: { ...DEFAULT_SETTINGS.thinking, ...stored.thinking },
  };
}

export function normalizeBrief(stored: Partial<Brief>): Brief {
  return { ...EMPTY_BRIEF, ...stored, names: stored.names ?? [] };
}

export async function getBrief(): Promise<Brief> {
  return normalizeBrief(await briefItem.getValue());
}

export function hasCredentials(settings: Settings): boolean {
  if (PROVIDERS[settings.provider].auth === 'chatgpt') return Boolean(settings.chatgptAccount);
  return Boolean(settings.apiKeys?.[settings.provider]);
}

function perProvider<T>(value: (id: ProviderId) => T): Record<ProviderId, T> {
  return Object.fromEntries(PROVIDER_ORDER.map((id) => [id, value(id)])) as Record<ProviderId, T>;
}
