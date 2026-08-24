/**
 * Chat Restore — EXPLICIT "Load Chat History".
 *
 * Local-first chat architecture: opening a conversation NEVER fetches the
 * user's historical chat database from the backend. Normal chat access reads
 * the local persistent store (SQLite + FileSystem) and renders instantly;
 * the backend is used only for incremental synchronization (new/changed
 * messages, metadata) once local history exists.
 *
 * The ONE exception is this module: an explicit user action ("Load Chat
 * History" in the Chat menu) that restores previous conversations from the
 * backend and persists them locally. This operation is allowed to take time
 * and reports progress through the callback.
 *
 * Restoration is additive and idempotent: messages are upserted by their
 * stable server message id (INSERT OR REPLACE), so re-running it never
 * duplicates anything, and it can safely run over an existing local cache.
 *
 * Media files are NOT bulk-downloaded here — that could be gigabytes. They
 * are downloaded on demand (and persisted to the document directory) the
 * first time each restored conversation is opened, keyed by stable message
 * id so they are never re-downloaded afterwards.
 */

import { fetchRoomHistory, getChatRoomList } from './room-service';
import { cacheChatRooms, cacheMessages } from './chat-cache';

export interface RestoreProgress {
  /** Number of conversations fully restored so far. */
  done: number;
  /** Total conversations found on the backend. */
  total: number;
  /** Display name of the conversation currently being restored. */
  roomName?: string;
}

/** The server returns one page of messages at a time (SweetSocket limit). */
const PAGE_SIZE = 30;
/** Safety cap: never fetch more than this many pages per conversation. */
const MAX_PAGES_PER_ROOM = 100;

export interface RestoreResult {
  rooms: number;
  messages: number;
}

/**
 * Restore previous conversations from the backend into the local store.
 *
 * - Fetches the conversation (room) list.
 * - For each conversation, requests full message history through SweetSocket
 *   (paginated backwards) and persists it to SQLite.
 * - Persists the conversation list metadata.
 *
 * `onProgress` is invoked as conversations complete so the UI can show a
 * restore-in-progress state (allowed — the user explicitly requested this).
 */
export async function restoreChatHistory(
  userId?: string | null,
  onProgress?: (progress: RestoreProgress) => void,
): Promise<RestoreResult> {
  // 1. Conversation list (lightweight metadata).
  const { chatRooms } = await getChatRoomList('all');

  // 2. Persist the conversation list first so the Messages tab can paint the
  //    restored conversations immediately, even if message restore is slow.
  if (chatRooms.length > 0) {
    await cacheChatRooms(chatRooms, userId).catch(() => {});
  }

  let messagesRestored = 0;
  let done = 0;

  for (const room of chatRooms) {
    onProgress?.({
      done,
      total: chatRooms.length,
      roomName: room.otherUser?.name ?? undefined,
    });

    // 3. Fetch the full message history for this conversation over the
    //    authenticated SweetSocket command, paginating backwards. The server
    //    returns newest-first pages; the cursor includes timestamp + message id
    //    so same-millisecond messages cannot be skipped or repeated.
    let before: string | undefined;
    let pages = 0;
    let sawShortPage = false;
    while (!sawShortPage && pages < MAX_PAGES_PER_ROOM) {
      const { messages, hasMore } = await fetchRoomHistory(room.chatRoomId, before ? { before } : undefined);
      pages += 1;
      if (messages.length === 0) break;

      // Persist incrementally so an interruption never loses a whole room.
      await cacheMessages(room.chatRoomId, messages, userId).catch(() => {});
      messagesRestored += messages.length;

      const oldest = messages[messages.length - 1];
      before = oldest ? `${oldest.createdAt}::${oldest.id}` : undefined;
      if (!hasMore || messages.length < PAGE_SIZE) sawShortPage = true;
    }

    done += 1;
    onProgress?.({ done, total: chatRooms.length, roomName: room.otherUser?.name ?? undefined });
  }

  return { rooms: chatRooms.length, messages: messagesRestored };
}
