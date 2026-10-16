import { MODES } from './modes';
import type { Session } from './session/types';

const STATUS_MARK = { covered: '[x]', partial: '[~]', missed: '[ ]' } as const;

/** Renders a finished session as a Markdown document for copying or saving. */
export function sessionToMarkdown(session: Session): string {
  const { brief, recap } = session;
  const out: string[] = [];

  out.push(`# ${brief.title || `Meeting ${session.meetingCode}`}`, '');
  out.push(
    `${MODES[brief.mode].label} · ${new Date(session.startedAt).toLocaleString()}` +
      (session.endedAt
        ? ` · ${Math.round((session.endedAt - session.startedAt) / 60_000)} min`
        : ''),
    '',
  );
  if (brief.goal) out.push(`**Goal:** ${brief.goal}`, '');

  if (recap) {
    out.push('## Summary', '', recap.summary, '');
    if (recap.agenda.length) {
      out.push('## Agenda', '');
      for (const a of recap.agenda) {
        out.push(`- ${STATUS_MARK[a.status]} ${a.item}${a.note ? ` (${a.note})` : ''}`);
      }
      out.push('');
    }
    section(out, 'Key points', recap.keyPoints);
    section(out, 'Worth checking', recap.concerns);
    section(out, 'Follow-ups', recap.followUps);
  }

  const nudges = session.nudges;
  if (nudges.length) {
    section(
      out,
      'Suggestions during the call',
      nudges.map((n) => `**${n.kind}:** ${n.text}`),
    );
  }

  out.push('## Transcript', '');
  for (const u of session.utterances) out.push(`**${u.speaker}:** ${u.text}`, '');

  return out.join('\n').trimEnd() + '\n';
}

function section(out: string[], title: string, items: string[]): void {
  if (!items.length) return;
  out.push(`## ${title}`, '', ...items.map((item) => `- ${item}`), '');
}
