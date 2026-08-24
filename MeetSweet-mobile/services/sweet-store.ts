/**
 * SweetStore — the client-side application state store for SweetSocket.
 *
 * Architectural role (Baileys-inspired, MeetSweet-scaled):
 *
 *   SweetSocket  →  Event dispatcher  →  SweetStore  →  UI
 *
 * SweetSocket is the realtime TRANSPORT. The store LISTENS to socket events
 * and maintains the current application state (chat list, unread counts,
 * typing, presence). Screens subscribe to the store instead of each screen
 * independently reconstructing the same state from the same events.
 *
 * Durability split (one responsibility per layer):
 *   - Turso (server)  → durable persistence
 *   - SweetSocket     → realtime transport
 *   - chat-cache      → on-disk SQLite mirror (fast re-render)
 *   - SweetStore      → canonical IN-MEMORY current state (this file)
 *
 * Idempotency: every mutation is keyed by a stable id (room id, message id,
 * user id). Processing the same event twice never duplicates state — upserts
 * replace, deletes remove by id.
 */

import { realtime, REALTIME_EVENT, type RealtimeEvent } from '@/services/realtime';
import { soundService } from '@/services/sound-service';
import {
  normalizeChatRoom,
  normalizeMessage,
  type ChatRoom,
  type RoomMessage,
} from '@/services/room-service';
import { cacheChatRooms, cacheMessages, removeCachedRoom } from '@/services/chat-cache';
import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SweetStoreSnapshot {
  /** Chat rooms, newest activity first (deterministic tie-break on room id). */
  rooms: ChatRoom[];
  /** unread count per room id (server-authoritative via chats:upsert). */
  unreadByRoom: Record<string, number>;
  /** userIds currently typing, per room id. */
  typingByRoom: Record<string, string[]>;
  /** userId → online status (presence events; never persisted). */
  presence: Record<string, boolean>;
}

function sortRooms(rooms: ChatRoom[]): ChatRoom[] {
  return [...rooms].sort((a, b) => {
    const ta = new Date(a.lastMessageAt ?? a.createdAt).getTime();
    const tb = new Date(b.lastMessageAt ?? b.createdAt).getTime();
    if (tb !== ta) return tb - ta;
    return a.chatRoomId < b.chatRoomId ? -1 : a.chatRoomId > b.chatRoomId ? 1 : 0;
  });
}

function roomIdOf(event: RealtimeEvent): string {
  // Durable per-user events ride the private `user:{id}` channel but always
  // carry the room id in the payload/event — never trust the channel string
  // for room-scoped state (parsing `user:` as a room id would silently drop
  // preview/unread updates for rooms the user is not currently viewing).
  const payloadRoomId = (event.payload as { roomId?: unknown } | undefined)?.roomId;
  if (typeof payloadRoomId === 'string' && payloadRoomId) return payloadRoomId;
  if (typeof event.roomId === 'string' && event.roomId) return event.roomId;
  return String(event.channel ?? '').replace(/^chat:/, '');
}

// ─── Store ────────────────────────────────────────────────────────────────────

/** How long a typing indicator lives without a heartbeat before the store
 *  expires it (chat list "Typing…" row). Must be comfortably longer than the
 *  sender's typing heartbeat so an active composer never flickers. */
const TYPING_EXPIRE_MS = 12_000;

