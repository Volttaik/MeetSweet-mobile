/**
 * SweetSocket — the ONE realtime connection for the whole app.
 *
 * Design (matches Vercel's documented Functions WebSocket behavior):
 *  - The server socket closes when the Function hits max duration and
 *    reconnects may land on a different instance → reconnection + resync are
 *    mandatory here, not optional.
 *  - The database is authoritative. This socket only DELIVERS events; after
 *    every reconnect the client replays what it missed via `sync { since }`,
 *    keyed on the server's durable outbox seq.
 *  - One connection for the entire app, created lazily by AuthContext on
 *    login and torn down on logout. Screens never open their own sockets;
 *    they subscribe to event types through `on()`.
 */

import { getApiBase, refreshAccessToken } from '@/services/api';
import {
  getAccessToken,
  getLastRealtimeSeq,
  setLastRealtimeSeq,
} from '@/lib/session-storage';

export type RealtimeEvent = {
  id: string;
  seq: number;
  type: string;
  channel: string;
  ts: string;
  resourceId?: string | null;
  payload: Record<string, unknown>;
};

type ServerFrame =
  | { type: 'hello'; seq: number }
  | { type: 'subscribed'; channels: string[]; denied: string[] }
  | { type: 'event'; event: RealtimeEvent }
  | { type: 'pong' }
  | { type: 'synced'; since: number; count: number }
  | { type: 'error'; code: string };

export type RealtimeHandler = (event: RealtimeEvent) => void;

const HEARTBEAT_MS = 25_000;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const AUTH_CLOSE_CODE = 4401;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<RealtimeHandler>();
  private lastSeq = 0;
  private backoff = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connecting = false;
  private shouldRun = false;

  /** Events already delivered (dedup by server id across echo + replay). */
  private seenIds = new Set<string>();

  async start(): Promise<void> {
    this.shouldRun = true;
    this.lastSeq = await getLastRealtimeSeq().catch(() => 0);
    this.connect();
  }

  stop(): void {
    this.shouldRun = false;
    this.seenIds.clear();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }

  /** Subscribe to events app-wide. Returns an unsubscribe function. */
  on(handler: RealtimeHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (!this.shouldRun || this.connecting || this.isConnected) return;
    const token = await getAccessToken();
    if (!token) return; // logged out
    this.connecting = true;

    const base = getApiBase();
    const wsUrl = `${base.replace(/^http/, 'ws')}/realtime?token=${encodeURIComponent(token)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this.connecting = false;
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.connecting = false;
      this.backoff = MIN_BACKOFF_MS;
      // One channel: our own user stream (server authorizes ownership).
      // `sync` recovers everything missed while disconnected — the server
      // scopes replay by auth, so no polling is ever required.
      if (this.userChannelName) {
        this.sendRaw(JSON.stringify({ type: 'subscribe', channels: [this.userChannelName] }));
      }
      this.sendRaw(JSON.stringify({ type: 'sync', since: this.lastSeq }));
      this.startHeartbeat();
    };

    ws.onmessage = (raw) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(raw.data)) as ServerFrame;
      } catch {
        return;
      }
      switch (frame.type) {
        case 'hello':
          // Head of the server outbox at connect time.
          this.lastSeq = Math.max(this.lastSeq, 0);
          break;
        case 'event':
          this.deliver(frame.event);
          break;
        case 'pong':
        case 'subscribed':
        case 'synced':
        default:
          break;
      }
    };

    ws.onclose = (ev) => {
      this.stopHeartbeat();
      this.connecting = false;
      this.ws = null;
      if (!this.shouldRun) return;
      if (ev.code === AUTH_CLOSE_CODE) {
        // Token expired mid-connection — refresh once then retry immediately.
        void refreshAccessToken().then((t) => {
          if (t && this.shouldRun) this.connect();
        });
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  }

  /**
   * The subscribe frame needs our user id for the channel name; AuthContext
   * provides it via `setUserChannel` after login / session restore.
   */
  private userChannelName: string | null = null;

  setUserChannel(userId: string | null): void {
    this.userChannelName = userId ? `user:${userId}` : null;
    if (this.isConnected && this.userChannelName) {
      this.sendRaw(JSON.stringify({ type: 'subscribe', channels: [this.userChannelName] }));
    }
  }

  private deliver(event: RealtimeEvent): void {
    if (this.seenIds.has(event.id)) return; // dedup echo vs replay
    this.seenIds.add(event.id);
    if (this.seenIds.size > 500) {
      // Bound the dedup set.
      const it = this.seenIds.values().next();
      if (!it.done) this.seenIds.delete(it.value);
    }
    if (event.seq > this.lastSeq) {
      this.lastSeq = event.seq;
      void setLastRealtimeSeq(event.seq).catch(() => {});
    }
    this.handlers.forEach((h) => {
      try {
        h(event);
      } catch (error) {
        console.warn('[realtime] handler error', error);
      }
    });
  }

  private sendRaw(payload: string): void {
    if (!this.isConnected || !this.ws) return;
    try {
      this.ws.send(payload);
    } catch {}
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun || this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw(JSON.stringify({ type: 'ping' }));
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

export const realtime = new RealtimeClient();

/** Event payload shapes the UI relies on (kept in one place). */
export interface NotificationCreatedPayload {
  notification: {
    id: string;
    type: string;
    entity_type?: string | null;
    entity_id?: string | null;
    body?: string | null;
    actor_id?: string | null;
    created_at: string;
    is_read?: boolean;
  };
}

// ─── Private Message event set ───────────────────────────────────────────────
// The minimum events the Private Message UI consumes over SweetSocket. Names
// match the server's durable outbox (server/lib/realtime/types.ts) exactly —
// nothing is invented client-side. The socket delivers; the DB stays
// authoritative; no polling anywhere.

/** `private_message.created` — a new message lands in a recipient's box. */
export interface PrivateMessageCreatedPayload {
  box: 'inbox' | 'outbox';
  message: Record<string, unknown>; // PrivateMessageView shape from the API
}

/** `private_message.reply_created` — a reply arrived in an open thread. */
export interface PrivateMessageReplyCreatedPayload {
  original_id: string; // thread root id — match against the open thread
  parent_id: string;   // the message the reply answers
  reply: Record<string, unknown>; // PrivateMessageView shape
}

/** `private_message.read` — the other participant opened the correspondence. */
export interface PrivateMessageReadPayload {
  message_id: string;
  read_at: string;
}

/** `private_message.updated` — status/reply-count refresh for a thread root. */
export interface PrivateMessageUpdatedPayload {
  box: 'inbox' | 'outbox';
  status?: 'sent' | 'read' | 'replied' | 'waiting';
  replied_at?: string | null;
  message: Record<string, unknown>; // PrivateMessageView shape
}

/** `private_message.approved` — a waiting message moved into the inbox. */
export interface PrivateMessageApprovedPayload {
  message_id: string;
  status: 'sent';
}

/** `private_message.deleted` — a thread was removed for one or both sides. */
export interface PrivateMessageDeletedPayload {
  thread_id: string;
  deleted_for_both: boolean;
}

/** `private_message.attachment_purchased` — creator notification of a sale. */
export interface PrivateMessageAttachmentPurchasedPayload {
  attachment_id: string;
  message_id: string;
  buyer_id: string;
}
