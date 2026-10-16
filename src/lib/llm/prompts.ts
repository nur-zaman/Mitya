import { MODES } from '../modes';
import type { Brief, Nudge, NudgeKind, Recap, Session, Utterance } from '../session/types';
import type { ChatMessage, JsonSchemaFormat } from './types';

/** The transcript always gets at least this much room, however long the brief is. */
const MIN_TRANSCRIPT_CHARS = 3_000;

export interface LiveSuggestion {
  nudges: { kind: NudgeKind; text: string; detail: string }[];
  coveredAgendaIds: string[];
}

export type RecapDraft = Omit<Recap, 'createdAt'>;

export const LIVE_FORMAT: JsonSchemaFormat = {
  name: 'live_suggestion',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['nudges', 'coveredAgendaIds'],
    properties: {
      nudges: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'text', 'detail'],
          properties: {
            kind: { type: 'string', enum: ['ask', 'flag', 'remind', 'explain'] },
            text: { type: 'string' },
            detail: { type: 'string' },
          },
        },
      },
      coveredAgendaIds: { type: 'array', items: { type: 'string' } },
    },
  },
};

export const RECAP_FORMAT: JsonSchemaFormat = {
  name: 'meeting_recap',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'agenda', 'keyPoints', 'concerns', 'followUps'],
    properties: {
      summary: { type: 'string' },
      agenda: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['item', 'status', 'note'],
          properties: {
            item: { type: 'string' },
            status: { type: 'string', enum: ['covered', 'partial', 'missed'] },
            note: { type: 'string' },
          },
        },
      },
      keyPoints: { type: 'array', items: { type: 'string' } },
      concerns: { type: 'array', items: { type: 'string' } },
      followUps: { type: 'array', items: { type: 'string' } },
    },
  },
};

const LIVE_SYSTEM = `You are Mitya, a discreet assistant sitting beside the user during a live video call. You read the running transcript and occasionally slip the user a short note. The user is mid-conversation and can only glance at your notes, so every note must be worth the interruption.

Note kinds:
- "ask": a specific question the user could say out loud next. Write it in the user's voice, ready to use.
- "flag": something said that is vague, contradictory, evasive, or doubtful. Name it and say why in a few words.
- "remind": the conversation is drifting from the goal, time is running short, or an agenda item hasn't come up.
- "explain": a term or concept the user may not know, explained in one plain sentence.

Rules:
- Return zero notes when nothing is worth saying. Silence is the right answer most of the time.
- At most two notes per turn. Prefer one strong note over two average ones.
- "text" is at most 20 words. "detail" is optional context of at most 30 words; use an empty string if there is nothing to add.
- Focus on what was said since the last check. Earlier transcript is context.
- Never repeat or rephrase a note you already gave.
- Lines from "{self}" are the user. Everyone else is the other side.
- Captions are machine transcribed. Read past obvious recognition errors instead of flagging them.
- In coveredAgendaIds, list the ids of every agenda item that has been meaningfully discussed so far.`;

const RECAP_SYSTEM = `You write the debrief after a meeting for the person who ran it. Be concrete and brief. Use the people's own words where it helps. Do not invent facts that are not in the transcript.

- summary: three to five sentences on what happened and where things landed.
- agenda: one entry per agenda item with its status and a short note. Empty if there was no agenda.
- keyPoints: the facts, decisions, and claims worth remembering.
- concerns: anything vague, contradictory, or worth verifying. Empty if none.
- followUps: concrete next steps, with owners when they were named.`;

/**
 * Builds the prompt for a live check. `budgetChars` caps the whole prompt so
 * it fits the provider's rate limits; the brief and recent transcript get
 * priority over older conversation.
 */
export function buildLiveMessages(
  session: Session,
  selfLabel: string,
  now: number,
  budgetChars: number,
): ChatMessage[] {
  const system = `${LIVE_SYSTEM.replace('{self}', selfLabel)}\n\nMeeting type guidance:\n${MODES[session.brief.mode].guidance}`;

  const previous = session.nudges.slice(-8);
  const header = [
    formatBrief(session.brief, Math.floor(budgetChars * 0.35)),
    formatClock(session, now),
    previous.length ? `Notes you already gave:\n${previous.map(formatNudge).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const room = Math.max(MIN_TRANSCRIPT_CHARS, budgetChars - system.length - header.length);
  const transcript = formatTranscript(
    session.utterances,
    session.startedAt,
    room,
    session.analysis.lastRunAt,
  );
  const user = `${header}\n\nTranscript (lines marked * are new since your last check):\n${transcript}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function buildRecapMessages(
  session: Session,
  selfLabel: string,
  budgetChars: number,
): ChatMessage[] {
  const header = [
    formatBrief(session.brief, Math.floor(budgetChars * 0.25)),
    `Lines from "${selfLabel}" are the person who ran the meeting.`,
  ].join('\n\n');
  const room = Math.max(MIN_TRANSCRIPT_CHARS, budgetChars - RECAP_SYSTEM.length - header.length);
  const user = `${header}\n\nTranscript:\n${formatTranscript(session.utterances, session.startedAt, room)}`;

  return [
    { role: 'system', content: RECAP_SYSTEM },
    { role: 'user', content: user },
  ];
}

function formatBrief(brief: Brief, maxContextChars: number): string {
  const lines = [`Meeting type: ${MODES[brief.mode].label}`];
  if (brief.title) lines.push(`Title: ${brief.title}`);
  lines.push(`User's goal: ${brief.goal || '(not stated)'}`);
  if (brief.agenda.length) {
    lines.push('Agenda:', ...brief.agenda.map((item) => `- [${item.id}] ${item.text}`));
  }
  const context = brief.context.trim();
  if (context) {
    const clipped =
      context.length > maxContextChars
        ? `${context.slice(0, maxContextChars)} [truncated]`
        : context;
    lines.push(`Background from the user:\n${clipped}`);
  }
  return lines.join('\n');
}

function formatClock(session: Session, now: number): string {
  const elapsed = Math.round((now - session.startedAt) / 60_000);
  const planned = session.brief.durationMinutes;
  if (!planned) return `Elapsed: ${elapsed} min.`;
  return `Elapsed: ${elapsed} of ${planned} min (${Math.max(0, planned - elapsed)} min left).`;
}

function formatNudge(nudge: Nudge): string {
  return `- (${nudge.kind}) ${nudge.text}`;
}

export function formatTranscript(
  utterances: Utterance[],
  startedAt: number,
  maxChars: number,
  newSince: number | null = null,
): string {
  const lines: string[] = [];
  let length = 0;

  // Walk backwards so the most recent conversation always fits.
  for (let i = utterances.length - 1; i >= 0; i--) {
    const u = utterances[i]!;
    const marker = newSince != null && u.updatedAt > newSince ? '* ' : '';
    const line = `${marker}[${timestamp(u.startedAt - startedAt)}] ${u.speaker}: ${u.text}`;
    if (length + line.length > maxChars) {
      lines.push('[earlier conversation omitted]');
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }

  return lines.length ? lines.reverse().join('\n') : '(nothing said yet)';
}

function timestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
