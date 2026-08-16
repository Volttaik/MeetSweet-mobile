/**
 * Chat SQLite cache — instant loading, offline browsing.
 * On web (where SQLite isn't available), falls back to AsyncStorage.
 *
 * Room-based: everything is keyed by chatRoomId. The cache stores ChatRoom
 * metadata rows and room messages.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatRoom, RoomMessage, RoomContext, ContextAuth } from './room-service';

// ─── SQLite (native only) ────────────────────────────────────────────────────

let db: import('expo-sqlite').SQLiteDatabase | null = null;

async function getDb() {
  if (Platform.OS === 'web') return null;
  if (db) return db;
  try {
    const SQLite = await import('expo-sqlite');
    db = await SQLite.openDatabaseAsync('meetsweet_chat.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_room_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (chat_room_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS auth_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS drafts (
        chat_room_id TEXT PRIMARY KEY,
        text TEXT NOT NULL
      );
      /*
       * room_contexts — one row per (chatRoomId, currentUserId): the user's
       * contextId + contextAuth membership map for that room. The OTHER
       * participant has a SEPARATE row (different userId/contextId) for the
       * same chatRoomId, so the two contexts never collide on a shared device.
       */
      CREATE TABLE IF NOT EXISTS room_contexts (
        chat_room_id TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        context_id   TEXT,
        context_auth TEXT,
        marker       TEXT,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (chat_room_id, user_id)
      );
    `);
    // Additive migration: add context_id to messages if the column does not yet
    // exist (older installs created the table without it). ALTER TABLE ADD
    // COLUMN is idempotent-safe via the presence check below.
    try {
      const cols = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(messages)`,
      );
      if (!cols.some((c) => c.name === 'context_id')) {
        await db.execAsync(`ALTER TABLE messages ADD COLUMN context_id TEXT`);
      }
    } catch {
      // Non-fatal — context_id is optional; the JSON `data` column still
      // carries it for round-trip on installs that can't migrate.
    }
    // Migration: move the messages table from a single-column PK (id) to a
    // composite PK (chat_room_id, id). The old schema allowed two different
    // rooms to clobber each other if they ever produced a message with the
    // same id. SQLite cannot ALTER a PRIMARY KEY in place, so we rebuild the
    // table and copy existing rows. Idempotent: only runs if the old
    // single-PK schema is detected.
    try {
      const pkInfo = await db.getAllAsync<{ name: string; pk: number }>(
        `PRAGMA table_info(messages)`,
      );
      // In the composite-PK schema both chat_room_id and id have pk > 0.
      // In the old schema only id has pk > 0.
      const pkCols = pkInfo.filter((c) => c.pk > 0).map((c) => c.name);
      if (pkCols.length === 1 && pkCols[0] === 'id') {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS messages_new (
            chat_room_id TEXT NOT NULL,
            id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            context_id TEXT,
            PRIMARY KEY (chat_room_id, id)
          );
          INSERT OR IGNORE INTO messages_new (chat_room_id, id, data, created_at, context_id)
          SELECT chat_room_id, id, data, created_at, context_id FROM messages;
          DROP TABLE messages;
          ALTER TABLE messages_new RENAME TO messages;
          CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (chat_room_id, created_at DESC);
        `);
      }
    } catch {
      // Non-fatal — reads still filter by chat_room_id, so correctness holds
      // even if the composite PK migration can't run.
    }
    return db;
  } catch (e) {
    console.warn('[chat-cache] SQLite init failed:', e);
    return null;
  }
}

// ─── Chat Rooms ───────────────────────────────────────────────────────────────

export async function cacheChatRooms(chatRooms: ChatRoom[]): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.withTransactionAsync(async () => {
        for (const c of chatRooms) {
          await sqliteDb.runAsync(
            'INSERT OR REPLACE INTO chat_rooms (id, data, updated_at) VALUES (?, ?, ?)',
            [c.chatRoomId, JSON.stringify(c), Date.now()],
          );
        }
      });
    } catch (e) {
      console.warn('[chat-cache] cacheChatRooms error:', e);
    }
  } else {
    await AsyncStorage.setItem('@ms_chat_rooms', JSON.stringify(chatRooms));
  }
}

export async function getCachedChatRooms(): Promise<ChatRoom[]> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const rows = await sqliteDb.getAllAsync<{ data: string }>(
        'SELECT data FROM chat_rooms ORDER BY updated_at DESC LIMIT 200',
      );
      return rows.map((r) => JSON.parse(r.data) as ChatRoom);
    } catch {
      return [];
    }
  } else {
    const raw = await AsyncStorage.getItem('@ms_chat_rooms');
    return raw ? (JSON.parse(raw) as ChatRoom[]) : [];
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * Clear ALL locally-cached chat data (room list, messages, drafts, room
 * contexts). Called on logout/account switch so a different account can never
 * see the previous user's private conversations from the local cache.
 */
export async function clearChatCache(): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.withTransactionAsync(async () => {
        await sqliteDb.runAsync('DELETE FROM messages');
        await sqliteDb.runAsync('DELETE FROM chat_rooms');
        await sqliteDb.runAsync('DELETE FROM drafts');
        await sqliteDb.runAsync('DELETE FROM room_contexts');
      });
    } catch (e) {
      console.warn('[chat-cache] clearChatCache error:', e);
    }
    return;
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const chatKeys = keys.filter(
      (k) =>
        k === '@ms_chat_rooms' ||
        k.startsWith('@ms_room_messages_') ||
        k.startsWith('@ms_room_context_'),
    );
    if (chatKeys.length > 0) await AsyncStorage.multiRemove(chatKeys);
  } catch (e) {
    console.warn('[chat-cache] clearChatCache fallback error:', e);
  }
}

export async function cacheMessages(
  chatRoomId: string,
  messages: RoomMessage[],
): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.withTransactionAsync(async () => {
        for (const m of messages) {
          await sqliteDb.runAsync(
            'INSERT OR REPLACE INTO messages (id, chat_room_id, data, created_at, context_id) VALUES (?, ?, ?, ?, ?)',
            [
              m.id,
              chatRoomId,
              JSON.stringify(m),
              new Date(m.createdAt).getTime(),
              m.contextId ?? null,
            ],
          );
        }
      });
    } catch (e) {
      console.warn('[chat-cache] cacheMessages error:', e);
    }
  } else {
    const key = `@ms_room_messages_${chatRoomId}`;
    const existing = await AsyncStorage.getItem(key);
    const old: RoomMessage[] = existing ? JSON.parse(existing) : [];
    const merged = [...old, ...messages].filter(
      (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
    );
    await AsyncStorage.setItem(key, JSON.stringify(merged.slice(-300)));
  }
}

export async function getCachedMessages(chatRoomId: string): Promise<RoomMessage[]> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      // Newest-first so the cached snapshot matches the in-memory order the
      // chat screen expects (index 0 = newest). ASC here showed messages
      // reversed (oldest at the bottom) on the first paint.
      const rows = await sqliteDb.getAllAsync<{ data: string }>(
        'SELECT data FROM messages WHERE chat_room_id = ? ORDER BY created_at DESC LIMIT 200',
        [chatRoomId],
      );
      return rows.map((r) => JSON.parse(r.data) as RoomMessage);
    } catch {
      return [];
    }
  } else {
    const raw = await AsyncStorage.getItem(`@ms_room_messages_${chatRoomId}`);
    return raw ? (JSON.parse(raw) as RoomMessage[]) : [];
  }
}

export async function deleteCachedMessage(chatRoomId: string, messageId: string): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      // Mark as deleted instead of removing
      const row = await sqliteDb.getFirstAsync<{ data: string }>(
        'SELECT data FROM messages WHERE chat_room_id = ? AND id = ?',
        [chatRoomId, messageId],
      );
      if (row) {
        const msg = JSON.parse(row.data) as RoomMessage;
        msg.isDeleted = true;
        msg.body = null;
        await sqliteDb.runAsync(
          'UPDATE messages SET data = ? WHERE chat_room_id = ? AND id = ?',
          [JSON.stringify(msg), chatRoomId, messageId],
        );
      }
    } catch (e) {
      console.warn('[chat-cache] deleteCachedMessage error:', e);
    }
  } else {
    try {
      const key = `@ms_room_messages_${chatRoomId}`;
      const existing = await AsyncStorage.getItem(key);
      if (existing) {
        const messages = JSON.parse(existing) as RoomMessage[];
        const updated = messages.map((msg) => {
          if (msg.id === messageId) {
            return { ...msg, isDeleted: true, body: null };
          }
          return msg;
        });
        await AsyncStorage.setItem(key, JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('[chat-cache] deleteCachedMessage fallback error:', e);
    }
  }
}

/** Remove a message only from this device; the server copy is unchanged. */
export async function removeCachedMessage(
  chatRoomId: string,
  messageId: string,
): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.runAsync(
        'DELETE FROM messages WHERE chat_room_id = ? AND id = ?',
        [chatRoomId, messageId],
      );
    } catch (e) {
      console.warn('[chat-cache] removeCachedMessage error:', e);
    }
    return;
  }

  const key = `@ms_room_messages_${chatRoomId}`;
  const existing = await AsyncStorage.getItem(key);
  if (!existing) return;
  const messages = JSON.parse(existing) as RoomMessage[];
  await AsyncStorage.setItem(
    key,
    JSON.stringify(messages.filter((message) => message.id !== messageId)),
  );
}

/**
 * Remove ALL cached messages for a room from this device. Used by Clear Chat
 * and Delete Chat: the room container (chatRoomId + participants) survives on
 * the backend and in the chat list, only this user's message rows are dropped.
 */
export async function clearCachedMessages(chatRoomId: string): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.runAsync('DELETE FROM messages WHERE chat_room_id = ?', [
        chatRoomId,
      ]);
    } catch (e) {
      console.warn('[chat-cache] clearCachedMessages error:', e);
    }
    return;
  }
  await AsyncStorage.removeItem(`@ms_room_messages_${chatRoomId}`);
}

/**
 * Persist a resolved `localUri` onto a cached message row so the local file
 * reference survives reloads without re-downloading.
 */
export async function setCachedMessageLocalUri(
  chatRoomId: string,
  messageId: string,
  localUri: string | null,
): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const row = await sqliteDb.getFirstAsync<{ data: string }>(
        'SELECT data FROM messages WHERE chat_room_id = ? AND id = ?',
        [chatRoomId, messageId],
      );
      if (!row) return;
      const msg = JSON.parse(row.data) as RoomMessage;
      msg.localUri = localUri;
      await sqliteDb.runAsync(
        'UPDATE messages SET data = ? WHERE chat_room_id = ? AND id = ?',
        [JSON.stringify(msg), chatRoomId, messageId],
      );
    } catch (e) {
      console.warn('[chat-cache] setCachedMessageLocalUri error:', e);
    }
    return;
  }

  const key = `@ms_room_messages_${chatRoomId}`;
  const existing = await AsyncStorage.getItem(key);
  if (!existing) return;
  const messages = JSON.parse(existing) as RoomMessage[];
  const next = messages.map((m) => (m.id === messageId ? { ...m, localUri } : m));
  await AsyncStorage.setItem(key, JSON.stringify(next));
}

/**
 * Apply a partial update to one cached message row, identified by messageId.
 * Used to mirror server-confirmed edits and reaction changes into SQLite so
 * the local replica stays in sync: server response → update SQLite → render.
 * The message is NOT recreated — its id/row is preserved.
 */
export async function updateCachedMessage(
  chatRoomId: string,
  messageId: string,
  patch: Partial<RoomMessage>,
): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const row = await sqliteDb.getFirstAsync<{ data: string }>(
        'SELECT data FROM messages WHERE chat_room_id = ? AND id = ?',
        [chatRoomId, messageId],
      );
      if (!row) return;
      const msg = JSON.parse(row.data) as RoomMessage;
      const merged = { ...msg, ...patch };
      await sqliteDb.runAsync(
        'UPDATE messages SET data = ? WHERE chat_room_id = ? AND id = ?',
        [JSON.stringify(merged), chatRoomId, messageId],
      );
    } catch (e) {
      console.warn('[chat-cache] updateCachedMessage error:', e);
    }
    return;
  }
  const key = `@ms_room_messages_${chatRoomId}`;
  const existing = await AsyncStorage.getItem(key);
  if (!existing) return;
  const messages = JSON.parse(existing) as RoomMessage[];
  const next = messages.map((m) =>
    m.id === messageId ? { ...m, ...patch } : m,
  );
  await AsyncStorage.setItem(key, JSON.stringify(next));
}

/**
 * Remove a cached Chat Room from the local chat list (delete-chat). The
 * underlying chatRoomId stays alive on the backend and the other participant's
 * context is untouched — only this user's cached room metadata row is dropped.
 */
export async function removeCachedRoom(chatRoomId: string): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.runAsync('DELETE FROM chat_rooms WHERE id = ?', [chatRoomId]);
    } catch (e) {
      console.warn('[chat-cache] removeCachedRoom error:', e);
    }
    return;
  }
  const raw = await AsyncStorage.getItem('@ms_chat_rooms');
  if (!raw) return;
  const rooms = JSON.parse(raw) as ChatRoom[];
  await AsyncStorage.setItem(
    '@ms_chat_rooms',
    JSON.stringify(rooms.filter((r) => r.chatRoomId !== chatRoomId)),
  );
}

// ─── Room context + contextAuth (per-user message membership) ────────────────

/**
 * Persist the requesting user's context (contextId + contextAuth membership)
 * for a room into SQLite. One row per (chatRoomId, userId) — the other
 * participant has a separate row. The membership map is stored as JSON; the
 * mobile app NEVER invents or modifies the authoritative version — it only
 * mirrors what the server returned via getRoomContext.
 */
export async function cacheRoomContext(
  chatRoomId: string,
  userId: string,
  ctx: RoomContext,
): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.runAsync(
        `INSERT OR REPLACE INTO room_contexts
           (chat_room_id, user_id, context_id, context_auth, marker, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          chatRoomId,
          userId,
          ctx.contextId ?? null,
          JSON.stringify(ctx.contextAuth),
          ctx.contextAuth.marker ?? null,
          Date.now(),
        ],
      );
    } catch (e) {
      console.warn('[chat-cache] cacheRoomContext error:', e);
    }
    return;
  }
  await AsyncStorage.setItem(
    `@ms_room_context_${chatRoomId}_${userId}`,
    JSON.stringify(ctx),
  );
}

