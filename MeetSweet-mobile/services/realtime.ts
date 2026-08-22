/**
 * RealtimeClient — the mobile side of the unified WebSocket realtime layer.
 *
 * Connects to the existing backend's WebSocket endpoint (Fluid compute):
 *   wss://<api>/api/realtime?token=<access-token>
 *
 * Responsibilities:
 *   - authenticated connect (token from session storage; refreshed on 4401),
 *   - channel subscribe/unsubscribe with server-side authorization,
 *   - heartbeat (ping) so dead connections are detected and replaced,
 *   - automatic reconnect with exponential backoff (1s → 30s cap),
 *   - resubscribe + missed-event recovery on reconnect (outbox `sync`),
 *   - idempotent delivery: events are deduped by their server event id,
 *   - ephemeral relay (typing / recording / presence) when connected, with
 *     callers falling back to HTTP when the socket is unavailable.
 *
 * The database remains the source of truth: realtime events only NOTIFY the
 * app that something changed. Screens keep their REST/polling paths as a
 * fallback for when the socket is down.
 */

import { getAccessToken, clearSessionStorage } from '@/lib/session-storage';
import { getApiBase, refreshAccessToken } from '@/services/api';

export interface RealtimeEvent {
  /** UUID — dedup key (idempotent delivery). */
  id: string;
  /** Outbox sequence — null for ephemeral events. */
  seq: number | null;
  type: string;
  channel: string;
  ts: string;
  resourceId?: string;
  userId?: string;
  payload: Record<string, unknown>;
}

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

type EventHandler = (event: RealtimeEvent) => void;
type StatusHandler = (status: RealtimeStatus) => void;

export const REALTIME_EVENT = {
  chatMessageCreated: 'chat.message.created',
  chatMessageUpdated: 'chat.message.updated',
  chatMessageDeleted: 'chat.message.deleted',
  chatTypingStarted: 'chat.typing.started',
  chatTypingStopped: 'chat.typing.stopped',
  chatRecordingStarted: 'chat.recording.started',
  chatRecordingStopped: 'chat.recording.stopped',
  chatMessageRead: 'chat.message.read',
  chatReactionUpdated: 'chat.reaction.updated',
  chatPresenceUpdated: 'chat.presence.updated',
  postCommentCreated: 'post.comment.created',
  postCommentUpdated: 'post.comment.updated',
  postCommentDeleted: 'post.comment.deleted',
  postLikeUpdated: 'post.like.updated',
  notificationCreated: 'notification.created',
  subscriptionCountUpdated: 'subscription.count_updated',
  walletUpdated: 'wallet.updated',
  purchaseCompleted: 'purchase.completed',
} as const;

const HEARTBEAT_MS = 25_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const DEDUP_CAP = 500;
const CLOSE_UNAUTHORIZED = 4401;

