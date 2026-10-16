import { useEffect, useRef, useState } from 'react';
import { MODE_ORDER, MODES } from '@/lib/modes';
import type { AgendaItem, Brief } from '@/lib/session/types';
import { briefItem, EMPTY_BRIEF } from '@/lib/storage';

export function BriefView() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [draftItem, setDraftItem] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void briefItem.getValue().then(setBrief);
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
                  aria-label="Remove"
                  onClick={() => update({ agenda: brief.agenda.filter((a) => a.id !== item.id) })}
                >
                  ×
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

function nextAgendaId(agenda: AgendaItem[]): string {
  const highest = agenda.reduce((max, item) => Math.max(max, Number(item.id.slice(1)) || 0), 0);
  return `a${highest + 1}`;
}