/**
 * Read the requesting user's cached context for a room. Returns null if no
 * context has been synced yet (e.g. backend has not shipped /context).
 */
export async function getCachedRoomContext(
  chatRoomId: string,
  userId: string,
): Promise<RoomContext | null> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const row = await sqliteDb.getFirstAsync<{
        context_id: string | null;
        context_auth: string | null;
        marker: string | null;
      }>(
        `SELECT context_id, context_auth, marker FROM room_contexts
         WHERE chat_room_id = ? AND user_id = ?`,
        [chatRoomId, userId],
      );
      if (!row) return null;
      const auth: ContextAuth = row.context_auth
        ? JSON.parse(row.context_auth)
        : {};
      return {
        chatRoomId,
        contextId: row.context_id ?? null,
        userId,
        contextAuth: { ...auth, marker: auth.marker ?? row.marker ?? null },
      };
    } catch {
      return null;
    }
  }
  const raw = await AsyncStorage.getItem(
    `@ms_room_context_${chatRoomId}_${userId}`,
  );
  return raw ? (JSON.parse(raw) as RoomContext) : null;
}

/**
 * Apply server-directed membership removals to the local replica.
 *
 * For each id in `removedMessageIds`: delete the matching message row from
 * SQLite/AsyncStorage AND drop it from the cached contextAuth membership set.
 * This is the "remove MSG_002 from User A's context" path — the ROOM and the
 * other participant's context are untouched.
 *
 * No user-initiated action is performed here; this only mirrors server state.
 */
