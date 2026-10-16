import { describe, expect, it } from 'vitest';
import type { Utterance } from '../session/types';
import { formatTranscript } from './prompts';

const line = (id: string, speaker: string, text: string, at: number): Utterance => ({
  id,
  speaker,
  text,
  isSelf: speaker === 'You',
  startedAt: at,
  updatedAt: at,
});

describe('formatTranscript', () => {
  const lines = [
    line('1', 'You', 'How did you scale it?', 1_000),
    line('2', 'Sam', 'We sharded by tenant.', 65_000),
  ];

  it('prefixes each line with the time since the meeting started', () => {
    expect(formatTranscript(lines, 0, 10_000)).toBe(
      '[0:01] You: How did you scale it?\n[1:05] Sam: We sharded by tenant.',
    );
  });

  it('marks lines that changed since the last check', () => {
    expect(formatTranscript(lines, 0, 10_000, 30_000)).toContain('* [1:05] Sam');
    expect(formatTranscript(lines, 0, 10_000, 30_000)).not.toContain('* [0:01]');
  });

  it('keeps the most recent lines when over budget', () => {
    const result = formatTranscript(lines, 0, 40);
    expect(result).toBe('[earlier conversation omitted]\n[1:05] Sam: We sharded by tenant.');
  });
});
