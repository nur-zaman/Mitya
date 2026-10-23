import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from '@/components/icons';
import { MODE_ORDER, MODES } from '@/lib/modes';
import { nameKey, uniqueNames, type PronunciationStore } from '@/lib/names';
import type { AgendaItem, Brief } from '@/lib/session/types';
import { briefItem, EMPTY_BRIEF, getBrief, pronunciationsItem } from '@/lib/storage';
import { useStorageItem } from '@/lib/use-storage';

export function BriefView() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [draftItem, setDraftItem] = useState('');
  const [draftName, setDraftName] = useState('');
  const hints = useStorageItem(pronunciationsItem);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void getBrief().then(setBrief);
  }, []);

  if (!brief) return null;

  const current = brief;

  function update(patch: Partial<Brief>) {
    const next = { ...current, ...patch };
    setBrief(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void briefItem.setValue(next), 300);
  }

  function addAgendaItem() {
    const text = draftItem.trim();
    if (!text) return;
    update({ agenda: [...current.agenda, { id: nextAgendaId(current.agenda), text }] });
    setDraftItem('');
  }

  function addName() {
    const names = uniqueNames([...current.names, ...draftName.split(',')]);
    if (names.length !== current.names.length) update({ names });
    setDraftName('');
  }

  const mode = MODES[brief.mode];

  return (
    <div className="stack">
      <p className="lede">
        Tell Mitya what this meeting is for. It uses this to decide what's worth pointing out. You
        can edit it mid-call.
      </p>

      <fieldset className="field">
        <legend>Kind of meeting</legend>
        <div className="chips">
          {MODE_ORDER.map((id) => (
            <button
              key={id}
              className={`chip ${brief.mode === id ? 'selected' : ''}`}
              onClick={() => update({ mode: id })}
            >
              {MODES[id].label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Title</span>
        <input
          value={brief.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="e.g. Backend interview with Sam"
        />
      </label>

      <label className="field">
        <span>Goal</span>
        <textarea
          rows={2}
          value={brief.goal}
          onChange={(e) => update({ goal: e.target.value })}
          placeholder={mode.goalHint}
        />
      </label>

      <div className="field">
        <span>Agenda</span>
        {brief.agenda.length > 0 && (
          <ol className="agenda-edit">
            {brief.agenda.map((item, index) => (
              <li key={item.id}>
                <input
                  value={item.text}
                  aria-label={`Agenda item ${index + 1}`}
                  onChange={(e) =>
                    update({
                      agenda: brief.agenda.map((a) =>
                        a.id === item.id ? { ...a, text: e.target.value } : a,
                      ),
                    })
                  }
                />
                <button
                  className="icon-button small"
                  aria-label={`Remove agenda item ${index + 1}`}
                  onClick={() => update({ agenda: brief.agenda.filter((a) => a.id !== item.id) })}
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="inline-add">
          <input
            value={draftItem}
            onChange={(e) => setDraftItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAgendaItem()}
            placeholder="Add a topic and press Enter"
          />
        </div>
      </div>

      <div className="field">
        <span>Names</span>
        <p className="hint muted">
          People and terms Mitya should spell right. It suggests how to say each one; fix any it
          gets wrong.
        </p>
        {brief.names.length > 0 && (
          <ul className="names-edit">
            {brief.names.map((name) => (
              <li key={name}>
                <span className="name">{name}</span>
                <HintInput name={name} hints={hints} />
                <button
                  className="icon-button small"
                  aria-label={`Remove ${name}`}
                  onClick={() => update({ names: brief.names.filter((n) => n !== name) })}
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="inline-add">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addName()}
            placeholder="Add a name or term and press Enter"
          />
        </div>
      </div>

      <label className="field">
        <span>Background</span>
        <textarea
          rows={6}
          value={brief.context}
          onChange={(e) => update({ context: e.target.value })}
          placeholder={mode.contextHint}
        />
      </label>

      <label className="field narrow">
        <span>Planned length</span>
        <div className="suffixed">
          <input
            type="number"
            min={5}
            step={5}
            value={brief.durationMinutes ?? ''}
            onChange={(e) =>
              update({ durationMinutes: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="30"
          />
          <span>min</span>
        </div>
      </label>

      <div className="row end">
        <button className="button quiet" onClick={() => update(EMPTY_BRIEF)}>
          Clear brief
        </button>
      </div>
    </div>
  );
}

function HintInput({ name, hints }: { name: string; hints: PronunciationStore | undefined }) {
  const saved = hints?.[nameKey(name)];
  const [draft, setDraft] = useState<string | null>(null);

  async function commit() {
    if (draft === null) return;
    const value = draft.trim();
    setDraft(null);
    if (value === (saved?.hint ?? '')) return;
    const store = await pronunciationsItem.getValue();
    await pronunciationsItem.setValue({ ...store, [nameKey(name)]: { hint: value, byUser: true } });
  }

  return (
    <input
      value={draft ?? saved?.hint ?? ''}
      aria-label={`How to say ${name}`}
      placeholder={saved ? 'no hint needed' : 'how to say it'}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function nextAgendaId(agenda: AgendaItem[]): string {
  const highest = agenda.reduce((max, item) => Math.max(max, Number(item.id.slice(1)) || 0), 0);
  return `a${highest + 1}`;
}