class SweetStore {
  private rooms = new Map<string, ChatRoom>();
  private unread = new Map<string, number>();
  private typing = new Map<string, Set<string>>();
  private presence = new Map<string, boolean>();
  private listeners = new Set<() => void>();
  private started = false;
  private currentUserId: string | null = null;
  private offFns: Array<() => void> = [];
  /** Auto-expiry timers for typing indicators, keyed `${roomId}:${userId}`.
   *  A sender whose app dies mid-compose never sends typing:stop — without
   *  these, the chat list would show "Typing…" forever. */
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Start listening to the user's private channel + all socket events. */
  start(userId: string): void {
    if (this.started && this.currentUserId === userId) return;
    this.stop();
    this.started = true;
    this.currentUserId = userId;
    realtime.subscribe(`user:${userId}`);
    this.offFns = [
      realtime.on(REALTIME_EVENT.messagesUpsert, (e) => this.onMessageUpsert(e)),
      realtime.on(REALTIME_EVENT.messagesUpdate, (e) => this.onMessageUpdate(e)),
      realtime.on(REALTIME_EVENT.messagesDelete, (e) => this.onMessageDelete(e)),
      realtime.on(REALTIME_EVENT.messagesReaction, (e) => this.onMessageReaction(e)),
      realtime.on(REALTIME_EVENT.chatsUpsert, (e) => this.onChatsUpsert(e)),
      realtime.on(REALTIME_EVENT.chatsUpdate, (e) => this.onChatsUpdate(e)),
      realtime.on(REALTIME_EVENT.chatsDelete, (e) => this.onChatsDelete(e)),
      realtime.on(REALTIME_EVENT.chatClear, (e) => this.onChatClear(e)),
      realtime.on(REALTIME_EVENT.chatTypingStarted, (e) => this.onTyping(e, true)),
      realtime.on(REALTIME_EVENT.chatTypingStopped, (e) => this.onTyping(e, false)),
      realtime.on(REALTIME_EVENT.chatPresenceUpdated, (e) => this.onPresence(e)),
      realtime.on(REALTIME_EVENT.messageRead, (e) => this.onMessageRead(e)),
    ];
  }

  stop(): void {
    if (this.currentUserId) realtime.unsubscribe(`user:${this.currentUserId}`);
    for (const off of this.offFns) off();
    this.offFns = [];
    this.started = false;
    this.currentUserId = null;
    // State belongs to the signed-in account — never leak it across logins.
    this.rooms.clear();
    this.unread.clear();
    this.typing.clear();
    this.presence.clear();
    for (const timer of this.typingTimers.values()) clearTimeout(timer);
    this.typingTimers.clear();
  }

  /** Replace the whole room list (HTTP refresh / local cache hydration). */
  hydrateRooms(rooms: ChatRoom[]): void {
    this.rooms = new Map(rooms.map((r) => [r.chatRoomId, r]));
    this.notify();
  }

  /** Merge one room into the list (chats:upsert / cache row). */
  upsertRoom(room: ChatRoom): void {
    if (!room?.chatRoomId) return;
    const existing = this.rooms.get(room.chatRoomId);
    this.rooms.set(room.chatRoomId, existing ? { ...existing, ...room } : room);
    if (typeof room.unreadCount === 'number') this.unread.set(room.chatRoomId, room.unreadCount);
    this.notify();
  }

