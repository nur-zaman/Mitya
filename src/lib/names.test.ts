import { describe, expect, it } from 'vitest';
import { createSession } from './session/session';
import { EMPTY_BRIEF } from './storage';
import {
  formatNames,
  MAX_NAMES,
  mergeHints,
  missingHints,
  nameKey,
  sessionNames,
  uniqueNames,
} from './names';

function sessionWith(names: string[], speakers: string[]) {
  const session = createSession({
    brief: { ...EMPTY_BRIEF, names },
    meetingCode: 'abc-defg-hij',
    tabId: 1,
    now: 0,
  });
  speakers.forEach((speaker, i) =>
    session.utterances.push({
      id: String(i),
      speaker,
      text: 'hi',
      isSelf: speaker === 'You',
      startedAt: i,
      updatedAt: i,
    }),
  );
  return session;
}

describe('sessionNames', () => {
  it('lists brief names first, then speakers, without duplicates', () => {
    const session = sessionWith(['Siobhan Kelly', 'Kubernetes'], ['Raj', 'siobhan kelly', 'Raj']);
    expect(sessionNames(session, 'You')).toEqual(['Siobhan Kelly', 'Kubernetes', 'Raj']);
  });

  it('skips the user and unlabelled speakers', () => {
    const session = sessionWith([], ['You', 'Unknown', 'Raj']);
    expect(sessionNames(session, 'You')).toEqual(['Raj']);
  });

  it('copes with sessions saved before names existed', () => {
    const session = sessionWith([], ['Raj']);
    delete (session.brief as { names?: string[] }).names;
    expect(sessionNames(session, 'You')).toEqual(['Raj']);
  });
});

describe('uniqueNames', () => {
  it('trims, collapses spaces, and drops blanks', () => {
    expect(uniqueNames(['  Ana  María ', '', 'ana maría'])).toEqual(['Ana María']);
  });
});

describe('hints', () => {
  it('finds names with nothing cached, including ones cached as needing no hint', () => {
    const store = {
      sam: { hint: '', byUser: false },
      siobhan: { hint: 'shiv-AWN', byUser: false },
    };
    expect(missingHints(['Sam', 'Siobhan', 'Nguyen'], store)).toEqual(['Nguyen']);
  });

  it('fills requested names and keeps hints the user typed meanwhile', () => {
    const store = { nguyen: { hint: 'nwin', byUser: true } };
    const merged = mergeHints(
      store,
      ['Nguyen', 'Siobhan', 'Sam'],
      [
        { name: 'nguyen', hint: 'win' },
        { name: 'Siobhan', hint: ' shiv-AWN ' },
      ],
    );
    expect(merged).toEqual({
      nguyen: { hint: 'nwin', byUser: true },
      siobhan: { hint: 'shiv-AWN', byUser: false },
      // The model skipped it, so cache it as needing no hint rather than asking forever.
      sam: { hint: '', byUser: false },
    });
  });

  it('keys names case- and space-insensitively', () => {
    expect(nameKey(' Siobhan  Kelly ')).toBe('siobhan kelly');
  });
});

describe('formatNames', () => {
  it('is empty when there are no names', () => {
    expect(formatNames([])).toBe('');
  });

  it('caps the number of names', () => {
    const names = Array.from({ length: MAX_NAMES + 5 }, (_, i) => `N${i}`);
    const block = formatNames(names);
    expect(block).toContain(`N${MAX_NAMES - 1}`);
    expect(block).not.toContain(`N${MAX_NAMES},`);
    expect(block).not.toContain(`N${MAX_NAMES + 4}`);
  });

  it('caps the length', () => {
    const names = Array.from({ length: 20 }, (_, i) => `${'x'.repeat(50)}${i}`);
    expect(formatNames(names).split('\n')[1]!.length).toBeLessThanOrEqual(600);
  });
});
