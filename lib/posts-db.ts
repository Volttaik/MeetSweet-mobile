/**
 * posts-db.ts — SQLite cache for posts, users, and offline action queue.
 *
 * Security: ALL cache rows are scoped to the authenticated userId via the
 * feed_key prefix (format: `{userId}_{feedName}`). Calling clearUserCache()
 * on logout purges every row belonging to that user.
 *
 * Schema notes:
 *   • posts: composite PK (feed_key, id) — same post can live under multiple
 *     feed views without key collision.
 *   • users_cache: scoped by userId prefix in id column.
 *   • offline_queue: scoped by user_id column.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Post } from '@/services/posts';
import type { Conversation } from '@/services/messages';
import type { User } from '@/contexts/AuthContext';

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _db: import('expo-sqlite').SQLiteDatabase | null = null;

async function getDb() {
  if (Platform.OS === 'web') return null;
  if (_db) return _db;
  try {
    const SQLite = await import('expo-sqlite');
    _db = await SQLite.openDatabaseAsync('meetsweet_posts.db');
    await _db.execAsync(`
      PRAGMA journal_mode = WAL;

      -- Composite primary key prevents same post from overwriting another feed view.
      -- feed_key format: "{userId}_{feedName}"
      CREATE TABLE IF NOT EXISTS posts (
        feed_key   TEXT NOT NULL,
        id         TEXT NOT NULL,
        data       TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        cached_at  INTEGER NOT NULL,
        PRIMARY KEY (feed_key, id)
      );
      CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts (feed_key, created_at DESC);

      -- id column stores "{userId}_{resourceId}" to scope per user.
      CREATE TABLE IF NOT EXISTS users_cache (
        id        TEXT PRIMARY KEY,
        data      TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cache_metadata (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      -- user_id column scopes each queued action to its owner.
      CREATE TABLE IF NOT EXISTS offline_queue (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        action     TEXT NOT NULL,
        payload    TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        status     TEXT NOT NULL DEFAULT 'pending'
      );
    `);
    return _db;
  } catch (e) {
    console.warn('[posts-db] SQLite init failed:', e);
    return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_TTL_MS  = 24 * 60 * 60 * 1000; // 24 h
const MAX_CACHED_POSTS = 50;

// ─── Key helpers ──────────────────────────────────────────────────────────────

/** Build a user-scoped feed key: "{userId}_{feedName}" */
function feedKey(userId: string, feedName: string): string {
  return `${userId}_${feedName}`;
}

/** Prefix for per-user metadata keys */
function metaKey(userId: string, key: string): string {
  return `${userId}:${key}`;
}

// ─── Posts ───────────────────────────────────────────────────────────────────

/**
 * Cache posts under a user-scoped feed view.
 * feedName: 'feed' | 'explore' | 'shorts' | 'profile'
 */
export async function cachePosts(
  posts: Post[],
  feedName: string,
  userId: string,
): Promise<void> {
  const fk  = feedKey(userId, feedName);
  const now = Date.now();
  const db  = await getDb();

  if (db) {
    try {
      await db.withTransactionAsync(async () => {
        for (const post of posts) {
          await db.runAsync(
            `INSERT OR REPLACE INTO posts (feed_key, id, data, created_at, cached_at)
             VALUES (?, ?, ?, ?, ?)`,
            [fk, post.id, JSON.stringify(post), new Date(post.createdAt).getTime(), now],
          );
        }
        // Trim to MAX_CACHED_POSTS per feed view
        await db.runAsync(
          `DELETE FROM posts WHERE feed_key = ? AND id NOT IN (
             SELECT id FROM posts WHERE feed_key = ? ORDER BY created_at DESC LIMIT ?
           )`,
          [fk, fk, MAX_CACHED_POSTS],
        );
      });
    } catch (e) {
      console.warn('[posts-db] cachePosts error:', e);
    }
  } else {
    const key = `@ms_posts_${fk}`;
    const existing = await safeGetJson<Post[]>(key, []);
    const merged = mergeById([...posts, ...existing]).slice(0, MAX_CACHED_POSTS);
    await AsyncStorage.setItem(key, JSON.stringify(merged));
  }
}

