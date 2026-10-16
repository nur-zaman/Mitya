import { describe, expect, it } from 'vitest';
import { decide, THRESHOLDS, type TriggerInput } from './trigger';

const base: TriggerInput = {
  now: 100_000,
  sensitivity: 'balanced',
  running: false,
  lastRunAt: null,
  lastRunWords: 0,
  totalWords: 0,
  otherTurnEnded: false,
};
const { turnWords, backlogWords, minGapMs } = THRESHOLDS.balanced;

describe('decide', () => {
  it('runs when the other side finishes a substantial turn', () => {
    expect(decide({ ...base, totalWords: turnWords, otherTurnEnded: true })).toEqual({ run: true });
  });

  it('waits for more words after a short turn', () => {
    expect(decide({ ...base, totalWords: turnWords - 1, otherTurnEnded: true })).toEqual({
      run: false,
    });
  });

  it('runs on a large backlog even without a turn boundary', () => {
    expect(decide({ ...base, totalWords: backlogWords })).toEqual({ run: true });
  });

  it('only counts words since the last run', () => {
    expect(
      decide({ ...base, lastRunAt: 0, lastRunWords: 500, totalWords: 505, otherTurnEnded: true }),
    ).toEqual({ run: false });
  });

  it('respects the minimum gap and says when to retry', () => {
    const decision = decide({
      ...base,
      lastRunAt: base.now - 2_000,
      totalWords: backlogWords,
    });
    expect(decision).toEqual({ run: false, retryInMs: minGapMs - 2_000 });
  });

  it('applies the provider floor when it is stricter than the sensitivity', () => {
    const decision = decide({
      ...base,
      lastRunAt: base.now - minGapMs,
      totalWords: backlogWords,
      minGapFloorMs: minGapMs + 5_000,
    });
    expect(decision).toEqual({ run: false, retryInMs: 5_000 });
  });

  it('waits out a rate-limit cooldown', () => {
    const decision = decide({ ...base, totalWords: backlogWords, blockedUntil: base.now + 7_000 });
    expect(decision).toEqual({ run: false, retryInMs: 7_000 });
  });

  it('never runs while a call is in flight', () => {
    expect(decide({ ...base, running: true, totalWords: 1_000 })).toEqual({ run: false });
  });
});
