import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { handleRedirect, signOut, startSignIn } from '@/lib/llm/chatgpt-auth';
import { completeJson, LlmError, type Usage } from '@/lib/llm/client';
import { resolveConnection } from '@/lib/llm/connection';
import { PROVIDERS } from '@/lib/llm/providers';
import {
  buildHintMessages,
  buildLiveMessages,
  buildRecapMessages,
  HINT_FORMAT,
  LIVE_FORMAT,
  RECAP_FORMAT,
  type HintDraft,
  type LiveSuggestion,
  type RecapDraft,
} from '@/lib/llm/prompts';
import type { Message } from '@/lib/messages';
import { MAX_NAMES, mergeHints, missingHints, sessionNames, uniqueNames } from '@/lib/names';
import {
  applySuggestion,
  createSession,
  replaceBrief,
  summarize,
  transcriptWords,
  upsertUtterance,
} from '@/lib/session/session';
import { decide } from '@/lib/session/trigger';
import type { Session } from '@/lib/session/types';
import {
  archivedSessionItem,
  briefItem,
  currentSessionItem,
  getBrief,
  getSettings,
  hasCredentials,
  historyItem,
  normalizeBrief,
  pronunciationsItem,
  settingsItem,
} from '@/lib/storage';

/** Recaps of a few lines aren't worth an API call. */
const MIN_UTTERANCES_FOR_RECAP = 3;

const HINT_DEBOUNCE_MS = 1500;

