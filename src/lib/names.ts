import type { Session } from './session/types';

export const MAX_NAMES = 30;
export const MAX_NAMES_CHARS = 600;

export interface Pronunciation {
  hint: string;
  byUser: boolean;
}

export type PronunciationStore = Record<string, Pronunciation>;

export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function sessionNames(session: Session, selfLabel: string): string[] {
  const speakers = session.utterances.map((u) => u.speaker);
  return uniqueNames([...(session.brief.names ?? []), ...speakers], [selfLabel, 'Unknown']);
}

export function uniqueNames(names: string[], exclude: string[] = []): string[] {
  const seen = new Set(exclude.map(nameKey));
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

export function missingHints(names: string[], store: PronunciationStore): string[] {
  return names.filter((name) => !(nameKey(name) in store));
}

export function mergeHints(
  store: PronunciationStore,
  requested: string[],
  generated: { name: string; hint: string }[],
): PronunciationStore {
  const byKey = new Map(generated.map((g) => [nameKey(g.name), g.hint.trim()]));
  const next = { ...store };
  for (const name of requested) {
    const key = nameKey(name);
    if (key in next) continue;
    next[key] = { hint: byKey.get(key) ?? '', byUser: false };
  }
  return next;
}

export function formatNames(names: string[]): string {
  const kept: string[] = [];
  let length = 0;
  for (const name of names.slice(0, MAX_NAMES)) {
    if (length + name.length + 2 > MAX_NAMES_CHARS) break;
    kept.push(name);
    length += name.length + 2;
  }
  if (!kept.length) return '';
  return `Names and terms (always spell them like this; captions may mishear them):\n${kept.join(', ')}`;
}