export async function applyContextAuthRemovals(
  chatRoomId: string,
  userId: string,
  removedMessageIds: string[],
): Promise<void> {
  if (!removedMessageIds.length) return;

  // 1) Remove the message rows from the local replica.
  for (const messageId of removedMessageIds) {
    await removeCachedMessage(chatRoomId, messageId);
  }

  // 2) Drop them from the cached membership set so the local contextAuth
  //    mirrors the server's current view.
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const row = await sqliteDb.getFirstAsync<{ context_auth: string | null }>(
        `SELECT context_auth FROM room_contexts
         WHERE chat_room_id = ? AND user_id = ?`,
        [chatRoomId, userId],
      );
      if (row?.context_auth) {
        const auth = JSON.parse(row.context_auth) as ContextAuth;
        if (Array.isArray(auth.messageIds)) {
          const remove = new Set(removedMessageIds);
          auth.messageIds = auth.messageIds.filter((id) => !remove.has(id));
          await sqliteDb.runAsync(
            `UPDATE room_contexts SET context_auth = ?, updated_at = ?
             WHERE chat_room_id = ? AND user_id = ?`,
            [JSON.stringify(auth), Date.now(), chatRoomId, userId],
          );
        }
      }
    } catch (e) {
      console.warn('[chat-cache] applyContextAuthRemovals error:', e);
    }
    return;
  }

  const ctxKey = `@ms_room_context_${chatRoomId}_${userId}`;
  const raw = await AsyncStorage.getItem(ctxKey);
  if (!raw) return;
  const ctx = JSON.parse(raw) as RoomContext;
  if (Array.isArray(ctx.contextAuth.messageIds)) {
    const remove = new Set(removedMessageIds);
    ctx.contextAuth.messageIds = ctx.contextAuth.messageIds.filter(
      (id) => !remove.has(id),
    );
    await AsyncStorage.setItem(ctxKey, JSON.stringify(ctx));
  }
}

