import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';

/*
 * "Sign in with ChatGPT", using the same OAuth client as OpenAI's Codex CLI.
 *
 * This is not an official integration. The client only allows a localhost
 * redirect, which an extension can't serve, so we open the sign-in page in a
 * tab and read the authorization code off the redirect URL before it fails to
 * load. Only call these from the background worker.
 */

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SCOPE = 'openid profile email offline_access';
const JWT_AUTH_CLAIM = 'https://api.openai.com/auth';

/** Refresh a little before expiry so a request never goes out with a stale token. */
const REFRESH_MARGIN_MS = 60_000;

export interface ChatGptTokens {
  access: string;
  refresh: string;
  expiresAt: number;
  accountId: string;
  email: string | null;
}

interface PendingSignIn {
  verifier: string;
  state: string;
  tabId: number;
}

export const chatGptTokensItem = storage.defineItem<ChatGptTokens | null>('local:chatgptTokens', {
  fallback: null,
});

/** Survives a worker restart mid-sign-in, cleared when the browser closes. */
const pendingItem = storage.defineItem<PendingSignIn | null>('session:chatgptSignIn', {
  fallback: null,
});

export async function startSignIn(): Promise<void> {
  const verifier = randomString(64);
  const state = randomString(32);
  const challenge = await sha256Base64Url(verifier);

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: 'codex_cli_rs',
  }).toString();

  const tab = await browser.tabs.create({ url: url.toString() });
  await pendingItem.setValue({ verifier, state, tabId: tab.id! });
}

/**
 * Watches for the OAuth redirect. Returns the signed-in tokens when this URL
 * completes a sign-in we started, otherwise null.
 */
export async function handleRedirect(tabId: number, rawUrl: string): Promise<ChatGptTokens | null> {
  if (!rawUrl.startsWith(REDIRECT_URI)) return null;
  const pending = await pendingItem.getValue();
  if (!pending || pending.tabId !== tabId) return null;

  await pendingItem.setValue(null);
  void browser.tabs.remove(tabId).catch(() => undefined);

  const url = new URL(rawUrl);
  const code = url.searchParams.get('code');
  if (!code || url.searchParams.get('state') !== pending.state) {
    throw new Error(url.searchParams.get('error_description') ?? 'Sign-in was cancelled');
  }

  const tokens = await requestTokens({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    code_verifier: pending.verifier,
    redirect_uri: REDIRECT_URI,
  });
  await chatGptTokensItem.setValue(tokens);
  return tokens;
}

/** Returns a usable access token, refreshing it first if needed. */
export async function getAccessToken(): Promise<ChatGptTokens> {
  const tokens = await chatGptTokensItem.getValue();
  if (!tokens) throw new Error('Sign in with ChatGPT in settings');
  if (tokens.expiresAt - REFRESH_MARGIN_MS > Date.now()) return tokens;

  try {
    const refreshed = await requestTokens({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: tokens.refresh,
    });
    await chatGptTokensItem.setValue(refreshed);
    return refreshed;
  } catch {
    throw new Error('Your ChatGPT session expired. Sign in again in settings');
  }
}

export async function signOut(): Promise<void> {
  await chatGptTokensItem.setValue(null);
}

async function requestTokens(params: Record<string, string>): Promise<ChatGptTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!response.ok) throw new Error(`ChatGPT sign-in failed (${response.status})`);

  const body = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    id_token?: string;
  };
  const claims = decodeJwt(body.access_token);
  const auth = claims?.[JWT_AUTH_CLAIM] as { chatgpt_account_id?: string } | undefined;
  if (!auth?.chatgpt_account_id) throw new Error('This account has no ChatGPT plan attached');

  const identity = body.id_token ? decodeJwt(body.id_token) : null;
  const profile = claims?.['https://api.openai.com/profile'] as { email?: string } | undefined;

  return {
    access: body.access_token,
    refresh: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    accountId: auth.chatgpt_account_id,
    email: (identity?.email as string | undefined) ?? profile?.email ?? null,
  };
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function randomString(bytes: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