export default defineBackground(() => {
  let cached: Session | null | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let hintsRunning = false;
  let pendingTurn = false;
  let queue: Promise<unknown> = Promise.resolve();

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  }

  async function load(): Promise<Session | null> {
    if (cached === undefined) cached = await currentSessionItem.getValue();
    return cached;
  }

  function scheduleSave(immediate = false): void {
    clearTimeout(saveTimer);
    const write = () => currentSessionItem.setValue(cached ?? null);
    if (immediate) void write();
    else saveTimer = setTimeout(write, 250);
  }

  // --- Live captions -------------------------------------------------------

  async function onCaption(
    message: Extract<Message, { type: 'caption:upsert' }>,
    tabId: number | null,
  ): Promise<void> {
    const settings = await getSettings();
    let session = await load();

    const belongsHere =
      session && session.status !== 'ended' && session.meetingCode === message.meetingCode;
    if (!belongsHere) {
      if (session && session.status !== 'ended') await endSession(session);
      session = createSession({
        brief: await getBrief(),
        meetingCode: message.meetingCode,
        tabId,
        now: Date.now(),
      });
      cached = session;
    }
    if (!session || session.status === 'paused') return;

    // The same call open in two tabs would double every line; stick with the first.
    if (session.tabId !== null && tabId !== null && session.tabId !== tabId) return;
    session.tabId ??= tabId;
    const speaker = message.utterance.speaker;
    const newSpeaker = !session.utterances.some((u) => u.speaker === speaker);
    upsertUtterance(session, message.utterance, settings.selfLabel);
    scheduleSave();
    if (newSpeaker) scheduleHints();
    await maybeAnalyze();
  }

  async function onSettled(id: string): Promise<void> {
    const session = await load();
    const utterance = session?.utterances.find((u) => u.id === id);
    if (!utterance || utterance.isSelf) return;
    pendingTurn = true;
    await maybeAnalyze();
  }

  async function maybeAnalyze(): Promise<void> {
    const session = await load();
    if (!session || session.status !== 'live') return;

    const settings = await getSettings();
    if (!hasCredentials(settings)) return;

    const decision = decide({
      now: Date.now(),
      sensitivity: settings.sensitivity,
      running: session.analysis.running,
      lastRunAt: session.analysis.lastRunAt,
      lastRunWords: session.analysis.lastRunWords,
      totalWords: transcriptWords(session),
      otherTurnEnded: pendingTurn,
      minGapFloorMs: PROVIDERS[settings.provider].minGapMs,
      blockedUntil: session.analysis.cooldownUntil,
    });

    if (decision.run) {
      void analyze();
    } else if (decision.retryInMs) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void serial(maybeAnalyze), decision.retryInMs);
    }
  }

  // --- Model calls ---------------------------------------------------------

  async function analyze(): Promise<void> {
    const session = await load();
    if (!session || session.status === 'ended' || session.analysis.running) return;

    pendingTurn = false;
    session.analysis.running = true;
    session.analysis.error = null;
    session.analysis.lastRunWords = transcriptWords(session);
    scheduleSave(true);

    const startedAt = Date.now();
    let usage: Usage | null = null;
    try {
      const settings = await getSettings();
      const connection = await resolveConnection(settings);
      const suggestion = await completeJson<LiveSuggestion>(connection, {
        messages: buildLiveMessages(
          session,
          settings.selfLabel,
          startedAt,
          connection.provider.livePromptChars,
        ),
        format: LIVE_FORMAT,
        onUsage: (reported) => (usage = reported),
      });
      await serial(async () => {
        const current = await load();
        if (current?.id !== session.id) return;
        applySuggestion(current, suggestion, Date.now());
        current.analysis.running = false;
        current.analysis.cooldownUntil = null;
        current.analysis.lastRunAt = startedAt;
        current.analysis.usage = usage;
        scheduleSave(true);
      });
    } catch (error) {
      await serial(async () => {
        const current = await load();
        if (current?.id !== session.id) return;
        current.analysis.running = false;
        current.analysis.lastRunAt = startedAt;
        current.analysis.error = describe(error);
        if (error instanceof LlmError && error.status === 429) {
          current.analysis.cooldownUntil = Date.now() + (error.retryAfterMs ?? 30_000);
        }
        scheduleSave(true);
      });
    }
  }

  async function generateRecap(id: string): Promise<void> {
    const session = await findSession(id);
    if (!session) return;

    const settings = await getSettings();
    await updateSession(id, (s) => {
      s.recapState = 'running';
      s.recapError = null;
    });

    try {
      const connection = await resolveConnection(settings);
      const draft = await completeJson<RecapDraft>(connection, {
        messages: buildRecapMessages(
          session,
          settings.selfLabel,
          connection.provider.recapPromptChars,
        ),
        format: RECAP_FORMAT,
        maxTokens: 4096,
      });
      await updateSession(id, (s) => {
        s.recap = { ...draft, createdAt: Date.now() };
        s.recapState = 'ready';
      });
    } catch (error) {
      await updateSession(id, (s) => {
        s.recapState = 'error';
        s.recapError = describe(error);
      });
    }
  }

  function scheduleHints(): void {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => void refreshHints(), HINT_DEBOUNCE_MS);
  }

  async function refreshHints(): Promise<void> {
    if (hintsRunning) return;
    const settings = await getSettings();
    if (!hasCredentials(settings)) return;

    const session = await load();
    const live = session && session.status !== 'ended' ? session : null;
    if (live?.analysis.running) return;
    if ((live?.analysis.cooldownUntil ?? 0) > Date.now()) return;

    const names = live
      ? sessionNames(live, settings.selfLabel)
      : uniqueNames((await getBrief()).names);
    const missing = missingHints(names, await pronunciationsItem.getValue()).slice(0, MAX_NAMES);
    if (!missing.length) return;

    hintsRunning = true;
    try {
      const connection = await resolveConnection(settings);
      const draft = await completeJson<HintDraft>(connection, {
        messages: buildHintMessages(missing),
        format: HINT_FORMAT,
        maxTokens: 1024,
      });
      const store = await pronunciationsItem.getValue();
      await pronunciationsItem.setValue(mergeHints(store, missing, draft.hints));
    } catch (error) {
      console.debug('[mitya] pronunciation hints failed', error);
      if (error instanceof LlmError && error.status === 429) {
        const until = Date.now() + (error.retryAfterMs ?? 30_000);
        await serial(() =>
          withCurrent((s) => {
            if (s.status !== 'ended') s.analysis.cooldownUntil = until;
          }),
        );
      }
    } finally {
      hintsRunning = false;
    }
  }

  // --- Session lifecycle ---------------------------------------------------

  async function endSession(session: Session): Promise<void> {
    if (session.status === 'ended') return;
    session.status = 'ended';
    session.endedAt = Date.now();
    session.analysis.running = false;
    clearTimeout(retryTimer);
    pendingTurn = false;

    const worthKeeping = session.utterances.length > 0;
    if (worthKeeping) {
      await archivedSessionItem(session.id).setValue(session);
      const history = await historyItem.getValue();
      await historyItem.setValue([
        summarize(session),
        ...history.filter((h) => h.id !== session.id),
      ]);
    }
    scheduleSave(true);

    const settings = await getSettings();
    if (hasCredentials(settings) && session.utterances.length >= MIN_UTTERANCES_FOR_RECAP) {
      void generateRecap(session.id);
    }
  }

  async function findSession(id: string): Promise<Session | null> {
    const current = await load();
    if (current?.id === id) return current;
    return archivedSessionItem(id).getValue();
  }

  /** Applies a change to a session wherever it lives: current, archived, or both. */
  function updateSession(id: string, change: (session: Session) => void): Promise<void> {
    return serial(async () => {
      const current = await load();
      if (current?.id === id) {
        change(current);
        scheduleSave(true);
      }
      const archived = archivedSessionItem(id);
      const stored = await archived.getValue();
      if (stored) {
        change(stored);
        await archived.setValue(stored);
      }
    });
  }

  async function deleteSession(id: string): Promise<void> {
    await archivedSessionItem(id).removeValue();
    const history = await historyItem.getValue();
    await historyItem.setValue(history.filter((h) => h.id !== id));
    const current = await load();
    if (current?.id === id) {
      cached = null;
      scheduleSave(true);
    }
  }

  async function withCurrent(change: (session: Session) => void | Promise<void>): Promise<void> {
    const session = await load();
    if (!session) return;
    await change(session);
    scheduleSave(true);
  }

  // --- Wiring --------------------------------------------------------------

  async function handle(message: Message, sender: Browser.runtime.MessageSender): Promise<void> {
    const tabId = sender.tab?.id ?? null;
    switch (message.type) {
      case 'caption:upsert':
        return onCaption(message, tabId);
      case 'caption:settled':
        return onSettled(message.id);
      case 'session:analyze':
        void analyze();
        return;
      case 'session:pause':
        return withCurrent((s) => {
          if (s.status === 'live') s.status = 'paused';
        });
      case 'session:resume':
        return withCurrent((s) => {
          if (s.status === 'paused') s.status = 'live';
        });
      case 'meet:left':
      case 'session:end':
        return withCurrent((s) => endSession(s));
      case 'session:recap':
        void generateRecap(message.id);
        return;
      case 'session:delete':
        return deleteSession(message.id);
      case 'nudge:dismiss':
        return withCurrent((s) => {
          const nudge = s.nudges.find((n) => n.id === message.id);
          if (nudge) nudge.dismissed = true;
        });
      case 'agenda:toggle':
        return withCurrent((s) => {
          const covered = s.coveredAgendaIds;
          s.coveredAgendaIds = covered.includes(message.id)
            ? covered.filter((id) => id !== message.id)
            : [...covered, message.id];
        });
      case 'chatgpt:sign-in':
        return startSignIn();
      case 'chatgpt:sign-out': {
        await signOut();
        const settings = await getSettings();
        await settingsItem.setValue({ ...settings, chatgptAccount: null });
        return;
      }
      case 'panel:open':
        // Handled synchronously in the listener below.
        return;
    }
  }

  browser.runtime.onMessage.addListener((raw, sender) => {
    const message = raw as Message;
    if (message.type === 'panel:open' && sender.tab?.id != null) {
      void browser.sidePanel.open({ tabId: sender.tab.id });
      return;
    }
    void serial(() => handle(message, sender)).catch((error) =>
      console.error('[mitya]', message.type, error),
    );
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === 'ask-now') void serial(analyze);
  });

  // Completes "Sign in with ChatGPT" when the OAuth redirect lands in a tab.
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (!change.url) return;
    handleRedirect(tabId, change.url)
      .then(async (tokens) => {
        if (!tokens) return;
        const settings = await getSettings();
        await settingsItem.setValue({
          ...settings,
          provider: 'chatgpt',
          chatgptAccount: tokens.email ?? 'ChatGPT account',
        });
      })
      .catch((error) => console.error('[mitya] ChatGPT sign-in failed', error));
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void serial(() =>
      withCurrent(async (s) => {
        if (s.tabId === tabId) await endSession(s);
      }),
    );
  });

  briefItem.watch((stored) => {
    const brief = normalizeBrief(stored);
    void serial(() =>
      withCurrent((s) => {
        if (s.status !== 'ended') replaceBrief(s, brief);
      }),
    );
    scheduleHints();
  });

  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
