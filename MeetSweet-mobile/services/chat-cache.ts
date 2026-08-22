/**
 * Chat FileSystem cache — instant loading, offline browsing.
 *
 * Local chat content is stored as JSON files under Expo FileSystem's
 * PERSISTENT document directory (Paths.document — safe from system eviction,
 * unlike Paths.cache):
 *
 *   <document>/chat-cache/
 *     auth.json                  — auth key/value cache (shared)
 *     <userId>/rooms.json        — chat room list for that account
 *     <userId>/messages/<roomId>.json — messages (newest first) per room
 *     <userId>/contexts/<roomId>.json — contextId + contextAuth per (room,user)
 *     <userId>/drafts.json       — per-room draft text
 *
 * Everything is namespaced by userId so a different account can NEVER render
 * the previous user's private conversations from the local cache. On
 * logout/account switch, clearChatCache() deletes the whole tree.
 *
 * The server remains the source of truth: the cache is only the instant
 * presentation layer that is reconciled in the background.
 */

import { Platform } from 'react-native';
import type { File as FSFile, Directory as FSDirectory } from 'expo-file-system';
import type { ChatRoom, RoomMessage, RoomContext, ContextAuth } from './room-service';
import { deleteRoomMedia } from './chat-media';

// ─── FileSystem helpers (current Expo SDK API) ───────────────────────────────

type FsModule = typeof import('expo-file-system');

let _fs: FsModule | null | undefined;

async function fs(): Promise<FsModule | null> {
  if (Platform.OS === 'web') return null;
  if (_fs === undefined) {
    try {
      _fs = await import('expo-file-system');
    } catch (e) {
      console.warn('[chat-cache] expo-file-system unavailable:', e);
      _fs = null;
    }
  }
  return _fs;
}

const CACHE_DIR_NAME = 'chat-cache';

/** Replace path separators so a malicious id can't escape its directory. */
function sanitize(id: string): string {
  return (id ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function rootDir(fs: FsModule): FSDirectory {
  return new fs.Directory(fs.Paths.document, CACHE_DIR_NAME);
}

function userDir(fs: FsModule, userId?: string | null): FSDirectory {
  return new fs.Directory(rootDir(fs), sanitize(userId || 'shared'));
}

function ensureDir(dir: { exists: boolean; create: (o?: { intermediates?: boolean; idempotent?: boolean }) => void }): void {
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  } catch (e) {
    console.warn('[chat-cache] ensureDir failed:', e);
  }
}

function readJson<T>(file: { exists: boolean; textSync: () => string }): T | null {
  try {
    if (!file.exists) return null;
    const raw = file.textSync();
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn('[chat-cache] readJson failed:', e);
    return null;
  }
}

function writeJson(file: { exists: boolean; create: (o?: { intermediates?: boolean; overwrite?: boolean }) => void; write: (s: string) => void }, data: unknown): void {
  try {
    if (!file.exists) file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify(data));
  } catch (e) {
    console.warn('[chat-cache] writeJson failed:', e);
  }
}

function messagesFile(fs: FsModule, userId: string | undefined | null, chatRoomId: string) {
  return new fs.File(userDir(fs, userId), 'messages', `${sanitize(chatRoomId)}.json`);
}

function contextsFile(fs: FsModule, userId: string, chatRoomId: string) {
  return new fs.File(userDir(fs, userId), 'contexts', `${sanitize(chatRoomId)}.json`);
}

function roomsFile(fs: FsModule, userId?: string | null) {
  return new fs.File(userDir(fs, userId), 'rooms.json');
}

function draftsFile(fs: FsModule, userId?: string | null) {
  return new fs.File(userDir(fs, userId), 'drafts.json');
}

function authFile(fs: FsModule) {
  return new fs.File(rootDir(fs), 'auth.json');
}

function byNewestFirst(a: RoomMessage, b: RoomMessage): number {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  return tb - ta;
}

// ─── Chat Rooms ───────────────────────────────────────────────────────────────

