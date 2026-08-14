/**
 * session-storage.ts — SQLite session token persistence layer with AsyncStorage fallback.
 *
 * Persists and restores the authenticated user's session tokens (access token,
 * refresh token, user session object) in local SQLite database on native platforms,
 * with AsyncStorage synchronization for web compatibility and fast fallback.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/contexts/AuthContext';

const KEYS = {
  ACCESS_TOKEN: '@ms_access_token',
  REFRESH_TOKEN: '@ms_refresh_token',
  USER: '@ms_user',
} as const;

// ─── SQLite DB Singleton ──────────────────────────────────────────────────────

let _db: import('expo-sqlite').SQLiteDatabase | null = null;

async function getAuthDb(): Promise<import('expo-sqlite').SQLiteDatabase | null> {
  if (Platform.OS === 'web') return null;
  if (_db) return _db;
  try {
    const SQLite = await import('expo-sqlite');
    _db = await SQLite.openDatabaseAsync('meetsweet_auth_session.db');
    await _db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS auth_session (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    return _db;
  } catch (e) {
    console.warn('[session-storage] SQLite open failed, using AsyncStorage fallback:', e);
    return null;
  }
}

// ─── SecureStore Helper ──────────────────────────────────────────────────────

async function getSecureStore() {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-secure-store');
  } catch {
    return null;
  }
}

// ─── Core Session Storage Functions ──────────────────────────────────────────

/**
 * Save access token, refresh token, and user session to SecureStore + SQLite + AsyncStorage.
 */
export async function saveSessionTokens(
  accessToken: string,
  refreshToken: string,
  user: User,
): Promise<void> {
  const userJson = JSON.stringify(user);

  // 1. SecureStore (Hardware Keychain / KeyStore) — the authoritative token
  //    store on native. Tokens are NOT written to plaintext storage on native
  //    unless SecureStore is unavailable or its write fails.
  let secureStoreOk = false;
  try {
    const ss = await getSecureStore();
    if (ss) {
      const results = await Promise.allSettled([
        ss.setItemAsync(KEYS.ACCESS_TOKEN, accessToken),
        ss.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken),
      ]);
      secureStoreOk = results.every((r) => r.status === 'fulfilled');
    }
  } catch {}

  // 2. AsyncStorage — the (non-secret) user profile always; tokens on web and
  //    as a fallback whenever SecureStore is unavailable or its write failed,
  //    so a lost SecureStore write can never silently drop the session.
  const isWeb = Platform.OS === 'web';
  try {
    const items: [string, string][] = [[KEYS.USER, userJson]];
    if (isWeb || !secureStoreOk) {
      items.push([KEYS.ACCESS_TOKEN, accessToken], [KEYS.REFRESH_TOKEN, refreshToken]);
    }
    await AsyncStorage.multiSet(items);
  } catch (e) {
    console.warn('[session-storage] AsyncStorage setItem failed:', e);
  }

  // 3. SQLite — user profile only (native). Session tokens are intentionally
  //    kept out of plaintext SQLite.
  const db = await getAuthDb();
  if (db) {
    try {
      await db.runAsync(
        'INSERT OR REPLACE INTO auth_session (key, value) VALUES (?, ?)',
        [KEYS.USER, userJson],
      );
    } catch (e) {
      console.warn('[session-storage] SQLite save error:', e);
    }
  }
}

/**
 * Update cached user session object in SQLite + AsyncStorage.
 */
export async function saveSessionUser(user: User): Promise<void> {
  const userJson = JSON.stringify(user);
  try {
    await AsyncStorage.setItem(KEYS.USER, userJson);
  } catch {}

  const db = await getAuthDb();
  if (db) {
    try {
      await db.runAsync(
        'INSERT OR REPLACE INTO auth_session (key, value) VALUES (?, ?)',
        [KEYS.USER, userJson],
      );
    } catch (e) {
      console.warn('[session-storage] SQLite save user error:', e);
    }
  }
}

/**
 * Update access token in storage (e.g., after refresh).
 */
export async function updateAccessToken(accessToken: string): Promise<void> {
  // Native: store in SecureStore; fall back to AsyncStorage if SecureStore is
  // unavailable or the write fails, so a refresh can never silently lose the token.
  try {
    const ss = await getSecureStore();
    if (ss) {
      const ok = await ss.setItemAsync(KEYS.ACCESS_TOKEN, accessToken).then(() => true).catch(() => false);
      if (ok) return;
    }
  } catch {}
  await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, accessToken).catch(() => {});
}