/**
 * Empty the requesting user's context membership for a room (clear-for-one
 * foundation). The ROOM still exists and the other participant is untouched;
 * only this user's local contextAuth becomes empty and local message rows are
 * dropped. NOT wired to any UI action yet — foundation only.
 */
export async function clearCachedRoomContext(
  chatRoomId: string,
  userId: string,
): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.withTransactionAsync(async () => {
        await sqliteDb.runAsync(
          `DELETE FROM messages WHERE chat_room_id = ?`,
          [chatRoomId],
        );
        await sqliteDb.runAsync(
          `UPDATE room_contexts
             SET context_auth = ?, marker = ?, updated_at = ?
           WHERE chat_room_id = ? AND user_id = ?`,
          [JSON.stringify({ messageIds: [] } as ContextAuth), null, Date.now(), chatRoomId, userId],
        );
      });
    } catch (e) {
      console.warn('[chat-cache] clearCachedRoomContext error:', e);
    }
    return;
  }
  await AsyncStorage.removeItem(`@ms_room_messages_${chatRoomId}`);
  const ctxKey = `@ms_room_context_${chatRoomId}_${userId}`;
  const raw = await AsyncStorage.getItem(ctxKey);
  if (raw) {
    const ctx = JSON.parse(raw) as RoomContext;
    ctx.contextAuth = { messageIds: [], marker: null };
    await AsyncStorage.setItem(ctxKey, JSON.stringify(ctx));
  }
}