export async function cacheChatRooms(chatRooms: ChatRoom[], userId?: string | null): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  const file = roomsFile(mod, userId);
  const existing = readJson<ChatRoom[]>(file) ?? [];
  const merged = [...existing, ...chatRooms].filter(
    (r, i, arr) => arr.findIndex((x) => x.chatRoomId === r.chatRoomId) === i,
  );
  merged.sort((a, b) => {
    const ta = new Date(a.lastMessageAt ?? a.createdAt).getTime();
    const tb = new Date(b.lastMessageAt ?? b.createdAt).getTime();
    return tb - ta;
  });
  writeJson(file, merged.slice(0, 200));
}

export async function getCachedChatRooms(userId?: string | null): Promise<ChatRoom[]> {
  const mod = await fs();
  if (!mod) return [];
  const file = roomsFile(mod, userId);
  const rooms = readJson<ChatRoom[]>(file) ?? [];
  rooms.sort((a, b) => {
    const ta = new Date(a.lastMessageAt ?? a.createdAt).getTime();
    const tb = new Date(b.lastMessageAt ?? b.createdAt).getTime();
    return tb - ta;
  });
  return rooms.slice(0, 200);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * Clear ALL locally-cached chat data (room lists, messages, contexts, drafts,
 * auth) for every account. Called on logout/account switch so a different
 * account can never see the previous user's private conversations from the
 * local cache.
 */
export async function clearChatCache(): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  try {
    const root = rootDir(mod);
    if (root.exists) root.delete();
  } catch (e) {
    console.warn('[chat-cache] clearChatCache error:', e);
  }
}

export async function cacheMessages(
  chatRoomId: string,
  messages: RoomMessage[],
  userId?: string | null,
): Promise<void> {
  const mod = await fs();
  if (!mod || !chatRoomId) return;
  const file = messagesFile(mod, userId, chatRoomId);
  const existing = readJson<RoomMessage[]>(file) ?? [];
  const merged = [...existing, ...messages].filter(
    (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
  );
  merged.sort(byNewestFirst);
  writeJson(file, merged.slice(0, 300));
}

export async function getCachedMessages(chatRoomId: string, userId?: string | null): Promise<RoomMessage[]> {
  const mod = await fs();
  if (!mod || !chatRoomId) return [];
  const file = messagesFile(mod, userId, chatRoomId);
  const msgs = readJson<RoomMessage[]>(file) ?? [];
  msgs.sort(byNewestFirst);
  return msgs.slice(0, 300);
}

export async function deleteCachedMessage(
  chatRoomId: string,
  messageId: string,
  userId?: string | null,
): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  const file = messagesFile(mod, userId, chatRoomId);
  const msgs = readJson<RoomMessage[]>(file);
  if (!msgs) return;
  const next = msgs.map((msg) =>
    msg.id === messageId ? { ...msg, isDeleted: true, body: null } : msg,
  );
  writeJson(file, next);
}

/** Remove a message only from this device; the server copy is unchanged. */
export async function removeCachedMessage(
  chatRoomId: string,
  messageId: string,
  userId?: string | null,
): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  const file = messagesFile(mod, userId, chatRoomId);
  const msgs = readJson<RoomMessage[]>(file);
  if (!msgs) return;
  writeJson(file, msgs.filter((message) => message.id !== messageId));
}

/**
 * Remove ALL cached messages for a room from this device. Used by Clear Chat
 * and Delete Chat: the room container (chatRoomId + participants) survives on
 * the backend and in the chat list, only this user's message rows are dropped.
 */
export async function clearCachedMessages(chatRoomId: string, userId?: string | null): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  const file = messagesFile(mod, userId, chatRoomId);
  try {
    if (file.exists) file.delete();
  } catch (e) {
    console.warn('[chat-cache] clearCachedMessages error:', e);
  }
}

/**
 * Persist a resolved `localUri` onto a cached message row so the local file
 * reference survives reloads without re-downloading.
 */
export async function setCachedMessageLocalUri(
  chatRoomId: string,
  messageId: string,
  localUri: string | null,
  userId?: string | null,
): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  const file = messagesFile(mod, userId, chatRoomId);
  const msgs = readJson<RoomMessage[]>(file);
  if (!msgs) return;
  const next = msgs.map((m) => (m.id === messageId ? { ...m, localUri } : m));
  writeJson(file, next);
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
  const mod = await fs();
  if (!mod) return;
  const file = messagesFile(mod, userId, chatRoomId);
  const msgs = readJson<RoomMessage[]>(file);
  if (!msgs) return;
  const next = msgs.map((m) => (m.id === messageId ? { ...m, ...patch } : m));
  writeJson(file, next);
}

