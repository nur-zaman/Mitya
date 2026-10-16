import type { NudgeKind, Session } from './session/types';

export const NUDGE_LABELS: Record<NudgeKind, string> = {
  ask: 'Ask',
  flag: 'Flag',
  remind: 'Remind',
  explain: 'Explain',
};

export type StatusTone = 'idle' | 'live' | 'busy' | 'warn';

/** One status line shared by the overlay and the side panel. */
export function describeStatus(
  session: Session | null | undefined,
  options: { hasKey: boolean; captionsOn?: boolean },
): { text: string; tone: StatusTone } {
  if (!options.hasKey) return { text: 'Needs an API key', tone: 'warn' };
  if (options.captionsOn === false) return { text: 'Captions are off', tone: 'warn' };
  if (!session || session.status === 'ended') return { text: 'Waiting for captions', tone: 'idle' };
  if (session.status === 'paused') return { text: 'Paused', tone: 'idle' };
  if (session.analysis.running) return { text: 'Thinking', tone: 'busy' };
  if (session.analysis.error) return { text: session.analysis.error, tone: 'warn' };
  return { text: 'Listening', tone: 'live' };
}
