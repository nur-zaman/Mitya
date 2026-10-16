import { describe, expect, it } from 'vitest';
import { EMPTY_BRIEF } from '../storage';
import {
  applySuggestion,
  createSession,
  replaceBrief,
  transcriptWords,
  upsertUtterance,
} from './session';

function newSession() {
  return createSession({
    brief: {
      ...EMPTY_BRIEF,
      agenda: [
        { id: 'a1', text: 'System design' },
        { id: 'a2', text: 'Team fit' },
      ],
    },
    meetingCode: 'abc-defg-hij',
    tabId: 1,
    now: 0,
  });
}

const utterance = (id: string, speaker: string, text: string) => ({
  id,
  speaker,
  text,
  startedAt: 0,
  updatedAt: 0,
});

describe('upsertUtterance', () => {
  it('marks the user own lines using the caption label', () => {
    const session = newSession();
    upsertUtterance(session, utterance('1', 'You', 'Tell me about it'), 'You');
    upsertUtterance(session, utterance('2', 'Sam', 'Sure'), 'You');
    expect(session.utterances.map((u) => u.isSelf)).toEqual([true, false]);
  });

  it('updates in place and keeps the original start time', () => {
    const session = newSession();
    upsertUtterance(session, { ...utterance('1', 'Sam', 'Hi'), startedAt: 5 }, 'You');
    upsertUtterance(session, { ...utterance('1', 'Sam', 'Hi there'), startedAt: 9 }, 'You');
    expect(session.utterances).toHaveLength(1);
    expect(session.utterances[0]).toMatchObject({ text: 'Hi there', startedAt: 5 });
    expect(transcriptWords(session)).toBe(2);
  });
});

describe('applySuggestion', () => {
  it('adds at most two nudges and skips repeats', () => {
    const session = newSession();
    const nudge = (text: string) => ({ kind: 'ask' as const, text, detail: '' });

    applySuggestion(
      session,
      {
        nudges: [nudge('Ask about scale'), nudge('Ask about cost'), nudge('Third')],
        coveredAgendaIds: [],
      },
      1,
    );
    applySuggestion(session, { nudges: [nudge('ask about SCALE!')], coveredAgendaIds: [] }, 2);

    expect(session.nudges.map((n) => n.text)).toEqual(['Ask about scale', 'Ask about cost']);
  });

  it('only records agenda ids that exist', () => {
    const session = newSession();
    applySuggestion(session, { nudges: [], coveredAgendaIds: ['a1', 'a9', 'a1'] }, 1);
    expect(session.coveredAgendaIds).toEqual(['a1']);
  });
});

describe('replaceBrief', () => {
  it('drops coverage for agenda items that were removed', () => {
    const session = newSession();
    session.coveredAgendaIds = ['a1', 'a2'];
    replaceBrief(session, { ...session.brief, agenda: [{ id: 'a2', text: 'Team fit' }] });
    expect(session.coveredAgendaIds).toEqual(['a2']);
  });
});