/**
 * Remove a cached Chat Room from the local chat list (delete-chat). The
 * underlying chatRoomId stays alive on the backend and the other participant's
 * context is untouched — only this user's cached room metadata row is dropped.
 */
export async function removeCachedRoom(chatRoomId: string, userId?: string | null): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  const file = roomsFile(mod, userId);
  const rooms = readJson<ChatRoom[]>(file);
  if (!rooms) return;
  writeJson(file, rooms.filter((r) => r.chatRoomId !== chatRoomId));
}

// ─── Room context + contextAuth (per-user message membership) ────────────────

/**
 * Persist the requesting user's context (contextId + contextAuth membership)
 * for a room. One file per (chatRoomId, userId) — the other participant has a
 * separate file. The membership map is stored as JSON; the mobile app NEVER
 * invents or modifies the authoritative version — it only mirrors what the
 * server returned via getRoomContext.
 */
export async function cacheRoomContext(
  chatRoomId: string,
  userId: string,
  ctx: RoomContext,
): Promise<void> {
  const mod = await fs();
  if (!mod || !chatRoomId || !userId) return;
  const file = contextsFile(mod, userId, chatRoomId);
  writeJson(file, ctx);
}

/**
 * Read the requesting user's cached context for a room. Returns null if no
 * context has been synced yet (e.g. backend has not shipped /context).
 */
export async function getCachedRoomContext(
  chatRoomId: string,
  userId: string,
): Promise<RoomContext | null> {
  const mod = await fs();
  if (!mod || !chatRoomId || !userId) return null;
  const file = contextsFile(mod, userId, chatRoomId);
  return readJson<RoomContext>(file);
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
    // deleted so the device never accumulates files the user can no longer
    // see.
    await deleteRoomMedia(chatRoomId, messageId).catch(() => {});
  }

  // 2) Drop them from the cached membership set so the local contextAuth
  //    mirrors the server's current view.
  const mod = await fs();
  if (!mod) return;
  const file = contextsFile(mod, userId, chatRoomId);
  const ctx = readJson<RoomContext>(file);
  if (!ctx) return;
  if (Array.isArray(ctx.contextAuth.messageIds)) {
    const remove = new Set(removedMessageIds);
    ctx.contextAuth.messageIds = ctx.contextAuth.messageIds.filter((id) => !remove.has(id));
    writeJson(file, ctx);
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
  const mod = await fs();
  if (!mod || !chatRoomId || !userId) return;

  const msgFile = messagesFile(mod, userId, chatRoomId);
  try {
    if (msgFile.exists) msgFile.delete();
  } catch (e) {
    console.warn('[chat-cache] clearCachedRoomContext messages error:', e);
  }

  const file = contextsFile(mod, userId, chatRoomId);
  const ctx = readJson<RoomContext>(file);
  if (ctx) {
    ctx.contextAuth = { messageIds: [], marker: null };
    writeJson(file, ctx);
  }
}

// ─── Auth cache ───────────────────────────────────────────────────────────────

export async function cacheAuthValue(key: string, value: string): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  const file = authFile(mod);
  const map = readJson<Record<string, string>>(file) ?? {};
  map[key] = value;
  writeJson(file, map);
}

export async function getAuthValue(key: string): Promise<string | null> {
  const mod = await fs();
  if (!mod) return null;
  const file = authFile(mod);
  const map = readJson<Record<string, string>>(file);
  return map?.[key] ?? null;
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export async function saveDraft(chatRoomId: string, text: string, userId?: string | null): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  const file = draftsFile(mod, userId);
  const map = readJson<Record<string, string>>(file) ?? {};
  if (text.trim()) {
    map[chatRoomId] = text;
  } else {
    delete map[chatRoomId];
  }
  writeJson(file, map);
}

export async function getDraft(chatRoomId: string, userId?: string | null): Promise<string> {
  const mod = await fs();
  if (!mod) return '';
  const file = draftsFile(mod, userId);
  const map = readJson<Record<string, string>>(file);
  return map?.[chatRoomId] ?? '';
}
