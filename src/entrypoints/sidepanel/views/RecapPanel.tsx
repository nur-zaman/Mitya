import { useState } from 'react';
import { send } from '@/lib/messages';
import { sessionToMarkdown } from '@/lib/recap-markdown';
import type { AgendaStatus, Session } from '@/lib/session/types';

const STATUS_LABEL: Record<AgendaStatus, string> = {
  covered: 'Covered',
  partial: 'Partly',
  missed: 'Missed',
};

export function RecapPanel({ session }: { session: Session }) {
  const { recap } = session;

  return (
    <section className="recap">
      <div className="section-head">
        <h2>Recap</h2>
        <ExportButtons session={session} />
      </div>

      {session.recapState === 'running' && <p className="muted pulse">Writing the recap…</p>}
      {session.recapState === 'error' && (
        <p className="error">
          {session.recapError}{' '}
          <button
            className="link"
            onClick={() => void send({ type: 'session:recap', id: session.id })}
          >
            Try again
          </button>
        </p>
      )}
      {session.recapState === 'none' && !recap && (
        <p className="muted">
          No recap yet.{' '}
          <button
            className="link"
            onClick={() => void send({ type: 'session:recap', id: session.id })}
          >
            Write one
          </button>
        </p>
      )}

      {recap && (
        <>
          <p>{recap.summary}</p>

          {recap.agenda.length > 0 && (
            <ul className="recap-agenda">
              {recap.agenda.map((a) => (
                <li key={a.item}>
                  <span className={`badge badge-${a.status}`}>{STATUS_LABEL[a.status]}</span>
                  <div>
                    <strong>{a.item}</strong>
                    {a.note && <p className="muted">{a.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <List title="Key points" items={recap.keyPoints} />
          <List title="Worth checking" items={recap.concerns} />
          <List title="Follow-ups" items={recap.followUps} />
        </>
      )}
    </section>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul className="bullets">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </>
  );
}

function ExportButtons({ session }: { session: Session }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(sessionToMarkdown(session));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([sessionToMarkdown(session)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date(session.startedAt).toISOString().slice(0, 10);
    link.href = url;
    link.download = `${date}-${slug(session.brief.title || session.meetingCode)}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="row">
      <button className="button quiet small" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button className="button quiet small" onClick={download}>
        Download .md
      </button>
    </div>
  );
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'meeting'
  );
}
