/**
 * Chat SQLite cache — instant loading, offline browsing.
 * On web (where SQLite isn't available), falls back to AsyncStorage.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Conversation, ChatMessage } from './messages';

// ─── SQLite (native only) ──────────────────────────────────────────────────────

let db: import('expo-sqlite').SQLiteDatabase | null = null;

async function getDb() {
  if (Platform.OS === 'web') return null;
  if (db) return db;
  try {
    const SQLite = await import('expo-sqlite');
    db = await SQLite.openDatabaseAsync('meetsweet_chat.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS auth_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS drafts (
        conversation_id TEXT PRIMARY KEY,
        text TEXT NOT NULL
      );
    `);
    return db;
  } catch (e) {
    console.warn('[chat-cache] SQLite init failed:', e);
    return null;
  }
}

// ─── Conversations ─────────────────────────────────────────────────────────────

export async function cacheConversations(conversations: Conversation[]): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.withTransactionAsync(async () => {
        for (const c of conversations) {
          await sqliteDb.runAsync(
            'INSERT OR REPLACE INTO conversations (id, data, updated_at) VALUES (?, ?, ?)',
            [c.id, JSON.stringify(c), Date.now()],
          );
        }
      });
    } catch (e) {
      console.warn('[chat-cache] cacheConversations error:', e);
    }
  } else {
    // AsyncStorage fallback
    await AsyncStorage.setItem('@ms_conversations', JSON.stringify(conversations));
  }
}

export async function getCachedConversations(): Promise<Conversation[]> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const rows = await sqliteDb.getAllAsync<{ data: string }>(
        'SELECT data FROM conversations ORDER BY updated_at DESC LIMIT 200',
      );
      return rows.map((r) => JSON.parse(r.data) as Conversation);
    } catch {
      return [];
    }
  } else {
    const raw = await AsyncStorage.getItem('@ms_conversations');
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function cacheMessages(
  conversationId: string,
  messages: ChatMessage[],
): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      await sqliteDb.withTransactionAsync(async () => {
        for (const m of messages) {
          await sqliteDb.runAsync(
            'INSERT OR REPLACE INTO messages (id, conversation_id, data, created_at) VALUES (?, ?, ?, ?)',
            [m.id, conversationId, JSON.stringify(m), new Date(m.createdAt).getTime()],
          );
        }
      });
    } catch (e) {
      console.warn('[chat-cache] cacheMessages error:', e);
    }
  } else {
    const key = `@ms_messages_${conversationId}`;
    const existing = await AsyncStorage.getItem(key);
    const old: ChatMessage[] = existing ? JSON.parse(existing) : [];
    const merged = [...old, ...messages].filter(
      (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
    );
    await AsyncStorage.setItem(key, JSON.stringify(merged.slice(-300)));
  }
}

export async function getCachedMessages(conversationId: string): Promise<ChatMessage[]> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const rows = await sqliteDb.getAllAsync<{ data: string }>(
        'SELECT data FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 200',
        [conversationId],
      );
      return rows.map((r) => JSON.parse(r.data) as ChatMessage);
    } catch {
      return [];
    }
  } else {
    const raw = await AsyncStorage.getItem(`@ms_messages_${conversationId}`);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
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
        const msg = JSON.parse(row.data) as ChatMessage;
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

// ─── Auth cache ────────────────────────────────────────────────────────────────

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

export async function saveDraft(conversationId: string, text: string): Promise<void> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      if (text.trim()) {
        await sqliteDb.runAsync(
          'INSERT OR REPLACE INTO drafts (conversation_id, text) VALUES (?, ?)',
          [conversationId, text],
        );
      } else {
        await sqliteDb.runAsync('DELETE FROM drafts WHERE conversation_id = ?', [conversationId]);
      }
    } catch {}
  }
}

export async function getDraft(conversationId: string): Promise<string> {
  const sqliteDb = await getDb();
  if (sqliteDb) {
    try {
      const row = await sqliteDb.getFirstAsync<{ text: string }>(
        'SELECT text FROM drafts WHERE conversation_id = ?',
        [conversationId],
      );
      return row?.text ?? '';
    } catch {
      return '';
    }
  }
  return '';
}
