import type { TrackedUtterance } from '../captions/tracker';
import { countWords } from '../captions/merge';
import type { LiveSuggestion } from '../llm/prompts';
import { describeMode } from '../modes';
import type { Brief, Nudge, Session, SessionSummary } from './types';

export function createSession(options: {
  brief: Brief;
  meetingCode: string;
  tabId: number | null;
  now: number;
}): Session {
  return {
    id: `${options.meetingCode}-${options.now.toString(36)}`,
    tabId: options.tabId,
    meetingCode: options.meetingCode,
    startedAt: options.now,
    endedAt: null,
    status: 'live',
    brief: structuredClone(options.brief),
    utterances: [],
    nudges: [],
    coveredAgendaIds: [],
    analysis: {
      running: false,
      lastRunAt: null,
      lastRunWords: 0,
      cooldownUntil: null,
      error: null,
    },
    recap: null,
    recapState: 'none',
    recapError: null,
  };
}

export function upsertUtterance(
  session: Session,
  incoming: TrackedUtterance,
  selfLabel: string,
): void {
  const isSelf = incoming.speaker.trim().toLowerCase() === selfLabel.trim().toLowerCase();
  const existing = session.utterances.find((u) => u.id === incoming.id);
  if (existing) {
    Object.assign(existing, incoming, { isSelf, startedAt: existing.startedAt });
  } else {
    session.utterances.push({ ...incoming, isSelf });
  }
}

export function transcriptWords(session: Session): number {
  return session.utterances.reduce((sum, u) => sum + countWords(u.text), 0);
}

export function applySuggestion(session: Session, suggestion: LiveSuggestion, now: number): void {
  const seen = new Set(session.nudges.map((n) => normalize(n.text)));

  suggestion.nudges.slice(0, 2).forEach((nudge, index) => {
    const text = nudge.text.trim();
    if (!text || seen.has(normalize(text))) return;
    session.nudges.push({
      id: `${now.toString(36)}-${index}`,
      kind: nudge.kind,
      text,
      detail: nudge.detail.trim(),
      createdAt: now,
      dismissed: false,
    });
  });

  // Agenda coverage only grows from the model's side; the user can still untick.
  const known = new Set(session.brief.agenda.map((item) => item.id));
  for (const id of suggestion.coveredAgendaIds) {
    if (known.has(id) && !session.coveredAgendaIds.includes(id)) session.coveredAgendaIds.push(id);
  }
}

const FRESH_MS = 4000;

/** Newest batch first; nudges from the same batch keep the model's order. */
export function newestFirst(nudges: Nudge[]): Nudge[] {
  return [...nudges].sort((a, b) => b.createdAt - a.createdAt);
}

/** Recent enough that the UI should point it out. */
export function isFresh(nudge: Nudge, now: number): boolean {
  return now - nudge.createdAt < FRESH_MS;
}

/** Keeps the session's brief in sync when the user edits it mid-meeting. */
export function replaceBrief(session: Session, brief: Brief): void {
  session.brief = structuredClone(brief);
  const known = new Set(brief.agenda.map((item) => item.id));
  session.coveredAgendaIds = session.coveredAgendaIds.filter((id) => known.has(id));
}

export function summarize(session: Session): SessionSummary {
  return {
    id: session.id,
    title: session.brief.title || `Meeting ${session.meetingCode}`,
    mode: session.brief.mode,
    modeLabel: describeMode(session.brief).label,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    utteranceCount: session.utterances.length,
  };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
