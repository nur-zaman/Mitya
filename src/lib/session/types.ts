import type { ProviderId } from '../llm/providers';
import type { Usage } from '../llm/types';

export type BuiltInMode = 'general' | 'interview' | 'one-on-one' | 'sales' | 'negotiation';
export type MeetingMode = BuiltInMode | 'custom';

export interface CustomMode {
  id: string;
  label: string;
  guidance: string;
}

export interface AgendaItem {
  id: string;
  text: string;
}

export interface Brief {
  mode: MeetingMode;
  custom: CustomMode | null;
  title: string;
  goal: string;
  agenda: AgendaItem[];
  context: string;
  names: string[];
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
  text: string;
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
  lastRunWords: number;
  cooldownUntil: number | null;
  error: string | null;
  usage: Usage | null;
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
  modeLabel?: string;
  startedAt: number;
  endedAt: number | null;
  utteranceCount: number;
}

export type Sensitivity = 'quiet' | 'balanced' | 'chatty';

export interface Settings {
  provider: ProviderId;
  apiKeys: Record<ProviderId, string>;
  models: Record<ProviderId, string>;
  thinking: Record<ProviderId, string | null>;
  fastMode: boolean;
  chatgptAccount: string | null;
  sensitivity: Sensitivity;
  showOverlay: boolean;
  selfLabel: string;
}