function wsUrl(token: string): string {
  const base = getApiBase().replace(/\/+$/, '');
  // https://host/api → wss://host/api/realtime
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/realtime?token=${encodeURIComponent(token)}`;
}

class RealtimeClient {
  private ws: WebSocket | null = null;
  private status: RealtimeStatus = 'idle';
  private manualClosed = false;
  private retryDelay = RECONNECT_BASE_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectSeq = 0; // guards stale async connect flows

  /** Channels the app wants (re-subscribed after every reconnect). */
  private desiredChannels = new Set<string>();
  /** Channels the server has confirmed (subscribed). */
  private activeChannels = new Set<string>();
  /** Last outbox sequence seen — used to recover missed durable events. */
  private lastSeq: number | null = null;

  /** True once the server's `hello` (auth complete) has been received. */
  private helloReceived = false;

  /** Event-id dedup (idempotent delivery). */
  private seenIds = new Set<string>();

  /** Pending (batched) subscription changes — flushed on the next tick. */
  private pendingSub = new Set<string>();
  private pendingUnsub = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private typeHandlers = new Map<string, Set<EventHandler>>();
  private channelHandlers = new Map<string, Set<EventHandler>>();
  private statusHandlers = new Set<StatusHandler>();

  // ── Lifecycle ────────────────────────────────────────────────────────────

  connect(): void {
    if (this.status === 'connecting' || this.status === 'open') return;
    this.manualClosed = false;
    void this.open();
  }

  /** Close for good (logout / app teardown). */
  disconnect(): void {
    this.manualClosed = true;
    this.desiredChannels.clear();
    this.activeChannels.clear();
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    this.setStatus('closed');
    try {
      ws?.close(1000, 'manual');
    } catch {
      // ignore
    }
  }

  isOpen(): boolean {
    return this.status === 'open';
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  // ── Subscriptions ────────────────────────────────────────────────────────

  subscribe(channel: string): void {
    this.desiredChannels.add(channel);
    this.pendingSub.add(channel);
    this.pendingUnsub.delete(channel);
    this.scheduleFlush();
  }

  unsubscribe(channel: string): void {
    this.desiredChannels.delete(channel);
    this.activeChannels.delete(channel);
    this.pendingUnsub.add(channel);
    this.pendingSub.delete(channel);
    this.scheduleFlush();
  }

  /** Relay an EPHEMERAL event (typing/recording/presence) to an authorized channel. */
  relay(channel: string, eventType: string, payload?: Record<string, unknown>): boolean {
    if (!this.isOpen()) return false;
    this.sendJson({ type: 'relay', channel, eventType, payload });
    return true;
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  on(type: string, handler: EventHandler): () => void {
    let set = this.typeHandlers.get(type);
    if (!set) {
      set = new Set();
      this.typeHandlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  onChannel(channel: string, handler: EventHandler): () => void {
    let set = this.channelHandlers.get(channel);
    if (!set) {
      set = new Set();
      this.channelHandlers.set(channel, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private setStatus(status: RealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusHandlers.forEach((h) => {
      try {
        h(status);
      } catch {
        // handler errors must never break the client
      }
    });
  }

  private async open(): Promise<void> {
    const flow = ++this.connectSeq;
    this.setStatus('connecting');

    const token = await getAccessToken();
    if (!token) {
      this.scheduleReconnect();
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(token));
    } catch {
      this.scheduleReconnect();
      return;
    }
    if (flow !== this.connectSeq) return;
    this.ws = ws;

    ws.onopen = () => {
      if (flow !== this.connectSeq) return;
      this.retryDelay = RECONNECT_BASE_MS;
      this.setStatus('open');
      // Subscriptions are sent only AFTER the server's `hello` (auth done) —
      // the server also buffers pre-auth frames, so nothing is ever dropped.
      this.helloReceived = false;
      this.startHeartbeat();
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };

    ws.onerror = () => {
      // onclose follows — reconnect there.
    };

    ws.onclose = (event) => {
      if (flow !== this.connectSeq) return;
      this.stopHeartbeat();
      this.activeChannels.clear();
      this.ws = null;

      if (this.manualClosed) return;

      // Token expired/invalid — refresh once, then reconnect.
      if (event.code === CLOSE_UNAUTHORIZED) {
        void (async () => {
          const fresh = await refreshAccessToken();
          if (!fresh) {
            await clearSessionStorage().catch(() => {});
          }
          this.scheduleReconnect();
        })();
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.manualClosed) return;
    this.setStatus('reconnecting');
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.setStatus('idle');
      void this.open();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, RECONNECT_MAX_MS);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendJson({ type: 'ping' });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.retryTimer = null;
    this.heartbeatTimer = null;
  }

  /** Batch subscribe/unsubscribe changes into a single frame per tick. */
  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPending();
    }, 0);
  }

  private flushPending(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Only send once the connection is authenticated (hello received).
    if (!this.isOpen() || !this.helloReceived) return;
    if (this.pendingSub.size > 0) {
      this.sendJson({ type: 'subscribe', channels: [...this.pendingSub] });
      this.pendingSub.clear();
    }
    if (this.pendingUnsub.size > 0) {
      this.sendJson({ type: 'unsubscribe', channels: [...this.pendingUnsub] });
      this.pendingUnsub.clear();
    }
  }

  private sendJson(msg: object): void {
    if (this.ws && this.status === 'open') {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        // Socket mid-close — ignore; reconnect will resubscribe.
      }
    }
  }

  private handleServerMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'hello': {
        const seq = typeof msg.seq === 'number' ? msg.seq : null;
        if (seq != null && (this.lastSeq == null || seq > this.lastSeq)) {
          this.lastSeq = seq;
        }
        // Auth complete: (re)subscribe every desired channel (a fresh
        // connection after reconnect has an empty server-side subscription
        // set), then recover any missed durable events since the last seq.
        this.helloReceived = true;
        for (const c of this.desiredChannels) this.pendingSub.add(c);
        this.flushPending();
        if (this.lastSeq != null) {
          this.sendJson({ type: 'sync', since: this.lastSeq });
        }
        return;
      }
      case 'pong':
        return;
      case 'subscribed': {
        const channels = Array.isArray(msg.channels) ? (msg.channels as string[]) : [];
        channels.forEach((c) => this.activeChannels.add(c));
        return;
      }
      case 'unsubscribed':
        return;
      case 'synced':
        return;
      case 'error':
        // Server-side protocol errors are non-fatal; log for debugging.
        console.warn('[realtime] server error:', msg.code, msg.message);
        return;
      case 'event': {
        const event = msg.event as RealtimeEvent;
        if (!event || typeof event.id !== 'string') return;
        // Idempotent delivery: drop duplicates by event id.
        if (this.seenIds.has(event.id)) return;
        this.seenIds.add(event.id);
        if (this.seenIds.size > DEDUP_CAP) {
          const oldest = this.seenIds.values().next().value;
          if (oldest) this.seenIds.delete(oldest);
        }
        if (typeof event.seq === 'number') {
          this.lastSeq = event.seq;
        }
        this.dispatch(event);
        return;
      }
      default:
        return;
    }
  }

  private dispatch(event: RealtimeEvent): void {
    const byType = this.typeHandlers.get(event.type);
    if (byType) {
      byType.forEach((h) => {
        try {
          h(event);
        } catch {
          // handler errors must never break the client
        }
      });
    }
    const byChannel = this.channelHandlers.get(event.channel);
    if (byChannel) {
      byChannel.forEach((h) => {
        try {
          h(event);
        } catch {
          // handler errors must never break the client
        }
      });
    }
  }
}

/** Singleton — one connection for the whole app. */
export const realtime = new RealtimeClient();
