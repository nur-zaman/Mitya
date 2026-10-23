import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { listModels } from '@/lib/llm/client';
import { resolveConnection } from '@/lib/llm/connection';
import {
  inferModelInfo,
  PROVIDER_ORDER,
  PROVIDERS,
  type ModelInfo,
  type Provider,
  type ProviderId,
} from '@/lib/llm/providers';
import { send } from '@/lib/messages';
import type { Sensitivity, Settings } from '@/lib/session/types';
import { hasCredentials, settingsItem } from '@/lib/storage';

const SENSITIVITY: { id: Sensitivity; label: string; hint: string }[] = [
  { id: 'quiet', label: 'Quiet', hint: 'Only after longer answers' },
  { id: 'balanced', label: 'Balanced', hint: 'After most answers' },
  { id: 'chatty', label: 'Chatty', hint: 'Checks in often' },
];

const FAST_MODE_HINTS: Record<ProviderId, string> = {
  groq: '(Groq is already fast)',
  anthropic: '(Opus models only, billed at a higher rate)',
  chatgpt: '(priority processing, uses more of your plan)',
  openai: '(priority processing, billed at a higher rate)',
};

type Check = { state: 'idle' | 'checking' | 'ok' | 'error'; message?: string };

export function SettingsView({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const provider = PROVIDERS[settings.provider];
  const connected = hasCredentials(settings);
  const [models, setModels] = useState<ModelInfo[]>([]);

  function save(patch: Partial<Settings>) {
    void settingsItem.setValue({ ...settings, ...patch });
  }

  // Load the model catalog whenever the provider or its credentials change.
  const credential =
    provider.auth === 'chatgpt' ? settings.chatgptAccount : settings.apiKeys[provider.id];
  useEffect(() => {
    setModels([]);
    if (!credential) return;
    let active = true;
    resolveConnection(settings)
      .then(listModels)
      .then((found) => active && setModels(found))
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // Other settings change often; only refetch when the provider or credential does.
  }, [provider.id, credential]);

  return (
    <div className="stack">
      <h2 className="page-title">Settings</h2>

      <fieldset className="field">
        <legend>Model provider</legend>
        <div className="segmented">
          {PROVIDER_ORDER.map((id) => (
            <button
              key={id}
              className={settings.provider === id ? 'selected' : ''}
              onClick={() => id !== settings.provider && save({ provider: id })}
            >
              {PROVIDERS[id].label}
            </button>
          ))}
        </div>
        <small className={provider.auth === 'chatgpt' ? 'warning' : 'muted'}>
          {provider.blurb}
        </small>
      </fieldset>

      {provider.auth === 'chatgpt' ? (
        <ChatGptAccount account={settings.chatgptAccount} provider={provider} />
      ) : (
        <ApiKeyField
          key={provider.id}
          provider={provider}
          saved={settings.apiKeys[provider.id]}
          onSave={(key) => save({ apiKeys: { ...settings.apiKeys, [provider.id]: key } })}
        />
      )}

      <ModelFields settings={settings} models={models} onSave={save} disabled={!connected} />

      <fieldset className="field">
        <legend>How often Mitya speaks up</legend>
        <div className="segmented">
          {SENSITIVITY.map((option) => (
            <button
              key={option.id}
              className={settings.sensitivity === option.id ? 'selected' : ''}
              onClick={() => save({ sensitivity: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <small className="muted">
          {SENSITIVITY.find((option) => option.id === settings.sensitivity)?.hint}
        </small>
      </fieldset>

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={settings.showOverlay}
          onChange={(e) => save({ showOverlay: e.target.checked })}
        />
        <span>Show the floating card inside Meet</span>
      </label>

      <label className="field narrow">
        <span>Your caption label</span>
        <input value={settings.selfLabel} onChange={(e) => save({ selfLabel: e.target.value })} />
        <small className="muted">
          How Meet labels your own captions. It's "You" in English; change it if your Meet is in
          another language.
        </small>
      </label>

      <div className="row end">
        <button className="button" onClick={onDone} disabled={!connected}>
          Done
        </button>
      </div>
    </div>
  );
}

function ApiKeyField(props: { provider: Provider; saved: string; onSave: (key: string) => void }) {
  const { provider } = props;
  const [value, setValue] = useState(props.saved);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const connected = Boolean(props.saved) && value.trim() === props.saved;

  async function connect() {
    // Must run inside the click: Chrome only grants permissions on a user gesture.
    const granted = await requestOrigins(provider.id);
    if (!granted) {
      setCheck({ state: 'error', message: `Mitya needs permission to reach ${provider.label}.` });
      return;
    }

    const key = value.trim();
    setCheck({ state: 'checking' });
    try {
      const settings = await settingsItem.getValue();
      const found = await listModels(
        await resolveConnection({ ...settings, provider: provider.id }, { token: key }),
      );
      props.onSave(key);
      setCheck({ state: 'ok', message: `Connected. ${found.length} models available.` });
    } catch (error) {
      setCheck({ state: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <label className="field">
      <span>{provider.label} API key</span>
      <div className="row">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${provider.keyPrefix}…`}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className={`button ${connected ? 'quiet' : ''}`}
          onClick={() => void connect()}
          disabled={!value.trim() || check.state === 'checking'}
        >
          {check.state === 'checking' ? 'Checking…' : 'Connect'}
        </button>
      </div>
      <small className={check.state === 'error' ? 'error' : 'muted'}>
        {check.message ??
          (connected ? (
            'Connected. The key is stored only in this browser.'
          ) : (
            <>
              Create one at{' '}
              <a href={provider.keyUrl} target="_blank" rel="noreferrer">
                {new URL(provider.keyUrl).host}
              </a>
              . Stored only in this browser.
            </>
          ))}
      </small>
    </label>
  );
}

function ChatGptAccount({ account, provider }: { account: string | null; provider: Provider }) {
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    if (!(await requestOrigins(provider.id))) {
      setError('Mitya needs permission to reach ChatGPT to sign you in.');
      return;
    }
    void send({ type: 'chatgpt:sign-in' });
  }

  if (account) {
    return (
      <div className="field">
        <span>ChatGPT account</span>
        <div className="row between account">
          <span>{account}</span>
          <button
            className="button quiet small"
            onClick={() => void send({ type: 'chatgpt:sign-out' })}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <span>ChatGPT account</span>
      <div>
        <button className="button" onClick={() => void signIn()}>
          Sign in with ChatGPT
        </button>
      </div>
      <small className={error ? 'error' : 'muted'}>
        {error ??
          'Opens the OpenAI sign-in page in a new tab. It closes by itself when you are done.'}
      </small>
    </div>
  );
}

function ModelFields(props: {
  settings: Settings;
  models: ModelInfo[];
  disabled: boolean;
  onSave: (patch: Partial<Settings>) => void;
}) {
  const { settings, models, onSave } = props;
  const provider = PROVIDERS[settings.provider];
  const modelId = settings.models[provider.id];
  const model = models.find((m) => m.id === modelId) ?? inferModelInfo(provider.id, modelId);
  const options = models.some((m) => m.id === modelId) ? models : [model, ...models];
  const thinking = settings.thinking[provider.id];

  function chooseModel(id: string) {
    const next = models.find((m) => m.id === id) ?? inferModelInfo(provider.id, id);
    // Keep the thinking level if the new model supports it, otherwise use its default.
    const level = thinking && next.thinking.includes(thinking) ? thinking : next.defaultThinking;
    onSave({
      models: { ...settings.models, [provider.id]: id },
      thinking: { ...settings.thinking, [provider.id]: level },
    });
  }

  return (
    <>
      <label className="field">
        <span>Model</span>
        <select
          value={modelId}
          onChange={(e) => chooseModel(e.target.value)}
          disabled={props.disabled}
        >
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {model.thinking.length > 0 && (
        <fieldset className="field">
          <legend>Thinking</legend>
          <div className="segmented">
            {model.thinking.map((level) => (
              <button
                key={level}
                className={thinking === level ? 'selected' : ''}
                onClick={() => onSave({ thinking: { ...settings.thinking, [provider.id]: level } })}
              >
                {capitalize(level)}
              </button>
            ))}
          </div>
          <small className="muted">
            Less thinking means faster suggestions. Low is usually right during a call.
          </small>
        </fieldset>
      )}

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={settings.fastMode && provider.fastTier}
          disabled={!provider.fastTier}
          onChange={(e) => onSave({ fastMode: e.target.checked })}
        />
        <span>
          Fast mode <span className="muted">{FAST_MODE_HINTS[provider.id]}</span>
        </span>
      </label>
    </>
  );
}

function requestOrigins(id: ProviderId): Promise<boolean> {
  return browser.permissions.request({ origins: PROVIDERS[id].origins });
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
