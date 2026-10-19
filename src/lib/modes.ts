import type { Brief, BuiltInMode } from './session/types';

/** Custom guidance goes into every live prompt, so keep it short for rate-limited providers. */
export const MAX_CUSTOM_GUIDANCE = 500;

export interface ModeDefinition {
  label: string;
  /** Placeholder text for the goal field, so the form hints at what's useful. */
  goalHint: string;
  contextHint: string;
  /** Extra instructions appended to the system prompt for this kind of meeting. */
  guidance: string;
}

export const MODES: Record<BuiltInMode, ModeDefinition> = {
  general: {
    label: 'General',
    goalHint: 'What do you want to walk away with?',
    contextHint: 'Anything Mitya should know going in.',
    guidance: `Keep the user on track toward their goal. Point out when the conversation drifts, when a decision is left vague, or when nobody owns a next step.`,
  },
  interview: {
    label: 'Interview',
    goalHint: 'e.g. Decide whether this person can own our data pipeline end to end',
    contextHint: 'Paste the job description, the CV, or the skills you need to probe.',
    guidance: `The user is interviewing a candidate and may not be an expert in the candidate's domain.
- Suggest follow-up questions that test depth: ask for specifics, numbers, trade-offs, failures, and what the candidate personally did versus the team.
- Flag claims that are vague, buzzword-heavy, inconsistent with something said earlier, or technically doubtful. Say briefly why.
- When the candidate uses jargon the user may not know, explain it in one plain sentence and suggest a question that checks real understanding.
- Watch the clock against the agenda so the important areas get covered.`,
  },
  'one-on-one': {
    label: '1:1',
    goalHint: 'e.g. Get clarity on promotion criteria and agree on Q3 priorities',
    contextHint: 'Recent wins, open concerns, things you keep forgetting to raise.',
    guidance: `The user is in a one-on-one, often with their manager.
- Remind them of agenda items they haven't raised yet, especially before time runs out.
- When the other person gives a non-answer or a vague commitment, suggest a polite question that pins down specifics, owners, or dates.
- Help the user advocate for themselves without sounding confrontational.`,
  },
  sales: {
    label: 'Discovery call',
    goalHint: 'e.g. Qualify budget and timeline, find the real decision maker',
    contextHint: 'What you sell, who the prospect is, what you already know.',
    guidance: `The user is running a sales or discovery conversation.
- Suggest open questions that uncover pain, budget, authority, timeline, and current alternatives.
- Flag buying signals and objections as they happen.
- Point out when the user is talking too much or pitching before understanding the problem.`,
  },
  negotiation: {
    label: 'Negotiation',
    goalHint: 'e.g. Close at or above our floor without giving up the support terms',
    contextHint: 'Your walk-away point, what you can trade, what you know about them.',
    guidance: `The user is negotiating.
- Flag anchors, concessions, and pressure tactics from the other side.
- Remind the user of their limits and goal before they concede something.
- Suggest questions that reveal the other side's priorities and constraints.`,
  },
};

export const MODE_ORDER: BuiltInMode[] = [
  'general',
  'interview',
  'one-on-one',
  'sales',
  'negotiation',
];

/** The definition that applies to a brief, including a custom kind the user wrote. */
export function describeMode(brief: Pick<Brief, 'mode' | 'custom'>): ModeDefinition {
  if (brief.mode !== 'custom') return MODES[brief.mode] ?? MODES.general;

  const label = brief.custom?.label.trim() || 'Custom';
  const guidance = brief.custom?.guidance.trim().slice(0, MAX_CUSTOM_GUIDANCE);
  return {
    ...MODES.general,
    label,
    guidance: guidance
      ? `The user calls this kind of meeting "${label}" and wrote these instructions for you:
${guidance}`
      : MODES.general.guidance,
  };
}
