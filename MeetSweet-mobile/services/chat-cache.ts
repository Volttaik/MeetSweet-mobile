/**
 * Chat cache — local persistence for instant chat rendering.
 *
 * Storage architecture (per the Expo data-persistence guidance):
 *   • STRUCTURED CHAT DATA → expo-sqlite. One row per message (never one giant
 *     JSON blob per conversation), scoped by userId, indexed by
 *     (chatRoomId, createdAt) so a room's messages are queryable, ordered and
 *     incrementally upserted. The database persists across application
 *     restarts (Expo SQLite docs) — this is the durable source for
 *     previously-loaded conversations.
 *   • MEDIA FILES → expo-file-system PERSISTENT document directory
 *     (services/chat-media.ts). `Paths.document` is the "safe from system
 *     eviction" directory (unlike Paths.cache). Files are keyed by the STABLE
 *     message id (`<messageId>.<ext>`), never by the remote/signed URL, so a
 *     URL rotation never triggers a re-download.
 *
 * The backend remains the source of truth: this cache is only the fast
 * rendering layer that is reconciled in the background.
 *
 * Schema (all rows user-scoped so a different account can NEVER render the
 * previous user's conversations):
 *
 *   chat_rooms_cache     (user_id, chat_room_id, data, updated_at)
 *   chat_messages_cache  (user_id, chat_room_id, message_id, data, created_at)
 *   chat_contexts_cache  (user_id, chat_room_id, data)
 *   chat_drafts_cache    (user_id, chat_room_id, text)
 *   chat_auth_cache      (key, value)
 *
 * On logout/account switch, clearChatCache() wipes every table so a different
 * account can never see the previous user's private conversations.
 *
 * Web is unsupported (no native SQLite without wasm/COOP/COEP setup) — all
 * functions there no-op and the app naturally falls back to the network.
 */

import { Platform } from 'react-native';
import type { ChatRoom, RoomMessage, RoomContext, ContextAuth } from './room-service';
import { deleteRoomMedia } from './chat-media';

// ─── Database singleton (same pattern as lib/posts-db.ts) ────────────────────

type SQLiteDatabase = import('expo-sqlite').SQLiteDatabase;

let _db: SQLiteDatabase | null | undefined;

