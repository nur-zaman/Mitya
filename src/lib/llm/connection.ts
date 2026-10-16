import type { Settings } from '../session/types';
import { getAccessToken } from './chatgpt-auth';
import { PROVIDERS } from './providers';
import type { Connection } from './types';

/** Turns saved settings into a ready-to-use connection, refreshing ChatGPT tokens if needed. */
export async function resolveConnection(
  settings: Settings,
  overrides: Partial<Pick<Connection, 'model' | 'token'>> = {},
): Promise<Connection> {
  const provider = PROVIDERS[settings.provider];
  const base = {
    provider,
    model: overrides.model ?? settings.models[provider.id],
    thinking: settings.thinking[provider.id],
    fast: settings.fastMode && provider.fastTier,
  };

  if (provider.auth === 'chatgpt') {
    const tokens = await getAccessToken();
    return { ...base, token: tokens.access, accountId: tokens.accountId };
  }
  return { ...base, token: overrides.token ?? settings.apiKeys[provider.id] };
}
