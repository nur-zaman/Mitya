import { useEffect, useRef, useState } from 'react';
import { NUDGE_LABELS } from '@/lib/labels';
import { send } from '@/lib/messages';
import { nameKey, sessionNames } from '@/lib/names';
import { isFresh, newestFirst } from '@/lib/session/session';
import type { Session } from '@/lib/session/types';
import { pronunciationsItem } from '@/lib/storage';
import { useStorageItem } from '@/lib/use-storage';
import { RecapPanel } from './RecapPanel';

export function LiveView({ session, selfLabel }: { session: Session | null; selfLabel: string }) {
  if (!session) {
    return (
      <div className="empty">
        <h2>Nothing to listen to yet</h2>
        <ol>
          <li>Fill in the brief so Mitya knows what you're after.</li>
          <li>Join a Google Meet call.</li>
          <li>
            Turn on captions (press <kbd>c</kbd> in Meet).
          </li>
        </ol>
        <p className="muted">Mitya starts on its own once captions appear.</p>
      </div>
    );
  }

  const ended = session.status === 'ended';

  return (
    <div className="stack">
      <SessionBar session={session} />
      {session.analysis.error && !ended && <p className="error">{session.analysis.error}</p>}
      {ended && <RecapPanel session={session} />}
      <People session={session} selfLabel={selfLabel} />
      <Agenda session={session} />
      <Nudges session={session} />
      <Transcript session={session} />
    </div>
  );
}

function SessionBar({ session }: { session: Session }) {
  const elapsed = useElapsed(session.startedAt, session.endedAt);
  const planned = session.brief.durationMinutes;

  return (
    <div className="session-bar">
      <div>
        <strong>{session.brief.title || session.meetingCode}</strong>
        <span className="muted">
          {elapsed}
          {planned ? ` of ${planned} min` : ''}
          {session.status === 'paused' && ' · paused'}
          {session.status === 'ended' && ' · ended'}
        </span>
      </div>
      {session.status !== 'ended' && (
        <div className="row">
          <button
            className="button"
            disabled={session.analysis.running}
            onClick={() => void send({ type: 'session:analyze' })}
            title="Alt+Shift+M"
          >
            Ask now
          </button>
          <button
            className="button quiet"
            onClick={() =>
              void send({ type: session.status === 'paused' ? 'session:resume' : 'session:pause' })
            }
          >
            {session.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button className="button quiet" onClick={() => void send({ type: 'session:end' })}>
            End
          </button>
        </div>
      )}
    </div>
  );
}

function People({ session, selfLabel }: { session: Session; selfLabel: string }) {
  const hints = useStorageItem(pronunciationsItem);
  const names = sessionNames(session, selfLabel);
  if (!names.length) return null;

  return (
    <ul className="people">
      {names.map((name) => {
        const hint = hints?.[nameKey(name)]?.hint;
        return (
          <li key={name}>
            {name}
            {hint && <span className="muted"> {hint}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Agenda({ session }: { session: Session }) {
  const { agenda } = session.brief;
  if (!agenda.length) return null;
  const covered = new Set(session.coveredAgendaIds);

  return (
    <section>
      <div className="section-head">
        <h2>Agenda</h2>
        <span className="muted">
          {covered.size} of {agenda.length}
        </span>
      </div>
      <ul className="checklist">
        {agenda.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={covered.has(item.id)}
                onChange={() => void send({ type: 'agenda:toggle', id: item.id })}
              />
              <span>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Nudges({ session }: { session: Session }) {
  const [showDismissed, setShowDismissed] = useState(false);
  const all = newestFirst(session.nudges);
  const visible = showDismissed ? all : all.filter((n) => !n.dismissed);
  const hidden = all.length - all.filter((n) => !n.dismissed).length;

  return (
    <section>
      <div className="section-head">
        <h2>Suggestions</h2>
        {hidden > 0 && (
          <button className="link muted" onClick={() => setShowDismissed(!showDismissed)}>
            {showDismissed ? 'Hide dismissed' : `${hidden} dismissed`}
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="muted">
          {session.status === 'ended'
            ? 'No suggestions in this meeting.'
            : 'Mitya stays quiet until it has something useful.'}
        </p>
      ) : (
        <ul className="nudge-list">
          {visible.map((nudge) => (
            <li
              key={nudge.id}
              className={`nudge kind-${nudge.kind} ${nudge.dismissed ? 'dismissed' : ''} ${isFresh(nudge, Date.now()) ? 'fresh' : ''}`}
            >
              <div className="nudge-head">
                <span className="kind">{NUDGE_LABELS[nudge.kind]}</span>
                <span className="muted">{clock(nudge.createdAt - session.startedAt)}</span>
                {!nudge.dismissed && session.status !== 'ended' && (
                  <button
                    className="icon-button small"
                    aria-label="Dismiss"
                    onClick={() => void send({ type: 'nudge:dismiss', id: nudge.id })}
                  >
                    ×
                  </button>
                )}
              </div>
              <p>{nudge.text}</p>
              {nudge.detail && <p className="muted">{nudge.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Transcript({ session }: { session: Session }) {
  const end = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const count = session.utterances.length;

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'nearest' });
  }, [open, count]);

  return (
    <details className="transcript" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Transcript <span className="muted">{count} lines</span>
      </summary>
      <div className="transcript-body">
        {session.utterances.map((u) => (
          <p key={u.id} className={u.isSelf ? 'self' : ''}>
            <span className="speaker">{u.speaker}</span> {u.text}
          </p>
        ))}
        <div ref={end} />
      </div>
    </details>
  );
}

function useElapsed(startedAt: number, endedAt: number | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [endedAt]);
  const minutes = Math.max(0, Math.round(((endedAt ?? now) - startedAt) / 60_000));
  return `${minutes} min`;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