export async function getCachedPosts(
  feedName: string,
  userId: string,
  limit = 20,
): Promise<Post[]> {
  const fk = feedKey(userId, feedName);
  const db = await getDb();

  if (db) {
    try {
      const rows = await db.getAllAsync<{ data: string }>(
        `SELECT data FROM posts WHERE feed_key = ? ORDER BY created_at DESC LIMIT ?`,
        [fk, limit],
      );
      return rows.map((r) => JSON.parse(r.data) as Post);
    } catch {
      return [];
    }
  } else {
    const raw = await AsyncStorage.getItem(`@ms_posts_${fk}`);
    const posts: Post[] = raw ? JSON.parse(raw) : [];
    return posts.slice(0, limit);
  }
}

/** Optimistic like/bookmark patch — works across all feed views for this post */
export async function updateCachedPost(
  postId: string,
  userId: string,
  delta: Partial<Pick<Post, 'likeCount' | 'likedByMe' | 'bookmarkCount' | 'bookmarkedByMe'>>,
): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      // Update the post in every feed_key that belongs to this user
      const rows = await db.getAllAsync<{ feed_key: string; data: string }>(
        `SELECT feed_key, data FROM posts WHERE id = ? AND feed_key LIKE ?`,
        [postId, `${userId}_%`],
      );
      for (const row of rows) {
        const post: Post = { ...JSON.parse(row.data), ...delta };
        await db.runAsync(
          'UPDATE posts SET data = ? WHERE feed_key = ? AND id = ?',
          [JSON.stringify(post), row.feed_key, postId],
        );
      }
    } catch (e) {
      console.warn('[posts-db] updateCachedPost error:', e);
    }
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────

/** Cache a user profile. Key is scoped: "{viewerId}_{profileUserId}" */
export async function cacheUser(
  profileUser: User,
  viewerUserId: string,
): Promise<void> {
  const scopedId = `${viewerUserId}_${profileUser.id}`;
  const db = await getDb();
  if (db) {
    try {
      await db.runAsync(
        'INSERT OR REPLACE INTO users_cache (id, data, cached_at) VALUES (?, ?, ?)',
        [scopedId, JSON.stringify(profileUser), Date.now()],
      );
    } catch {}
  } else {
    await AsyncStorage.setItem(
      `@ms_user_${scopedId}`,
      JSON.stringify({ user: profileUser, cachedAt: Date.now() }),
    );
  }
}

export async function getCachedUser(
  profileUserId: string,
  viewerUserId: string,
): Promise<User | null> {
  const scopedId = `${viewerUserId}_${profileUserId}`;
  const db = await getDb();
  if (db) {
    try {
      const row = await db.getFirstAsync<{ data: string; cached_at: number }>(
        'SELECT data, cached_at FROM users_cache WHERE id = ?',
        [scopedId],
      );
      if (!row || Date.now() - row.cached_at > USER_TTL_MS) return null;
      return JSON.parse(row.data) as User;
    } catch {
      return null;
    }
  } else {
    const raw = await AsyncStorage.getItem(`@ms_user_${scopedId}`);
    if (!raw) return null;
    const { user, cachedAt } = JSON.parse(raw) as { user: User; cachedAt: number };
    if (Date.now() - cachedAt > USER_TTL_MS) return null;
    return user;
  }
}

// ─── Conversations cache (for messages list) ──────────────────────────────────

const CONV_LIST_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function cacheConversationsList(
  userId: string,
  convos: Conversation[],
): Promise<void> {
  const db  = await getDb();
  const now = Date.now();
  if (db) {
    try {
      await db.withTransactionAsync(async () => {
        for (const c of convos) {
          await db.runAsync(
            `INSERT OR REPLACE INTO cache_metadata (key, value, expires_at) VALUES (?, ?, ?)`,
            [metaKey(userId, `conv_${c.id}`), JSON.stringify(c), now + 7 * 24 * 60 * 60 * 1000],
          );
        }
        await db.runAsync(
          `INSERT OR REPLACE INTO cache_metadata (key, value, expires_at) VALUES (?, ?, ?)`,
          [metaKey(userId, 'conv_list'), JSON.stringify(convos.map((c) => c.id)), now + CONV_LIST_TTL_MS],
        );
      });
    } catch {}
  } else {
    await AsyncStorage.setItem(`@ms_conversations_${userId}`, JSON.stringify(convos));
  }
}

