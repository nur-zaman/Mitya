import type { Sensitivity } from './types';

interface Thresholds {
  /** Never call the model more often than this. */
  minGapMs: number;
  /** New words needed when the other side finishes a turn. */
  turnWords: number;
  /** New words that justify a check even without a clear turn boundary. */
  backlogWords: number;
}

export const THRESHOLDS: Record<Sensitivity, Thresholds> = {
  quiet: { minGapMs: 25_000, turnWords: 30, backlogWords: 140 },
  balanced: { minGapMs: 12_000, turnWords: 15, backlogWords: 80 },
  chatty: { minGapMs: 6_000, turnWords: 8, backlogWords: 45 },
};

export interface TriggerInput {
  now: number;
  sensitivity: Sensitivity;
  running: boolean;
  lastRunAt: number | null;
  lastRunWords: number;
  totalWords: number;
  /** Set when someone other than the user just finished speaking. */
  otherTurnEnded: boolean;
  /** Provider-imposed floor between calls (free tiers meter tokens per minute). */
  minGapFloorMs?: number;
  /** No calls before this time, e.g. after a rate limit. */
  blockedUntil?: number | null;
}

export type TriggerDecision = { run: true } | { run: false; retryInMs?: number };

export function decide(input: TriggerInput): TriggerDecision {
  if (input.running) return { run: false };

  const { turnWords, backlogWords } = THRESHOLDS[input.sensitivity];
  const minGapMs = Math.max(THRESHOLDS[input.sensitivity].minGapMs, input.minGapFloorMs ?? 0);
  const newWords = Math.max(0, input.totalWords - input.lastRunWords);
  const wantsRun = (input.otherTurnEnded && newWords >= turnWords) || newWords >= backlogWords;

  if (!wantsRun) return { run: false };

  const sinceLast = input.lastRunAt == null ? Infinity : input.now - input.lastRunAt;
  const wait = Math.max(minGapMs - sinceLast, (input.blockedUntil ?? 0) - input.now);
  if (wait > 0) return { run: false, retryInMs: wait };

  return { run: true };
}
