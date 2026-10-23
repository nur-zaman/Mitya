import { describe, expect, it } from 'vitest';
import { createSession } from '../session/session';
import type { Utterance } from '../session/types';
import { EMPTY_BRIEF } from '../storage';
import { buildLiveMessages, buildRecapMessages, formatTranscript } from './prompts';

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

describe('names in prompts', () => {
  const session = createSession({
    brief: { ...EMPTY_BRIEF, names: ['Siobhan'] },
    meetingCode: 'abc-defg-hij',
    tabId: 1,
    now: 0,
  });
  session.utterances.push(line('1', 'Raj Patel', 'Hi, I am Raj.', 1_000));

  it('lists brief names and speakers for live checks and recaps', () => {
    const live = buildLiveMessages(session, 'You', 60_000, 10_000)[1]!.content;
    const recap = buildRecapMessages(session, 'You', 10_000)[1]!.content;
    for (const prompt of [live, recap]) expect(prompt).toContain('Siobhan, Raj Patel');
  });

  it('leaves the block out when there are no names', () => {
    const empty = createSession({ brief: EMPTY_BRIEF, meetingCode: 'x', tabId: 1, now: 0 });
    expect(buildLiveMessages(empty, 'You', 0, 10_000)[1]!.content).not.toContain('Names and terms');
  });
});
