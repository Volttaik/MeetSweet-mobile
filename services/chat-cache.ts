/**
 * Chat SQLite cache — instant loading, offline browsing.
 * On web (where SQLite isn't available), falls back to AsyncStorage.
 *
 * Room-based: everything is keyed by chatRoomId. The cache stores ChatRoom
 * metadata rows and room messages.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatRoom, RoomMessage } from './room-service';

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
    `);
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
            'INSERT OR REPLACE INTO messages (id, chat_room_id, data, created_at) VALUES (?, ?, ?, ?)',
            [m.id, chatRoomId, JSON.stringify(m), new Date(m.createdAt).getTime()],
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
      const rows = await sqliteDb.getAllAsync<{ data: string }>(
        'SELECT data FROM messages WHERE chat_room_id = ? ORDER BY created_at ASC LIMIT 200',
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

export async function deleteCachedMessage(messageId: string): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      // Mark as deleted instead of removing
      const row = await sqliteDb.getFirstAsync<{ data: string }>(
        'SELECT data FROM messages WHERE id = ?',
        [messageId],
      );
      if (row) {
        const msg = JSON.parse(row.data) as RoomMessage;
        msg.isDeleted = true;
        msg.body = null;
        await sqliteDb.runAsync('UPDATE messages SET data = ? WHERE id = ?', [
          JSON.stringify(msg),
          messageId,
        ]);
      }
    } catch (e) {
      console.warn('[chat-cache] deleteCachedMessage error:', e);
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

// ─── Legacy cache migration (from conversation keys to room keys) ─────────────
// Reads old conversation-cache rows (if any) so previously cached chats are not
// lost immediately after the migration. Safe to delete once the old cache is
// empty in the wild.

export async function migrateLegacyConversationCache(): Promise<void> {
  try {
    const sqliteDb = await getDb();
    if (sqliteDb) {
      // SQLite: old tables were `conversations` and `messages(conversation_id)`.
      await sqliteDb.execAsync(`
        INSERT OR IGNORE INTO chat_rooms (id, data, updated_at)
          SELECT id, data, updated_at FROM conversations;
      `).catch(() => {});
      // Rename the old column if it still exists (fresh DBs already use chat_room_id).
      await sqliteDb.execAsync(
        'ALTER TABLE messages RENAME COLUMN conversation_id TO chat_room_id;',
      ).catch(() => {});
    } else {
      const raw = await AsyncStorage.getItem('@ms_conversations');
      if (raw) {
        await AsyncStorage.setItem('@ms_chat_rooms', raw);
        await AsyncStorage.removeItem('@ms_conversations');
      }
    }
  } catch {
    // Migration is best-effort
  }
}