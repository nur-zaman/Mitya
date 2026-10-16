import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mark } from '@/components/Mark';
import { describeStatus, NUDGE_LABELS } from '@/lib/labels';
import { send } from '@/lib/messages';
import { turnOnCaptions } from '@/lib/meet/dom';
import {
  currentSessionItem,
  hasCredentials,
  overlayPositionItem,
  settingsItem,
  normalizeSettings,
} from '@/lib/storage';
import { useStorageItem } from '@/lib/use-storage';
import type { MeetWatcher } from './watcher';

const VISIBLE_NUDGES = 3;

export function Overlay({ watcher }: { watcher: MeetWatcher }) {
  const meet = useSyncExternalStore(watcher.subscribe, watcher.getState);
  const storedSettings = useStorageItem(settingsItem);
  const settings = storedSettings && normalizeSettings(storedSettings);
  const stored = useStorageItem(currentSessionItem);
  const [collapsed, setCollapsed] = useState(false);
  const drag = useDraggable();

  if (!settings?.showOverlay || !meet.inCall) return null;

  const session = stored?.meetingCode === meet.meetingCode ? stored : null;
  const status = describeStatus(session, {
    hasKey: hasCredentials(settings),
    captionsOn: meet.captionsOn,
  });
  const nudges = (session?.nudges ?? [])
    .filter((n) => !n.dismissed)
    .slice(-VISIBLE_NUDGES)
    .reverse();

  return (
    <div className="card" ref={drag.ref} style={drag.style} data-collapsed={collapsed}>
      <header onPointerDown={drag.onPointerDown}>
        <Mark size={18} />
        <span className={`status status-${status.tone}`} title={status.text}>
          {status.text}
        </span>
        {collapsed && nudges.length > 0 && <span className="count">{nudges.length}</span>}
        <button
          className="icon"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '+' : '−'}
        </button>
      </header>

      {!collapsed && (
        <>
          {!meet.captionsOn && (
            <p className="hint">
              Mitya reads Meet's live captions.{' '}
              <button className="link" onClick={turnOnCaptions}>
                Turn them on
              </button>
            </p>
          )}
          {!hasCredentials(settings) && (
            <p className="hint">
              Add an API key to get suggestions.{' '}
              <button className="link" onClick={() => void send({ type: 'panel:open' })}>
                Open settings
              </button>
            </p>
          )}

          {nudges.length > 0 && (
            <ul className="nudges">
              {nudges.map((nudge) => (
                <li key={nudge.id} className={`nudge kind-${nudge.kind}`}>
                  <span className="kind">{NUDGE_LABELS[nudge.kind]}</span>
                  <p>{nudge.text}</p>
                  {nudge.detail && <p className="detail">{nudge.detail}</p>}
                  <button
                    className="icon dismiss"
                    aria-label="Dismiss"
                    onClick={() => void send({ type: 'nudge:dismiss', id: nudge.id })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <footer>
            <button
              onClick={() => void send({ type: 'session:analyze' })}
              disabled={!session || session.analysis.running}
            >
              Ask now
            </button>
            <button className="quiet" onClick={() => void send({ type: 'panel:open' })}>
              Open panel
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

/** Lets the user move the card out of the way. Position survives reloads. */
function useDraggable() {
  const ref = useRef<HTMLDivElement>(null);
  const saved = useStorageItem(overlayPositionItem);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (saved !== undefined && position === null) setPosition(saved);
  }, [saved, position]);

  function onPointerDown(event: React.PointerEvent) {
    if ((event.target as HTMLElement).closest('button') || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    let latest = { x: rect.left, y: rect.top };

    const move = (e: PointerEvent) => {
      latest = {
        x: clamp(e.clientX - offsetX, 0, window.innerWidth - rect.width),
        y: clamp(e.clientY - offsetY, 0, window.innerHeight - 40),
      };
      setPosition(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      void overlayPositionItem.setValue(latest);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const style: React.CSSProperties = position
    ? {
        left: clamp(position.x, 0, window.innerWidth - 120),
        top: clamp(position.y, 0, window.innerHeight - 40),
      }
    : { right: 16, top: 16 };

  return { ref, style, onPointerDown };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