export async function getCachedConversationsList(userId: string): Promise<Conversation[]> {
  const db = await getDb();
  if (db) {
    try {
      const indexRow = await db.getFirstAsync<{ value: string; expires_at: number }>(
        'SELECT value, expires_at FROM cache_metadata WHERE key = ?',
        [metaKey(userId, 'conv_list')],
      );
      if (!indexRow || Date.now() > indexRow.expires_at) return [];
      const ids: string[] = JSON.parse(indexRow.value);
      const convos: Conversation[] = [];
      for (const id of ids) {
        const row = await db.getFirstAsync<{ value: string }>(
          'SELECT value FROM cache_metadata WHERE key = ?',
          [metaKey(userId, `conv_${id}`)],
        );
        if (row) convos.push(JSON.parse(row.value) as Conversation);
      }
      return convos;
    } catch {
      return [];
    }
  } else {
    const raw = await AsyncStorage.getItem(`@ms_conversations_${userId}`);
    return raw ? JSON.parse(raw) : [];
  }
}

// ─── Offline queue ────────────────────────────────────────────────────────────

export type OfflineAction =
  | { type: 'like_post';    postId: string; liked: boolean }
  | { type: 'save_post';    postId: string; saved: boolean }
  | { type: 'send_message'; conversationId: string; text: string; tempId: string }
  | { type: 'follow_user';  username: string; follow: boolean };

export async function enqueueOfflineAction(
  action: OfflineAction,
  userId: string,
): Promise<void> {
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const db = await getDb();
  if (db) {
    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO offline_queue (id, user_id, action, payload, created_at, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [id, userId, action.type, JSON.stringify(action), Date.now()],
      );
    } catch {}
  } else {
    const key = `@ms_offline_queue_${userId}`;
    const raw = await AsyncStorage.getItem(key);
    const queue: Array<{ id: string; action: OfflineAction }> = raw ? JSON.parse(raw) : [];
    queue.push({ id, action });
    await AsyncStorage.setItem(key, JSON.stringify(queue));
  }
}

export async function getPendingOfflineActions(
  userId: string,
): Promise<Array<{ id: string; action: OfflineAction }>> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.getAllAsync<{ id: string; payload: string }>(
        `SELECT id, payload FROM offline_queue WHERE user_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 50`,
        [userId],
      );
      return rows.map((r) => ({ id: r.id, action: JSON.parse(r.payload) as OfflineAction }));
    } catch {
      return [];
    }
  } else {
    const raw = await AsyncStorage.getItem(`@ms_offline_queue_${userId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  }
}

export async function completeOfflineAction(id: string, userId: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync(`DELETE FROM offline_queue WHERE id = ? AND user_id = ?`, [id, userId]).catch(() => {});
  } else {
    const key = `@ms_offline_queue_${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const queue: Array<{ id: string }> = JSON.parse(raw);
    await AsyncStorage.setItem(key, JSON.stringify(queue.filter((q) => q.id !== id)));
  }
}

// ─── Clear all data for a user (call on logout) ───────────────────────────────

export async function clearUserCache(userId: string): Promise<void> {
  if (!userId) return;
  const db = await getDb();
  if (db) {
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync(`DELETE FROM posts WHERE feed_key LIKE ?`, [`${userId}_%`]);
        await db.runAsync(`DELETE FROM users_cache WHERE id LIKE ?`, [`${userId}_%`]);
        await db.runAsync(`DELETE FROM cache_metadata WHERE key LIKE ?`, [`${userId}:%`]);
        await db.runAsync(`DELETE FROM offline_queue WHERE user_id = ?`, [userId]);
      });
    } catch (e) {
      console.warn('[posts-db] clearUserCache error:', e);
    }
  } else {
    // Web: remove AsyncStorage keys by pattern isn't possible; remove known keys
    const keysToRemove = await AsyncStorage.getAllKeys();
    const userKeys = keysToRemove.filter(
      (k) =>
        k.startsWith(`@ms_posts_${userId}_`) ||
        k.startsWith(`@ms_user_${userId}_`) ||
        k === `@ms_conversations_${userId}` ||
        k === `@ms_offline_queue_${userId}`,
    );
    if (userKeys.length > 0) await AsyncStorage.multiRemove(userKeys);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function safeGetJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function mergeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}