// ─── Auth cache ───────────────────────────────────────────────────────────────

export async function cacheAuthValue(key: string, value: string): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.runAsync(
        'INSERT OR REPLACE INTO auth_cache (key, value) VALUES (?, ?)',
        [key, value],
      );
    } catch {}
  } else {
    await AsyncStorage.setItem(`@ms_auth_${key}`, value);
  }
}

export async function getAuthValue(key: string): Promise<string | null> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const row = await sqliteDb.getFirstAsync<{ value: string }>(
        'SELECT value FROM auth_cache WHERE key = ?',
        [key],
      );
      return row?.value ?? null;
    } catch {
      return null;
    }
  } else {
    return AsyncStorage.getItem(`@ms_auth_${key}`);
  }
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export async function saveDraft(chatRoomId: string, text: string): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      if (text.trim()) {
        await sqliteDb.runAsync(
          'INSERT OR REPLACE INTO drafts (chat_room_id, text) VALUES (?, ?)',
          [chatRoomId, text],
        );
      } else {
        await sqliteDb.runAsync('DELETE FROM drafts WHERE chat_room_id = ?', [chatRoomId]);
      }
    } catch {}
  }
}

export async function getDraft(chatRoomId: string): Promise<string> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const row = await sqliteDb.getFirstAsync<{ text: string }>(
        'SELECT text FROM drafts WHERE chat_room_id = ?',
        [chatRoomId],
      );
      return row?.text ?? '';
    } catch {
      return '';
    }
  }
  return '';
}