  /** Patch a room in place (chats:update). */
  patchRoom(roomId: string, patch: Partial<ChatRoom>): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.rooms.set(roomId, { ...room, ...patch });
    if (typeof patch.unreadCount === 'number') this.unread.set(roomId, patch.unreadCount);
    this.notify();
  }

  removeRoom(roomId: string): void {
    if (!this.rooms.delete(roomId)) return;
    this.unread.delete(roomId);
    this.typing.delete(roomId);
    removeCachedRoom(roomId, this.currentUserId).catch(() => {});
    this.notify();
  }

  /** The user is actively viewing this room (chat:open). */
  setRoomFocused(roomId: string | null): void {
    if (roomId) this.unread.set(roomId, 0);
  }

  markRoomRead(roomId: string): void {
    this.unread.set(roomId, 0);
    this.notify();
  }

  getSnapshot(): SweetStoreSnapshot {
    return {
      rooms: sortRooms(Array.from(this.rooms.values())),
      unreadByRoom: Object.fromEntries(this.unread),
      typingByRoom: Object.fromEntries(
        Array.from(this.typing.entries()).map(([roomId, users]) => [roomId, Array.from(users)]),
      ),
      presence: Object.fromEntries(this.presence),
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Event handlers (idempotent, keyed by stable ids) ─────────────────────

  private onMessageUpsert(event: RealtimeEvent): void {
    const roomId = roomIdOf(event);
    if (!roomId) return;
    // Never persist the provisional (`accepted`) copy of a message — it is
    // optimistic and not yet durable; the persisted copy (same id, server
    // fields) replaces it. Caching the provisional could leave a row with
    // pending/isOwn in the wrong state if writes raced.
    if ((event.payload as { status?: string })?.status === 'accepted') return;
    const raw = (event.payload as { message?: unknown })?.message;
    if (!raw) return;
    const msg = normalizeMessage(raw);
    if (!msg?.id) return;

    // A genuinely NEW incoming message (someone else's, delivered live — not a
    // reconnect replay, not the sender's own echo) triggers the receive chime.
    // Keyed by clientMessageId ?? message id so the provisional + persisted
    // copies of the same message can never play twice.
    if (msg.sender?.id && msg.sender.id !== this.currentUserId && !event.replayed) {
      soundService.playMessageReceived(event.clientMessageId ?? String(msg.id));
    }

    // Update the room's preview if we know the room (newest message wins).
    const room = this.rooms.get(roomId);
    if (room) {
      const incomingAt = new Date(msg.createdAt).getTime();
      const currentAt = new Date(room.lastMessageAt ?? 0).getTime();
      if (incomingAt >= currentAt) {
        this.rooms.set(roomId, {
          ...room,
          lastMessageBody: msg.body ?? room.lastMessageBody,
          lastMessageAt: msg.createdAt ?? room.lastMessageAt,
          lastMessageMediaType: (msg.mediaType ?? room.lastMessageMediaType ?? null) as ChatRoom['lastMessageMediaType'],
          lastMessageSenderId: msg.sender?.id ?? room.lastMessageSenderId,
        });
      }
    }
    // Persist the message row locally so an offline-received message (delivered
    // by the reconnect replay on the user channel) survives an app restart and
    // the room opens instantly without a history fetch. Idempotent upsert by
    // message id — the chat screen's own handler may already have cached it.
    cacheMessages(roomId, [msg], this.currentUserId).catch(() => {});
    this.notify();
  }

  private onMessageUpdate(event: RealtimeEvent): void {
    const roomId = roomIdOf(event);
    if (!roomId) return;
    const p = event.payload as { messageId?: string; body?: string };
    const room = this.rooms.get(roomId);
    if (room && p.messageId && room.lastMessageId === p.messageId && p.body !== undefined) {
      this.rooms.set(roomId, { ...room, lastMessageBody: p.body });
      this.notify();
    }
  }

  private onMessageDelete(event: RealtimeEvent): void {
    const roomId = roomIdOf(event);
    if (!roomId) return;
    const p = event.payload as { messageId?: string };
    const room = this.rooms.get(roomId);
    // If the deleted message was the last preview, leave the preview as-is —
    // the authoritative room metadata arrives via chats:update/chats:upsert.
    if (room && p.messageId && room.lastMessageId === p.messageId) {
      this.rooms.set(roomId, { ...room, lastMessageBody: null, lastMessageMediaType: null, lastMessageId: null });
      this.notify();
    }
  }

  private onMessageReaction(event: RealtimeEvent): void {
    // Message bubbles manage reactions locally; the store only needs the room
    // list to stay consistent, which reactions do not affect.
    void event;
  }

  private onChatsUpsert(event: RealtimeEvent): void {
    const raw = (event.payload as { room?: unknown })?.room;
    if (!raw) return;
    const room = normalizeChatRoom(raw);
    if (!room?.chatRoomId) return;
    this.upsertRoom(room);
    // Keep the durable mirror in sync so the next app open renders instantly.
    cacheChatRooms([room], this.currentUserId).catch(() => {});
  }

  private onChatsUpdate(event: RealtimeEvent): void {
    const p = event.payload as { roomId?: string; patch?: Record<string, unknown> };
    const roomId = p.roomId ?? String(event.resourceId ?? '');
    if (!roomId) return;
    if (p.patch && typeof p.patch === 'object') {
      const room = this.rooms.get(roomId);
      if (room) {
        const merged = { ...room, ...p.patch };
        this.upsertRoom(normalizeChatRoom(merged));
      }
    }
  }

  private onChatsDelete(event: RealtimeEvent): void {
    const p = event.payload as { roomId?: string };
    const roomId = p.roomId ?? String(event.resourceId ?? '');
    if (!roomId) return;
    this.removeRoom(roomId);
  }

  private onChatClear(event: RealtimeEvent): void {
    const p = event.payload as { roomId?: string };
    const roomId = p.roomId ?? String(event.resourceId ?? '');
    if (!roomId) return;
    // Keep the room in the list, but the preview and unread are gone.
    const room = this.rooms.get(roomId);
    if (room) {
      this.rooms.set(roomId, {
        ...room,
        lastMessageBody: null,
        lastMessageAt: null,
        lastMessageMediaType: null,
        lastMessageId: null,
        unreadCount: 0,
      });
      this.unread.set(roomId, 0);
      this.notify();
    }
  }

  private onTyping(event: RealtimeEvent, started: boolean): void {
    const roomId = roomIdOf(event);
    if (!roomId) return;
    const p = event.payload as { userId?: string };
    const userId = p.userId ?? event.userId;
    if (!userId) return;
    const users = this.typing.get(roomId) ?? new Set<string>();
    if (started) users.add(userId);
    else users.delete(userId);
    if (users.size === 0) this.typing.delete(roomId);
    else this.typing.set(roomId, users);

    // Typing is ephemeral: arm/refresh an expiry so a sender that goes silent
    // (app killed, network dropped) never leaves a stuck "Typing…" row.
    const key = `${roomId}:${userId}`;
    const existing = this.typingTimers.get(key);
    if (existing) clearTimeout(existing);
    if (started) {
      this.typingTimers.set(key, setTimeout(() => {
        this.typingTimers.delete(key);
        const roomUsers = this.typing.get(roomId);
        roomUsers?.delete(userId);
        if (roomUsers && roomUsers.size === 0) this.typing.delete(roomId);
        this.notify();
      }, TYPING_EXPIRE_MS));
    } else {
      this.typingTimers.delete(key);
    }
    this.notify();
  }

  private onPresence(event: RealtimeEvent): void {
    const p = event.payload as { userId?: string; online?: boolean };
    const userId = p.userId ?? event.userId;
    if (!userId) return;
    const online = p.online ?? event.type === REALTIME_EVENT.presenceOnline;
    if (online) this.presence.set(userId, true);
    else this.presence.delete(userId);
    this.notify();
  }

  private onMessageRead(event: RealtimeEvent): void {
    // The CURRENT user reading a room zeroes its unread badge (the chat list
    // must never show a phantom count for a conversation the user has read).
    const p = event.payload as { userId?: string };
    if (!p.userId || p.userId !== this.currentUserId) return;
    const roomId = roomIdOf(event);
    if (!roomId) return;
    this.unread.set(roomId, 0);
    const room = this.rooms.get(roomId);
    if (room && room.unreadCount !== 0) {
      this.rooms.set(roomId, { ...room, unreadCount: 0 });
      cacheChatRooms([{ ...room, unreadCount: 0 }], this.currentUserId).catch(() => {});
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try { listener(); } catch { /* listener isolation */ }
    }
  }
}

/** Singleton — there is exactly one canonical chat state per app session. */
export const sweetStore = new SweetStore();

/** React hook: subscribe to the store snapshot. */
export function useSweetStore(): SweetStoreSnapshot {
  const [snapshot, setSnapshot] = useState<SweetStoreSnapshot>(() => sweetStore.getSnapshot());
  useEffect(() => sweetStore.subscribe(() => setSnapshot(sweetStore.getSnapshot())), []);
  return snapshot;
}