/**
 * Update refresh token in storage.
 */
export async function updateRefreshToken(refreshToken: string): Promise<void> {
  // Native: store in SecureStore; fall back to AsyncStorage if SecureStore is
  // unavailable or the write fails, so a refresh can never silently lose the token.
  try {
    const ss = await getSecureStore();
    if (ss) {
      const ok = await ss.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken).then(() => true).catch(() => false);
      if (ok) return;
    }
  } catch {}
  await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken).catch(() => {});
}

/**
 * Load active session from SQLite first, falling back to AsyncStorage.
 */
export async function loadSession(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
}> {
  // Tokens come from the secure source first (see getAccessToken/getRefreshToken).
  const accessToken = await getAccessToken();
  const refreshToken = await getRefreshToken();

  // The user profile (non-secret) is read from SQLite (native) or AsyncStorage.
  let user: User | null = null;
  let userJson: string | null = null;
  const db = await getAuthDb();
  if (db) {
    try {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM auth_session WHERE key = ?',
        [KEYS.USER],
      );
      userJson = row?.value ?? null;
    } catch (e) {
      console.warn('[session-storage] SQLite read error:', e);
    }
  }
  if (!userJson) {
    userJson = await AsyncStorage.getItem(KEYS.USER).catch(() => null);
  }
  if (userJson) {
    try {
      user = JSON.parse(userJson) as User;
    } catch {
      user = null;
    }
  }

  return { accessToken, refreshToken, user };
}

/**
 * Get access token synchronously or fast-async.
 */
export async function getAccessToken(): Promise<string | null> {
  // 1. SecureStore (native, hardware-backed) is the authoritative source.
  try {
    const ss = await getSecureStore();
    if (ss) {
      const v = await ss.getItemAsync(KEYS.ACCESS_TOKEN).catch(() => null);
      if (v) return v;
    }
  } catch {}
  // 2. AsyncStorage (web / legacy fallback).
  const a = await AsyncStorage.getItem(KEYS.ACCESS_TOKEN).catch(() => null);
  if (a) return a;
  // 3. SQLite (legacy installs that predate SecureStore).
  const db = await getAuthDb();
  if (db) {
    try {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM auth_session WHERE key = ?',
        [KEYS.ACCESS_TOKEN],
      );
      if (row?.value) return row.value;
    } catch {}
  }
  return null;
}

/**
 * Get refresh token synchronously or fast-async.
 */
export async function getRefreshToken(): Promise<string | null> {
  // 1. SecureStore (native, hardware-backed) is the authoritative source.
  try {
    const ss = await getSecureStore();
    if (ss) {
      const v = await ss.getItemAsync(KEYS.REFRESH_TOKEN).catch(() => null);
      if (v) return v;
    }
  } catch {}
  // 2. AsyncStorage (web / legacy fallback).
  const a = await AsyncStorage.getItem(KEYS.REFRESH_TOKEN).catch(() => null);
  if (a) return a;
  // 3. SQLite (legacy installs that predate SecureStore).
  const db = await getAuthDb();
  if (db) {
    try {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM auth_session WHERE key = ?',
        [KEYS.REFRESH_TOKEN],
      );
      if (row?.value) return row.value;
    } catch {}
  }
  return null;
}

/**
 * Clear session tokens and user state from SQLite and AsyncStorage.
 */
export async function clearSessionStorage(): Promise<void> {
  try {
    const ss = await getSecureStore();
    if (ss) {
      await Promise.all([
        ss.deleteItemAsync(KEYS.ACCESS_TOKEN).catch(() => {}),
        ss.deleteItemAsync(KEYS.REFRESH_TOKEN).catch(() => {}),
      ]);
    }
  } catch {}

  try {
    await Promise.all([
      AsyncStorage.removeItem(KEYS.ACCESS_TOKEN),
      AsyncStorage.removeItem(KEYS.REFRESH_TOKEN),
      AsyncStorage.removeItem(KEYS.USER),
    ]);
  } catch (e) {
    console.warn('[session-storage] AsyncStorage clear error:', e);
  }

  const db = await getAuthDb();
  if (db) {
    try {
      await db.runAsync('DELETE FROM auth_session');
    } catch (e) {
      console.warn('[session-storage] SQLite clear error:', e);
    }
  }
}
