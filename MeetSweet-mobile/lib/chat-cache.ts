/**
 * chat-cache.ts — local cache for private-message threads + chat media metadata.
 *
 * This is a PERFORMANCE/OFFLINE layer only. The server/database stays the
 * authoritative source of truth: the cache lets an already-viewed conversation
 * paint instantly on open, and lets the app know whether a message's media has
 * already been downloaded locally (so it is never fetched twice).
 *
 * Layout:
 *   • chat_threads  — full thread JSON (canonical message data, no binaries),
 *                     scoped by user. Read on open for instant paint, then the
 *                     HTTP fetch + WebSocket reconcile replace it.
 *   • chat_media_meta — metadata for cached attachments (messageId, mediaType,
 *                     remoteUrl, localUri, downloaded, downloadStatus). The
 *                     actual bytes live in Expo File System (chat-media.ts);
 *                     this table never stores binary data.
 *
 * SQLite on native, AsyncStorage fallback on web — same pattern as posts-db.ts.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PrivateMessage } from '@/services/private-inbox';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatMediaStatus = 'none' | 'downloading' | 'downloaded' | 'error';

export interface ChatMediaMeta {
  attachmentId: string;
  userId: string;
  messageId?: string | null;
  mediaType: 'image' | 'video' | 'file';
  remoteUrl: string | null;
  localUri: string | null;
  downloaded: boolean;
  status: ChatMediaStatus;
  cachedAt: number;
}

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _db: import('expo-sqlite').SQLiteDatabase | null = null;

async function getDb(): Promise<import('expo-sqlite').SQLiteDatabase | null> {
  if (Platform.OS === 'web') return null;
  if (_db) return _db;
  try {
    const SQLite = await import('expo-sqlite');
    _db = await SQLite.openDatabaseAsync('meetsweet_chat_cache.db');
    await _db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS chat_threads (
        thread_id TEXT PRIMARY KEY,
        user_id   TEXT NOT NULL,
        data      TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON chat_threads (user_id);

      CREATE TABLE IF NOT EXISTS chat_media_meta (
        attachment_id TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        message_id    TEXT,
        media_type    TEXT NOT NULL,
        remote_url    TEXT,
        local_uri     TEXT,
        downloaded    INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'none',
        cached_at     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_media_user ON chat_media_meta (user_id);
    `);
    return _db;
  } catch (e) {
    console.warn('[chat-cache] SQLite init failed:', e);
    return null;
  }
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

function threadKey(userId: string, threadId: string): string {
  return `@ms_chat_thread_${userId}_${threadId}`;
}

function mediaKey(attachmentId: string): string {
  return `@ms_chat_media_${attachmentId}`;
}

// ─── Threads ──────────────────────────────────────────────────────────────────

/** Cache the authoritative thread payload for instant re-open. */
export async function cacheThread(
  threadId: string,
  userId: string,
  message: PrivateMessage,
): Promise<void> {
  if (!threadId || !userId || !message) return;
  const db = await getDb();
  const json = JSON.stringify(message);
  if (db) {
    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO chat_threads (thread_id, user_id, data, cached_at)
         VALUES (?, ?, ?, ?)`,
        [threadId, userId, json, Date.now()],
      );
    } catch (e) {
      console.warn('[chat-cache] cacheThread error:', e);
    }
    return;
  }
  await AsyncStorage.setItem(threadKey(userId, threadId), json).catch(() => {});
}

/** Read a previously-cached thread (null when never opened on this device). */
export async function getCachedThread(
  threadId: string,
  userId: string,
): Promise<PrivateMessage | null> {
  if (!threadId || !userId) return null;
  const db = await getDb();
  if (db) {
    try {
      const row = await db.getFirstAsync<{ data: string }>(
        'SELECT data FROM chat_threads WHERE thread_id = ? AND user_id = ?',
        [threadId, userId],
      );
      if (!row) return null;
      return JSON.parse(row.data) as PrivateMessage;
    } catch (e) {
      console.warn('[chat-cache] getCachedThread error:', e);
      return null;
    }
  }
  const raw = await AsyncStorage.getItem(threadKey(userId, threadId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PrivateMessage;
  } catch {
    return null;
  }
}

// ─── Media metadata ───────────────────────────────────────────────────────────

export async function getChatMediaMeta(
  attachmentId: string,
): Promise<ChatMediaMeta | null> {
  if (!attachmentId) return null;
  const db = await getDb();
  if (db) {
    try {
      const row = await db.getFirstAsync<{
        attachment_id: string;
        user_id: string;
        message_id: string | null;
        media_type: 'image' | 'video' | 'file';
        remote_url: string | null;
        local_uri: string | null;
        downloaded: number;
        status: ChatMediaStatus;
        cached_at: number;
      }>(
        `SELECT attachment_id, user_id, message_id, media_type, remote_url,
                local_uri, downloaded, status, cached_at
         FROM chat_media_meta WHERE attachment_id = ?`,
        [attachmentId],
      );
      if (!row) return null;
      return {
        attachmentId: row.attachment_id,
        userId: row.user_id,
        messageId: row.message_id,
        mediaType: row.media_type,
        remoteUrl: row.remote_url,
        localUri: row.local_uri,
        downloaded: !!row.downloaded,
        status: row.status,
        cachedAt: row.cached_at,
      };
    } catch (e) {
      console.warn('[chat-cache] getChatMediaMeta error:', e);
      return null;
    }
  }
  const raw = await AsyncStorage.getItem(mediaKey(attachmentId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChatMediaMeta;
  } catch {
    return null;
  }
}

export async function setChatMediaMeta(meta: ChatMediaMeta): Promise<void> {
  if (!meta?.attachmentId) return;
  const db = await getDb();
  if (db) {
    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO chat_media_meta
           (attachment_id, user_id, message_id, media_type, remote_url, local_uri,
            downloaded, status, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          meta.attachmentId,
          meta.userId,
          meta.messageId ?? null,
          meta.mediaType,
          meta.remoteUrl ?? null,
          meta.localUri ?? null,
          meta.downloaded ? 1 : 0,
          meta.status,
          meta.cachedAt,
        ],
      );
    } catch (e) {
      console.warn('[chat-cache] setChatMediaMeta error:', e);
    }
    return;
  }
  await AsyncStorage.setItem(mediaKey(meta.attachmentId), JSON.stringify(meta)).catch(() => {});
}

export async function deleteChatMediaMeta(attachmentId: string): Promise<void> {
  if (!attachmentId) return;
  const db = await getDb();
  if (db) {
    try {
      await db.runAsync('DELETE FROM chat_media_meta WHERE attachment_id = ?', [attachmentId]);
    } catch {
      // best-effort
    }
    return;
  }
  await AsyncStorage.removeItem(mediaKey(attachmentId)).catch(() => {});
}

/** All cached media metadata for one user (used by cache pruning/cleanup). */
export async function listChatMediaMeta(userId?: string): Promise<ChatMediaMeta[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.getAllAsync<{
        attachment_id: string;
        user_id: string;
        message_id: string | null;
        media_type: 'image' | 'video' | 'file';
        remote_url: string | null;
        local_uri: string | null;
        downloaded: number;
        status: ChatMediaStatus;
        cached_at: number;
      }>(
        userId
          ? `SELECT attachment_id, user_id, message_id, media_type, remote_url,
                    local_uri, downloaded, status, cached_at
             FROM chat_media_meta WHERE user_id = ?`
          : `SELECT attachment_id, user_id, message_id, media_type, remote_url,
                    local_uri, downloaded, status, cached_at
             FROM chat_media_meta`,
        userId ? [userId] : [],
      );
      return rows.map((r) => ({
        attachmentId: r.attachment_id,
        userId: r.user_id,
        messageId: r.message_id,
        mediaType: r.media_type,
        remoteUrl: r.remote_url,
        localUri: r.local_uri,
        downloaded: !!r.downloaded,
        status: r.status,
        cachedAt: r.cached_at,
      }));
    } catch {
      return [];
    }
  }
  return [];
}

// ─── Clear on logout ──────────────────────────────────────────────────────────

/** Drop every thread + media-metadata row belonging to a user (called on logout). */
export async function clearUserChatCache(userId: string): Promise<void> {
  if (!userId) return;
  const db = await getDb();
  if (db) {
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM chat_threads WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM chat_media_meta WHERE user_id = ?', [userId]);
      });
    } catch (e) {
      console.warn('[chat-cache] clearUserChatCache error:', e);
    }
    return;
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith('@ms_chat_thread_') && k.includes(`_${userId}_`));
    if (mine.length) await AsyncStorage.multiRemove(mine);
    // AsyncStorage media keys carry the user id inside the value, not the key —
    // remove by reading each entry (bounded: only rows that belong to the user).
    const mediaKeys = keys.filter((k) => k.startsWith('@ms_chat_media_'));
    for (const k of mediaKeys) {
      const raw = await AsyncStorage.getItem(k).catch(() => null);
      if (!raw) continue;
      try {
        const meta = JSON.parse(raw) as ChatMediaMeta;
        if (meta.userId === userId) await AsyncStorage.removeItem(k).catch(() => {});
      } catch {
        // skip unparseable rows
      }
    }
  } catch (e) {
    console.warn('[chat-cache] clearUserChatCache fallback error:', e);
  }
}
