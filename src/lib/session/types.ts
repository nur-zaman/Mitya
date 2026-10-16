import type { ProviderId } from '../llm/providers';

export type MeetingMode = 'general' | 'interview' | 'one-on-one' | 'sales' | 'negotiation';

export interface AgendaItem {
  id: string;
  text: string;
}

/** What the user tells Mitya before (or during) a meeting. */
export interface Brief {
  mode: MeetingMode;
  title: string;
  goal: string;
  agenda: AgendaItem[];
  /** Free-form background: a job description, a CV, notes about the other person. */
  context: string;
  durationMinutes: number | null;
}

export interface Utterance {
  id: string;
  speaker: string;
  text: string;
  isSelf: boolean;
  startedAt: number;
  updatedAt: number;
}

export type NudgeKind = 'ask' | 'flag' | 'remind' | 'explain';

export interface Nudge {
  id: string;
  kind: NudgeKind;
  /** One line the user can glance at mid-conversation. */
  text: string;
  /** Optional reasoning or extra context, shown on demand. */
  detail: string;
  createdAt: number;
  dismissed: boolean;
}

export type AgendaStatus = 'covered' | 'partial' | 'missed';

export interface Recap {
  summary: string;
  agenda: { item: string; status: AgendaStatus; note: string }[];
  keyPoints: string[];
  concerns: string[];
  followUps: string[];
  createdAt: number;
}

export type SessionStatus = 'live' | 'paused' | 'ended';

export interface AnalysisState {
  running: boolean;
  lastRunAt: number | null;
  /** Transcript word count at the time of the last run. */
  lastRunWords: number;
  /** Set after a rate limit; no calls until then. */
  cooldownUntil: number | null;
  error: string | null;
}

export interface Session {
  id: string;
  tabId: number | null;
  meetingCode: string;
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  brief: Brief;
  utterances: Utterance[];
  nudges: Nudge[];
  coveredAgendaIds: string[];
  analysis: AnalysisState;
  recap: Recap | null;
  recapState: 'none' | 'running' | 'ready' | 'error';
  recapError: string | null;
}

export interface SessionSummary {
  id: string;
  title: string;
  mode: MeetingMode;
  startedAt: number;
  endedAt: number | null;
  utteranceCount: number;
}

export type Sensitivity = 'quiet' | 'balanced' | 'chatty';

export interface Settings {
  provider: ProviderId;
  /** Pasted API keys. Unused for ChatGPT, which signs in instead. */
  apiKeys: Record<ProviderId, string>;
  models: Record<ProviderId, string>;
  /** Reasoning effort per provider; null means the model's default. */
  thinking: Record<ProviderId, string | null>;
  /** Use the provider's priority tier when it has one. */
  fastMode: boolean;
  /** Email of the signed-in ChatGPT account, null when signed out. */
  chatgptAccount: string | null;
  sensitivity: Sensitivity;
  showOverlay: boolean;
  /** How Meet labels your own captions. "You" in English. */
  selfLabel: string;
}
