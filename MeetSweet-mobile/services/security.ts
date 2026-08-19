/**
 * security.ts — Two-factor authentication service.
 *
 * Wraps the backend 2FA endpoints (/auth/2fa/*). Two-factor authentication is
 * email-code based: enabling, logging in, and disabling each verify a 6-digit
 * code sent to the account's email — there is no authenticator app or TOTP.
 */
import { getAccessToken } from '@/lib/session-storage';
import { apiFetch, authFetch } from './api';

export interface TwoFactorStatus {
  enabled: boolean;
}

export interface TwoFactorCodeSent {
  sent: boolean;
  expires_in_seconds?: number;
}

async function authed<T>(path: string, options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  return authFetch<T>(path, token, options);
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return authed<TwoFactorStatus>('/auth/2fa/status');
}

/**
 * Email a fresh 6-digit code to the account owner. Called before enabling 2FA
 * and again before disabling it (a current code is required in both cases).
 */
export async function sendTwoFactorCode(): Promise<TwoFactorCodeSent> {
  return authed<TwoFactorCodeSent>('/auth/2fa/setup', { method: 'POST' });
}

/** Confirm the emailed code — enables 2FA on the account. */
export async function enableTwoFactor(code: string): Promise<{ enabled: boolean }> {
  return authed<{ enabled: boolean }>('/auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/** Disable 2FA (requires password + a current emailed code when already active). */
export async function disableTwoFactor(password: string, code?: string): Promise<{ enabled: boolean }> {
  return authed<{ enabled: boolean }>('/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ password, ...(code ? { code } : {}) }),
  });
}

/** Complete a login challenge with the 6-digit code emailed during login. */
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
