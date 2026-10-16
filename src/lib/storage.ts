import { storage } from 'wxt/utils/storage';
import { PROVIDER_ORDER, PROVIDERS, type ProviderId } from './llm/providers';
import type { Brief, Session, SessionSummary, Settings } from './session/types';

/*
 * chrome.storage.local is the single source of truth. The background worker
 * is the only writer for sessions; the side panel and the overlay just watch.
 */

export const DEFAULT_SETTINGS: Settings = {
  provider: 'groq',
  apiKeys: perProvider(() => ''),
  models: perProvider((id) => PROVIDERS[id].defaultModel),
  // Live nudges are only useful while the moment lasts, so think briefly by default.
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
  durationMinutes: null,
};

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export const briefItem = storage.defineItem<Brief>('local:brief', {
  fallback: EMPTY_BRIEF,
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

/**
 * Fills in anything an older version didn't save, and falls back to the
 * default provider if the saved one no longer exists.
 */
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

/** True when the selected provider has a key or a signed-in account. */
export function hasCredentials(settings: Settings): boolean {
  if (PROVIDERS[settings.provider].auth === 'chatgpt') return Boolean(settings.chatgptAccount);
  return Boolean(settings.apiKeys?.[settings.provider]);
}

function perProvider<T>(value: (id: ProviderId) => T): Record<ProviderId, T> {
  return Object.fromEntries(PROVIDER_ORDER.map((id) => [id, value(id)])) as Record<ProviderId, T>;
}