async function getDb(): Promise<SQLiteDatabase | null> {
  if (Platform.OS === 'web') return null;
  if (_db !== undefined) return _db;
  try {
    const SQLite = await import('expo-sqlite');
    const db = await SQLite.openDatabaseAsync('meetsweet_chat.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      -- One row per chat room, per account.
      CREATE TABLE IF NOT EXISTS chat_rooms_cache (
        user_id      TEXT NOT NULL,
        chat_room_id TEXT NOT NULL,
        data         TEXT NOT NULL,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (user_id, chat_room_id)
      );

      -- One row per message, per account, per room. created_at (epoch ms) is
      -- a real column so ordering + trimming happen in SQL, not in JS.
      CREATE TABLE IF NOT EXISTS chat_messages_cache (
        user_id      TEXT NOT NULL,
        chat_room_id TEXT NOT NULL,
        message_id   TEXT NOT NULL,
        data         TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        PRIMARY KEY (user_id, chat_room_id, message_id)
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
        ON chat_messages_cache (user_id, chat_room_id, created_at DESC);

      -- Requesting user's context (contextId + contextAuth membership).
      CREATE TABLE IF NOT EXISTS chat_contexts_cache (
        user_id      TEXT NOT NULL,
        chat_room_id TEXT NOT NULL,
        data         TEXT NOT NULL,
        PRIMARY KEY (user_id, chat_room_id)
      );

      -- Per-room draft text.
      CREATE TABLE IF NOT EXISTS chat_drafts_cache (
        user_id      TEXT NOT NULL,
        chat_room_id TEXT NOT NULL,
        text         TEXT NOT NULL,
        PRIMARY KEY (user_id, chat_room_id)
      );

      -- Shared auth key/value cache.
      CREATE TABLE IF NOT EXISTS chat_auth_cache (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    // One-time best-effort migration of the legacy FileSystem JSON cache
    // (pre-SQLite chat-cache/) into the new structured tables, then removal of
    // the old files. Any failure is logged and skipped — the new cache is
    // never blocked by leftover legacy data.
    await migrateLegacyFileCache(db).catch(() => {});
    _db = db;
    return db;
  } catch (e) {
    console.warn('[chat-cache] SQLite init failed:', e);
    _db = null;
    return null;
  }
}

// ─── One-time migration from the legacy FileSystem JSON cache ─────────────────

/**
 * Import conversations cached by the pre-SQLite implementation
 * (<document>/chat-cache/<userId>/…) into expo-sqlite, then delete the legacy
 * tree. Per-user directories map to rows scoped by that userId; the 'shared'
 * directory (no account) is skipped because it cannot be attributed safely.
 * Runs at most once in practice — after the tree is removed the root does not
 * exist and this returns immediately. Best-effort: every read/write is
 * individually guarded so a malformed legacy file never breaks the new cache.
 */
async function migrateLegacyFileCache(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS === 'web') return;
  let fs: typeof import('expo-file-system');
  try {
    fs = await import('expo-file-system');
  } catch {
    return;
  }

  const readJson = (file: { exists: boolean; textSync: () => string }): unknown => {
    try {
      if (!file.exists) return null;
      const raw = file.textSync();
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const root = new fs.Directory(fs.Paths.document, 'chat-cache');
  if (!root.exists) return;

  try {
    for (const entry of root.list()) {
      if (!(entry instanceof fs.Directory)) continue;
      const userId = entry.name;
      if (!userId || userId === 'shared') continue;

      try {
        // rooms.json
        const rooms = readJson(new fs.File(fs.Paths.document, 'chat-cache', userId, 'rooms.json'));
        if (Array.isArray(rooms)) {
          for (const room of rooms as Array<{ chatRoomId?: string }>) {
            if (!room?.chatRoomId) continue;
            await db.runAsync(
              `INSERT OR REPLACE INTO chat_rooms_cache (user_id, chat_room_id, data, updated_at)
               VALUES (?, ?, ?, ?)`,
              [userId, room.chatRoomId, JSON.stringify(room),
               new Date((room as { lastMessageAt?: string; createdAt?: string }).lastMessageAt ?? (room as { createdAt?: string }).createdAt ?? 0).getTime() || 0],
            );
          }
        }

        // messages/<roomId>.json
        const msgsDir = new fs.Directory(fs.Paths.document, 'chat-cache', userId, 'messages');
        if (msgsDir.exists) {
          for (const mf of msgsDir.list()) {
            if (!(mf instanceof fs.File)) continue;
            const roomId = mf.name.replace(/\.json$/, '');
            const msgs = readJson(mf);
            if (!Array.isArray(msgs)) continue;
            for (const m of msgs as Array<{ id?: string; createdAt?: string }>) {
              if (!m?.id) continue;
              await db.runAsync(
                `INSERT OR REPLACE INTO chat_messages_cache (user_id, chat_room_id, message_id, data, created_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, roomId, m.id, JSON.stringify(m), new Date(m.createdAt ?? 0).getTime() || 0],
              );
            }
          }
        }

        // contexts/<roomId>.json
        const ctxDir = new fs.Directory(fs.Paths.document, 'chat-cache', userId, 'contexts');
        if (ctxDir.exists) {
          for (const cf of ctxDir.list()) {
            if (!(cf instanceof fs.File)) continue;
            const roomId = cf.name.replace(/\.json$/, '');
            const ctx = readJson(cf);
            if (ctx && typeof ctx === 'object') {
              await db.runAsync(
                `INSERT OR REPLACE INTO chat_contexts_cache (user_id, chat_room_id, data) VALUES (?, ?, ?)`,
                [userId, roomId, JSON.stringify(ctx)],
              );
            }
          }
        }

        // drafts.json
        const drafts = readJson(new fs.File(fs.Paths.document, 'chat-cache', userId, 'drafts.json')) as
          Record<string, string> | null;
        if (drafts && typeof drafts === 'object') {
          for (const [roomId, text] of Object.entries(drafts)) {
            if (!text) continue;
            await db.runAsync(
              `INSERT OR REPLACE INTO chat_drafts_cache (user_id, chat_room_id, text) VALUES (?, ?, ?)`,
              [userId, roomId, text],
            );
          }
        }
      } catch (e) {
        console.warn('[chat-cache] migration skipped for user', userId, e);
      }
    }

    // auth.json (shared, no user scoping)
    const auth = readJson(new fs.File(fs.Paths.document, 'chat-cache', 'auth.json')) as
      Record<string, string> | null;
    if (auth && typeof auth === 'object') {
      for (const [key, value] of Object.entries(auth)) {
        await db.runAsync(
          `INSERT OR REPLACE INTO chat_auth_cache (key, value) VALUES (?, ?)`,
          [key, String(value)],
        );
      }
    }
  } catch (e) {
    console.warn('[chat-cache] legacy migration error:', e);
  }

  // The new cache never reads the legacy tree — remove it so it stops
  // occupying persistent storage.
  try {
    if (root.exists) root.delete();
  } catch (e) {
    console.warn('[chat-cache] legacy tree cleanup error:', e);
  }
}

// ─── Limits (same as the legacy file-based cache) ─────────────────────────────

const MAX_ROOMS = 200;
const MAX_MESSAGES_PER_ROOM = 300;

// ─── Row mapping ──────────────────────────────────────────────────────────────

function roomUpdatedAt(room: ChatRoom): number {
  return new Date(room.lastMessageAt ?? room.createdAt).getTime() || 0;
}

function messageCreatedAt(m: RoomMessage): number {
  return new Date(m.createdAt).getTime() || 0;
}

function parseData<T>(row: { data: string } | null | undefined): T | null {
  if (!row) return null;
  try {
    return JSON.parse(row.data) as T;
  } catch {
    return null;
  }
}

// ─── Chat Rooms ───────────────────────────────────────────────────────────────

export async function cacheChatRooms(chatRooms: ChatRoom[], userId?: string | null): Promise<void> {
  const db = await getDb();
  if (!db || !Array.isArray(chatRooms) || chatRooms.length === 0) return;
  const uid = userId || 'shared';
  const now = Date.now();
  try {
    await db.withTransactionAsync(async () => {
      for (const room of chatRooms) {
        await db.runAsync(
          `INSERT OR REPLACE INTO chat_rooms_cache (user_id, chat_room_id, data, updated_at)
           VALUES (?, ?, ?, ?)`,
          [uid, room.chatRoomId, JSON.stringify(room), roomUpdatedAt(room) || now],
        );
      }
      // Keep only the newest MAX_ROOMS rooms for this account.
      await db.runAsync(
        `DELETE FROM chat_rooms_cache WHERE user_id = ? AND chat_room_id NOT IN (
           SELECT chat_room_id FROM chat_rooms_cache WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?
         )`,
        [uid, uid, MAX_ROOMS],
      );
    });
  } catch (e) {
    console.warn('[chat-cache] cacheChatRooms error:', e);
  }
}

export async function getCachedChatRooms(userId?: string | null): Promise<ChatRoom[]> {
  const db = await getDb();
  if (!db) return [];
  const uid = userId || 'shared';
  try {
    const rows = await db.getAllAsync<{ data: string }>(
      `SELECT data FROM chat_rooms_cache WHERE user_id = ?
       ORDER BY updated_at DESC LIMIT ?`,
      [uid, MAX_ROOMS],
    );
    const rooms = rows.map((r) => parseData<ChatRoom>(r)).filter((r): r is ChatRoom => !!r);
    rooms.sort((a, b) => {
      const ta = new Date(a.lastMessageAt ?? a.createdAt).getTime();
      const tb = new Date(b.lastMessageAt ?? b.createdAt).getTime();
      return tb - ta;
    });
    return rooms.slice(0, MAX_ROOMS);
  } catch (e) {
    console.warn('[chat-cache] getCachedChatRooms error:', e);
    return [];
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * Clear ALL locally-cached chat data (rooms, messages, contexts, drafts, auth)
 * for every account. Called on logout/account switch so a different account
 * can never see the previous user's private conversations from the local cache.
 */
export async function clearChatCache(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execAsync(`
      DELETE FROM chat_rooms_cache;
      DELETE FROM chat_messages_cache;
      DELETE FROM chat_contexts_cache;
      DELETE FROM chat_drafts_cache;
      DELETE FROM chat_auth_cache;
    `);
  } catch (e) {
    console.warn('[chat-cache] clearChatCache error:', e);
  }
}

export async function cacheMessages(
  chatRoomId: string,
  messages: RoomMessage[],
  userId?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db || !chatRoomId || !Array.isArray(messages) || messages.length === 0) return;
  const uid = userId || 'shared';
  try {
    await db.withTransactionAsync(async () => {
      for (const m of messages) {
        if (!m.id) continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO chat_messages_cache (user_id, chat_room_id, message_id, data, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uid, chatRoomId, m.id, JSON.stringify(m), messageCreatedAt(m)],
        );
      }
      // Keep only the newest MAX_MESSAGES_PER_ROOM for this account + room.
      await db.runAsync(
        `DELETE FROM chat_messages_cache WHERE user_id = ? AND chat_room_id = ? AND message_id NOT IN (
           SELECT message_id FROM chat_messages_cache
           WHERE user_id = ? AND chat_room_id = ? ORDER BY created_at DESC LIMIT ?
         )`,
        [uid, chatRoomId, uid, chatRoomId, MAX_MESSAGES_PER_ROOM],
      );
    });
  } catch (e) {
    console.warn('[chat-cache] cacheMessages error:', e);
  }
}

export async function getCachedMessages(chatRoomId: string, userId?: string | null): Promise<RoomMessage[]> {
  const db = await getDb();
  if (!db || !chatRoomId) return [];
  const uid = userId || 'shared';
  try {
    const rows = await db.getAllAsync<{ data: string }>(
      `SELECT data FROM chat_messages_cache
       WHERE user_id = ? AND chat_room_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      [uid, chatRoomId, MAX_MESSAGES_PER_ROOM],
    );
    const msgs = rows.map((r) => parseData<RoomMessage>(r)).filter((m): m is RoomMessage => !!m);
    msgs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return msgs.slice(0, MAX_MESSAGES_PER_ROOM);
  } catch (e) {
    console.warn('[chat-cache] getCachedMessages error:', e);
    return [];
  }
}

/** Mark a message as soft-deleted in the local replica (server copy unchanged). */
export async function deleteCachedMessage(
  chatRoomId: string,
  messageId: string,
  userId?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const uid = userId || 'shared';
  try {
    const row = await db.getFirstAsync<{ data: string }>(
      `SELECT data FROM chat_messages_cache WHERE user_id = ? AND chat_room_id = ? AND message_id = ?`,
      [uid, chatRoomId, messageId],
    );
    const msg = parseData<RoomMessage>(row);
    if (!msg) return;
    await db.runAsync(
      `UPDATE chat_messages_cache SET data = ? WHERE user_id = ? AND chat_room_id = ? AND message_id = ?`,
      [JSON.stringify({ ...msg, isDeleted: true, body: null }), uid, chatRoomId, messageId],
    );
  } catch (e) {
    console.warn('[chat-cache] deleteCachedMessage error:', e);
  }
}

/** Remove a message only from this device; the server copy is unchanged. */
export async function removeCachedMessage(
  chatRoomId: string,
  messageId: string,
  userId?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.runAsync(
      `DELETE FROM chat_messages_cache WHERE user_id = ? AND chat_room_id = ? AND message_id = ?`,
      [userId || 'shared', chatRoomId, messageId],
    );
  } catch (e) {
    console.warn('[chat-cache] removeCachedMessage error:', e);
  }
}

/**
 * Remove ALL cached messages for a room from this device. Used by Clear Chat
 * and Delete Chat: the room container (chatRoomId + participants) survives on
 * the backend and in the chat list, only this user's message rows are dropped.
 */
export async function clearCachedMessages(chatRoomId: string, userId?: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.runAsync(
      `DELETE FROM chat_messages_cache WHERE user_id = ? AND chat_room_id = ?`,
      [userId || 'shared', chatRoomId],
    );
  } catch (e) {
    console.warn('[chat-cache] clearCachedMessages error:', e);
  }
}

/**
 * Persist a resolved `localUri` onto a cached message row so the local file
 * reference survives reloads without re-downloading. The reference is keyed by
 * the STABLE message id — a rotated remote/signed URL never invalidates it.
 */
export async function setCachedMessageLocalUri(
  chatRoomId: string,
  messageId: string,
  localUri: string | null,
  userId?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const uid = userId || 'shared';
  try {
    const row = await db.getFirstAsync<{ data: string }>(
      `SELECT data FROM chat_messages_cache WHERE user_id = ? AND chat_room_id = ? AND message_id = ?`,
      [uid, chatRoomId, messageId],
    );
    const msg = parseData<RoomMessage>(row);
    if (!msg) return;
    await db.runAsync(
      `UPDATE chat_messages_cache SET data = ? WHERE user_id = ? AND chat_room_id = ? AND message_id = ?`,
      [JSON.stringify({ ...msg, localUri }), uid, chatRoomId, messageId],
    );
  } catch (e) {
    console.warn('[chat-cache] setCachedMessageLocalUri error:', e);
  }
}

/**
 * Apply a partial update to one cached message row, identified by messageId.
 * Used to mirror server-confirmed edits and reaction changes so the local
 * replica stays in sync: server response → update cache → render. The message
 * is NOT recreated — its id is preserved.
 */
export async function updateCachedMessage(
  chatRoomId: string,
  messageId: string,
  patch: Partial<RoomMessage>,
  userId?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const uid = userId || 'shared';
  try {
    const row = await db.getFirstAsync<{ data: string }>(
      `SELECT data FROM chat_messages_cache WHERE user_id = ? AND chat_room_id = ? AND message_id = ?`,
      [uid, chatRoomId, messageId],
    );
    const msg = parseData<RoomMessage>(row);
    if (!msg) return;
    await db.runAsync(
      `UPDATE chat_messages_cache SET data = ? WHERE user_id = ? AND chat_room_id = ? AND message_id = ?`,
      [JSON.stringify({ ...msg, ...patch }), uid, chatRoomId, messageId],
    );
  } catch (e) {
    console.warn('[chat-cache] updateCachedMessage error:', e);
  }
}

/**
 * Remove a cached Chat Room from the local chat list (delete-chat). The
 * underlying chatRoomId stays alive on the backend and the other participant's
 * context is untouched — only this user's cached room metadata row is dropped.
 */
export async function removeCachedRoom(chatRoomId: string, userId?: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.runAsync(
      `DELETE FROM chat_rooms_cache WHERE user_id = ? AND chat_room_id = ?`,
      [userId || 'shared', chatRoomId],
    );
  } catch (e) {
    console.warn('[chat-cache] removeCachedRoom error:', e);
  }
}

// ─── Room context + contextAuth (per-user message membership) ────────────────

/**
 * Persist the requesting user's context (contextId + contextAuth membership)
 * for a room. One row per (chatRoomId, userId) — the other participant has a
 * separate row. The membership map is stored as JSON; the mobile app NEVER
 * invents or modifies the authoritative version — it only mirrors what the
 * server returned via getRoomContext.
 */
export async function cacheRoomContext(
  chatRoomId: string,
  userId: string,
  ctx: RoomContext,
): Promise<void> {
  const db = await getDb();
  if (!db || !chatRoomId || !userId) return;
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO chat_contexts_cache (user_id, chat_room_id, data) VALUES (?, ?, ?)`,
      [userId, chatRoomId, JSON.stringify(ctx)],
    );
  } catch (e) {
    console.warn('[chat-cache] cacheRoomContext error:', e);
  }
}

/**
 * Read the requesting user's cached context for a room. Returns null if no
 * context has been synced yet (e.g. backend has not shipped /context).
 */
export async function getCachedRoomContext(
  chatRoomId: string,
  userId: string,
): Promise<RoomContext | null> {
  const db = await getDb();
  if (!db || !chatRoomId || !userId) return null;
  try {
    const row = await db.getFirstAsync<{ data: string }>(
      `SELECT data FROM chat_contexts_cache WHERE user_id = ? AND chat_room_id = ?`,
      [userId, chatRoomId],
    );
    return parseData<RoomContext>(row);
  } catch (e) {
    console.warn('[chat-cache] getCachedRoomContext error:', e);
    return null;
  }
}

/**
 * Apply server-directed membership removals to the local replica.
 *
 * For each id in `removedMessageIds`: delete the matching message row AND its
 * local media file, and drop it from the cached contextAuth membership set.
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

  // 1) Remove the message rows (and their local media) from the local replica.
  for (const messageId of removedMessageIds) {
    await removeCachedMessage(chatRoomId, messageId, userId);
    // No orphaned media: the local file for a server-removed message is
    // deleted so the device never accumulates files the user can no longer see.
    await deleteRoomMedia(chatRoomId, messageId).catch(() => {});
  }

  // 2) Drop them from the cached membership set so the local contextAuth
  //    mirrors the server's current view.
  const db = await getDb();
  if (!db) return;
  try {
    const row = await db.getFirstAsync<{ data: string }>(
      `SELECT data FROM chat_contexts_cache WHERE user_id = ? AND chat_room_id = ?`,
      [userId, chatRoomId],
    );
    const ctx = parseData<RoomContext>(row);
    if (!ctx) return;
    if (Array.isArray(ctx.contextAuth.messageIds)) {
      const remove = new Set(removedMessageIds);
      ctx.contextAuth.messageIds = ctx.contextAuth.messageIds.filter((id) => !remove.has(id));
      await db.runAsync(
        `UPDATE chat_contexts_cache SET data = ? WHERE user_id = ? AND chat_room_id = ?`,
        [JSON.stringify(ctx), userId, chatRoomId],
      );
    }
  } catch (e) {
    console.warn('[chat-cache] applyContextAuthRemovals error:', e);
  }
}

/**
 * Empty the requesting user's context membership for a room (clear-for-one
 * foundation). The ROOM still exists and the other participant is untouched;
 * only this user's local contextAuth becomes empty and local message rows +
 * media are dropped. NOT wired to any UI action yet — foundation only.
 */
export async function clearCachedRoomContext(
  chatRoomId: string,
  userId: string,
): Promise<void> {
  const db = await getDb();
  if (!db || !chatRoomId || !userId) return;

  try {
    await db.runAsync(
      `DELETE FROM chat_messages_cache WHERE user_id = ? AND chat_room_id = ?`,
      [userId, chatRoomId],
    );
  } catch (e) {
    console.warn('[chat-cache] clearCachedRoomContext messages error:', e);
  }

  try {
    const row = await db.getFirstAsync<{ data: string }>(
      `SELECT data FROM chat_contexts_cache WHERE user_id = ? AND chat_room_id = ?`,
      [userId, chatRoomId],
    );
    const ctx = parseData<RoomContext>(row);
    if (ctx) {
      ctx.contextAuth = { messageIds: [], marker: null };
      await db.runAsync(
        `UPDATE chat_contexts_cache SET data = ? WHERE user_id = ? AND chat_room_id = ?`,
        [JSON.stringify(ctx), userId, chatRoomId],
      );
    }
  } catch (e) {
    console.warn('[chat-cache] clearCachedRoomContext context error:', e);
  }
}

// ─── Auth cache ───────────────────────────────────────────────────────────────

export async function cacheAuthValue(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO chat_auth_cache (key, value) VALUES (?, ?)`,
      [key, value],
    );
  } catch (e) {
    console.warn('[chat-cache] cacheAuthValue error:', e);
  }
}

export async function getAuthValue(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM chat_auth_cache WHERE key = ?`,
      [key],
    );
    return row?.value ?? null;
  } catch (e) {
    console.warn('[chat-cache] getAuthValue error:', e);
    return null;
  }
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export async function saveDraft(chatRoomId: string, text: string, userId?: string | null): Promise<void> {
  const db = await getDb();
  if (!db || !chatRoomId) return;
  const uid = userId || 'shared';
  try {
    if (text.trim()) {
      await db.runAsync(
        `INSERT OR REPLACE INTO chat_drafts_cache (user_id, chat_room_id, text) VALUES (?, ?, ?)`,
        [uid, chatRoomId, text],
      );
    } else {
      await db.runAsync(
        `DELETE FROM chat_drafts_cache WHERE user_id = ? AND chat_room_id = ?`,
        [uid, chatRoomId],
      );
    }
  } catch (e) {
    console.warn('[chat-cache] saveDraft error:', e);
  }
}

export async function getDraft(chatRoomId: string, userId?: string | null): Promise<string> {
  const db = await getDb();
  if (!db || !chatRoomId) return '';
  try {
    const row = await db.getFirstAsync<{ text: string }>(
      `SELECT text FROM chat_drafts_cache WHERE user_id = ? AND chat_room_id = ?`,
      [userId || 'shared', chatRoomId],
    );
    return row?.text ?? '';
  } catch (e) {
    console.warn('[chat-cache] getDraft error:', e);
    return '';
  }
}
