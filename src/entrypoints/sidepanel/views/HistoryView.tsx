import { useMemo, useState } from 'react';
import { send } from '@/lib/messages';
import { MODES } from '@/lib/modes';
import { archivedSessionItem, historyItem } from '@/lib/storage';
import { useStorageItem } from '@/lib/use-storage';
import { RecapPanel } from './RecapPanel';

export function HistoryView() {
  const history = useStorageItem(historyItem);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!history) return null;
  if (openId) return <SessionDetail id={openId} onBack={() => setOpenId(null)} />;

  if (!history.length) {
    return (
      <div className="empty">
        <h2>No past meetings</h2>
        <p className="muted">
          Finished meetings and their recaps show up here. They never leave this browser.
        </p>
      </div>
    );
  }

  return (
    <ul className="history">
      {history.map((entry) => (
        <li key={entry.id}>
          <button onClick={() => setOpenId(entry.id)}>
            <strong>{entry.title}</strong>
            <span className="muted">
              {MODES[entry.mode].label} · {formatDate(entry.startedAt)}
              {entry.endedAt
                ? ` · ${Math.round((entry.endedAt - entry.startedAt) / 60_000)} min`
                : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SessionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const item = useMemo(() => archivedSessionItem(id), [id]);
  const session = useStorageItem(item);

  if (session === undefined) return null;

  return (
    <div className="stack">
      <div className="row between">
        <button className="link" onClick={onBack}>
          ← All meetings
        </button>
        <button
          className="link danger"
          onClick={() => {
            if (confirm('Delete this meeting and its transcript?')) {
              void send({ type: 'session:delete', id });
              onBack();
            }
          }}
        >
          Delete
        </button>
      </div>

      {session ? (
        <>
          <h2 className="page-title">{session.brief.title || session.meetingCode}</h2>
          <RecapPanel session={session} />
          <details className="transcript">
            <summary>
              Transcript <span className="muted">{session.utterances.length} lines</span>
            </summary>
            <div className="transcript-body">
              {session.utterances.map((u) => (
                <p key={u.id} className={u.isSelf ? 'self' : ''}>
                  <span className="speaker">{u.speaker}</span> {u.text}
                </p>
              ))}
            </div>
          </details>
        </>
      ) : (
        <p className="muted">This meeting was deleted.</p>
      )}
    </div>
  );
}

function formatDate(time: number): string {
  return new Date(time).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
