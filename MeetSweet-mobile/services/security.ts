/**
 * security.ts — Two-factor authentication service.
 *
 * Wraps the backend TOTP endpoints (/auth/2fa/*) so the settings screen and
 * login flow never talk to the raw routes directly.
 */
import { getAccessToken } from '@/lib/session-storage';
import { apiFetch, authFetch } from './api';

export interface TwoFactorStatus {
  enabled: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  otpauth_url: string;
}

async function authed<T>(path: string, options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  return authFetch<T>(path, token, options);
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return authed<TwoFactorStatus>('/auth/2fa/status');
}

/** Generate a fresh secret + otpauth URL. Does NOT enable 2FA yet. */
export async function setupTwoFactor(): Promise<TwoFactorSetup> {
  return authed<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST' });
}

/** Confirm the secret by submitting a current code — enables 2FA. */
export async function enableTwoFactor(code: string): Promise<{ enabled: boolean }> {
  return authed<{ enabled: boolean }>('/auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/** Disable 2FA (requires password + a current code when already active). */
export async function disableTwoFactor(password: string, code?: string): Promise<{ enabled: boolean }> {
  return authed<{ enabled: boolean }>('/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ password, ...(code ? { code } : {}) }),
  });
}

/** Complete a login challenge with a 6-digit authenticator code. */
export async function verifyTwoFactorLogin(challengeToken: string, code: string): Promise<{
  access_token: string;
  refresh_token: string;
  user: unknown;
}> {
  return apiFetch('/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ challenge_token: challengeToken, code }),
  });
}
