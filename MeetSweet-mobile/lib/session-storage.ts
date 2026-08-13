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
  
  // 1. Save to SecureStore (Hardware Keychain / KeyStore)
  try {
    const ss = await getSecureStore();
    if (ss) {
      await Promise.all([
        ss.setItemAsync(KEYS.ACCESS_TOKEN, accessToken).catch(() => {}),
        ss.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken).catch(() => {}),
      ]);
    }
  } catch {}

  // 2. Save to AsyncStorage
  try {
    await Promise.all([
      AsyncStorage.setItem(KEYS.ACCESS_TOKEN, accessToken),
      AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken),
      AsyncStorage.setItem(KEYS.USER, userJson),
    ]);
  } catch (e) {
    console.warn('[session-storage] AsyncStorage setItem failed:', e);
  }

  // 3. Save to SQLite table auth_session (native)
  const db = await getAuthDb();
  if (db) {
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'INSERT OR REPLACE INTO auth_session (key, value) VALUES (?, ?)',
          [KEYS.ACCESS_TOKEN, accessToken],
        );
        await db.runAsync(
          'INSERT OR REPLACE INTO auth_session (key, value) VALUES (?, ?)',
          [KEYS.REFRESH_TOKEN, refreshToken],
        );
        await db.runAsync(
          'INSERT OR REPLACE INTO auth_session (key, value) VALUES (?, ?)',
          [KEYS.USER, userJson],
        );
      });
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
  try {
    await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, accessToken);
  } catch {}

  const db = await getAuthDb();
  if (db) {
    try {
      await db.runAsync(
        'INSERT OR REPLACE INTO auth_session (key, value) VALUES (?, ?)',
        [KEYS.ACCESS_TOKEN, accessToken],
      );
    } catch {}
  }
}

/**
 * Update refresh token in storage.
 */
export async function updateRefreshToken(refreshToken: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken);
  } catch {}

  const db = await getAuthDb();
  if (db) {
    try {
      await db.runAsync(
        'INSERT OR REPLACE INTO auth_session (key, value) VALUES (?, ?)',
        [KEYS.REFRESH_TOKEN, refreshToken],
      );
    } catch {}
  }
}

/**
 * Load active session from SQLite first, falling back to AsyncStorage.
 */
export async function loadSession(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
}> {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let userJson: string | null = null;

  // Try SQLite native DB first
  const db = await getAuthDb();
  if (db) {
    try {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        'SELECT key, value FROM auth_session WHERE key IN (?, ?, ?)',
        [KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN, KEYS.USER],
      );
      for (const row of rows) {
        if (row.key === KEYS.ACCESS_TOKEN) accessToken = row.value;
        if (row.key === KEYS.REFRESH_TOKEN) refreshToken = row.value;
        if (row.key === KEYS.USER) userJson = row.value;
      }
    } catch (e) {
      console.warn('[session-storage] SQLite read error:', e);
    }
  }

  // If missing any key from SQLite, try AsyncStorage
  if (!accessToken || !refreshToken || !userJson) {
    try {
      const [aToken, rToken, uJson] = await Promise.all([
        AsyncStorage.getItem(KEYS.ACCESS_TOKEN),
        AsyncStorage.getItem(KEYS.REFRESH_TOKEN),
        AsyncStorage.getItem(KEYS.USER),
      ]);
      if (!accessToken) accessToken = aToken;
      if (!refreshToken) refreshToken = rToken;
      if (!userJson) userJson = uJson;
    } catch (e) {
      console.warn('[session-storage] AsyncStorage read error:', e);
    }
  }

  let user: User | null = null;
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
  return AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
}

/**
 * Get refresh token synchronously or fast-async.
 */
export async function getRefreshToken(): Promise<string | null> {
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
  return AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
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
