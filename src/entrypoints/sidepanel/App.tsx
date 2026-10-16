import { useEffect, useState } from 'react';
import { Mark } from '@/components/Mark';
import { describeStatus } from '@/lib/labels';
import { currentSessionItem, hasCredentials, settingsItem, normalizeSettings } from '@/lib/storage';
import { useStorageItem } from '@/lib/use-storage';
import { BriefView } from './views/BriefView';
import { HistoryView } from './views/HistoryView';
import { LiveView } from './views/LiveView';
import { SettingsView } from './views/SettingsView';

type View = 'brief' | 'live' | 'history' | 'settings';

const TABS: { id: View; label: string }[] = [
  { id: 'brief', label: 'Brief' },
  { id: 'live', label: 'Live' },
  { id: 'history', label: 'History' },
];

export function App() {
  const stored = useStorageItem(settingsItem);
  const settings = stored && normalizeSettings(stored);
  const session = useStorageItem(currentSessionItem);
  const [view, setView] = useState<View | null>(null);

  // Pick a sensible starting view once we know what's going on.
  useEffect(() => {
    if (view !== null || settings === undefined || session === undefined) return;
    if (!hasCredentials(settings)) setView('settings');
    else if (session && session.status !== 'ended') setView('live');
    else setView('brief');
  }, [view, settings, session]);

  // Jump to the live view when a new meeting starts (keyed on the id, not every update).
  const startedLiveId = session?.status === 'live' ? session.id : null;
  useEffect(() => {
    if (startedLiveId) setView((current) => (current === 'brief' ? 'live' : current));
  }, [startedLiveId]);

  if (!settings || session === undefined || view === null) return null;

  const status = describeStatus(session, { hasKey: hasCredentials(settings) });

  return (
    <div className="app">
      <header className="topbar">
        <Mark size={22} />
        <div className="title">
          <strong>Mitya</strong>
          <span className={`status status-${status.tone}`}>{status.text}</span>
        </div>
        <button
          className={`icon-button ${view === 'settings' ? 'active' : ''}`}
          onClick={() => setView(view === 'settings' ? 'brief' : 'settings')}
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon />
        </button>
      </header>

      {view !== 'settings' && (
        <nav className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={view === tab.id ? 'active' : ''}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
              {tab.id === 'live' && session?.status === 'live' && <span className="live-dot" />}
            </button>
          ))}
        </nav>
      )}

      <main>
        {view === 'brief' && <BriefView />}
        {view === 'live' && <LiveView session={session} />}
        {view === 'history' && <HistoryView />}
        {view === 'settings' && (
          <SettingsView settings={settings} onDone={() => setView('brief')} />
        )}
      </main>
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
