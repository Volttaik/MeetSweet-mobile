import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccessToken, clearSessionStorage } from '@/lib/session-storage';
import { getApiBase, refreshAccessToken } from '@/services/api';
import { REALTIME_EVENT, REALTIME_EVENT_ALIASES } from '@/services/realtime-events';
import { subscribeNetwork } from '@/hooks/useNetwork';
export { REALTIME_EVENT } from '@/services/realtime-events';

export interface RealtimeEvent {
  id: string;
  version?: 1;
  seq?: number | null;
  sequence?: number | null;
  type: string;
  channel: string;
  ts?: string;
  timestamp?: number;
  resourceId?: string;
  resource_id?: string;
  userId?: string;
  roomId?: string;
  clientMessageId?: string;
  /** True when this event was delivered by the reconnect/offline REPLAY (durable
   *  sync) rather than live on the wire. Consumers use it to distinguish "new"
   *  events from "catch-up" ones — e.g. the sound layer never chimes for a
   *  replayed message the user already missed. */
  replayed?: boolean;
  payload: Record<string, unknown>;
}

export interface SweetSocketAck {
  requestId: string;
  command: string;
  status: 'accepted' | 'persisted' | 'failed';
  clientMessageId?: string;
  event?: RealtimeEvent;
  error?: string;
}

export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

type EventHandler = (event: RealtimeEvent) => void;
type StatusHandler = (status: RealtimeStatus) => void;
type AckHandler = (ack: SweetSocketAck) => void;

type PendingCommand = {
  command: string;
  resolve: (ack: SweetSocketAck) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * A command held while the socket is offline. Queued commands are transmitted
 * in order on the next successful reconnect (hello), so a user can send a
 * message while disconnected and it is delivered once connectivity returns —
 * no duplicates, because every command carries a clientMessageId the server
 * dedupes on.
 */
type QueuedCommand = {
  command: string;
  payload: Record<string, unknown>;
  channel?: string;
  clientMessageId?: string;
  resolve: (ack: SweetSocketAck) => void;
  reject: (error: Error) => void;
};

const HEARTBEAT_MS = 25_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const COMMAND_TIMEOUT_MS = 45_000;
const DEDUP_CAP = 2_000;
const CLOSE_UNAUTHORIZED = 4401;
const DEBUG = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Stable per-install socket identity. The SERVER keys the durable replay
 * cursor by (user_id, client_id) — the client must present the SAME id on
 * every connection so reconnects resume from the last acknowledged sequence
 * instead of restarting the replay. Persisted so it survives app restarts.
 */
const CLIENT_ID_KEY = 'ms_socket_client_id_v1';
let clientIdPromise: Promise<string> | null = null;

async function getClientId(): Promise<string> {
  clientIdPromise ??= (async () => {
    try {
      const existing = await AsyncStorage.getItem(CLIENT_ID_KEY);
      if (existing) return existing;
      const fresh = `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      await AsyncStorage.setItem(CLIENT_ID_KEY, fresh);
      return fresh;
    } catch {
      return `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }
  })();
  return clientIdPromise;
}

function wsUrl(token: string): string {
  const base = getApiBase().replace(/\/+$/, '');
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/realtime?token=${encodeURIComponent(token)}`;
}

function log(...args: unknown[]): void {
  if (DEBUG) console.log('[SWEETSOCKET]', ...args);
}

function normalizedEvent(event: RealtimeEvent): RealtimeEvent {
  return {
    ...event,
    seq: event.seq ?? event.sequence ?? null,
    sequence: event.sequence ?? event.seq ?? null,
    ts: event.ts ?? (event.timestamp ? new Date(event.timestamp).toISOString() : undefined),
    timestamp: event.timestamp ?? (event.ts ? new Date(event.ts).getTime() : Date.now()),
    resourceId: event.resourceId ?? event.resource_id,
    replayed: event.replayed === true,
  };
}

class SweetSocketClient {
  private ws: WebSocket | null = null;
  private status: RealtimeStatus = 'idle';
  private manualClosed = false;
  private suspended = false;
  private retryDelay = RECONNECT_BASE_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lifecycleSubscription: { remove: () => void } | null = null;
  private offNetwork: (() => void) | null = null;
  private syncInFlight = false;
  private connectSeq = 0;
  private lastSequence: number | null = null;
  private helloReceived = false;
  private reconnecting = false;
  /** True while a durable replay page is streaming after a sync request.
   *  Events delivered in this window are catch-up replays, not live — tagged
   *  `replayed` so consumers (sounds, badges) can ignore them. */
  private syncActive = false;
  private desiredChannels = new Set<string>();
  private activeChannels = new Set<string>();
  private pendingSubscribe = new Set<string>();
  private pendingUnsubscribe = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private seenIds = new Set<string>();
  private pendingCommands = new Map<string, PendingCommand>();
  private queuedCommands: QueuedCommand[] = [];
  private typeHandlers = new Map<string, Set<EventHandler>>();
  private channelHandlers = new Map<string, Set<EventHandler>>();
  private ackHandlers = new Set<AckHandler>();
  private statusHandlers = new Set<StatusHandler>();

  connect(): void {
    this.suspended = false;
    this.manualClosed = false;
    this.installLifecycleListener();
    // Device-connectivity awareness: the moment the network probe reports the
    // device reachable again, reconnect IMMEDIATELY instead of waiting out the
    // exponential backoff. The probe fires on a real connectivity change, so
    // a lost-then-restored connection converges within seconds — no manual
    // refresh, no app reopen required.
    if (!this.offNetwork) {
      this.offNetwork = subscribeNetwork((state) => {
        if (!state.isOnline) return; // offline → onclose/backoff handles it
        if (this.manualClosed || this.suspended) return;
        if (this.isOpen() || this.status === 'connecting') return;
        if (this.retryTimer) {
          clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }
        this.retryDelay = RECONNECT_BASE_MS;
        this.reconnecting = true;
        void this.open();
      });
    }
    if (this.status === 'connecting' || this.status === 'open' || this.status === 'reconnecting') return;
    void this.open();
  }

  disconnect(): void {
    this.manualClosed = true;
    this.suspended = false;
    this.desiredChannels.clear();
    this.activeChannels.clear();
    this.pendingSubscribe.clear();
    this.pendingUnsubscribe.clear();
    this.clearTimers();
    this.lifecycleSubscription?.remove();
    this.lifecycleSubscription = null;
    this.offNetwork?.();
    this.offNetwork = null;
    const ws = this.ws;
    this.ws = null;
    this.rejectPending(new Error('SweetSocket disconnected'));
    this.rejectQueued(new Error('SweetSocket disconnected'));
    this.setStatus('closed');
    try { ws?.close(1000, 'manual'); } catch { /* ignore */ }
  }

  /** Suspend the transport while iOS/Android backgrounds the app. */
  suspend(): void {
    this.suspended = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(1000, 'background'); } catch { /* ignore */ }
    this.setStatus('closed');
  }

  resume(): void {
    if (this.manualClosed) return;
    this.suspended = false;
    this.connect();
  }

  isOpen(): boolean { return this.status === 'open' && this.helloReceived; }
  getStatus(): RealtimeStatus { return this.status; }

  subscribe(channel: string): void {
    if (!channel) return;
    this.desiredChannels.add(channel);
    this.pendingSubscribe.add(channel);
    this.pendingUnsubscribe.delete(channel);
    this.scheduleFlush();
  }

  unsubscribe(channel: string): void {
    this.desiredChannels.delete(channel);
    this.activeChannels.delete(channel);
    this.pendingSubscribe.delete(channel);
    this.pendingUnsubscribe.add(channel);
    this.scheduleFlush();
  }

  /** Send an application command and resolve when the server acknowledges it.
   *  When `options.queue` is true and the socket is offline, the command is
   *  held and transmitted automatically on the next reconnect instead of
   *  failing immediately (used for message sends). */
  emit(
    command: string,
    payload: Record<string, unknown> = {},
    options: { channel?: string; clientMessageId?: string; queue?: boolean } = {},
  ): Promise<SweetSocketAck> {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise<SweetSocketAck>((resolve, reject) => {
      if (!this.isOpen()) {
        if (options.queue) {
          this.queuedCommands.push({
            command,
            payload,
            channel: options.channel,
            clientMessageId: options.clientMessageId,
            resolve,
            reject,
          });
          return;
        }
        reject(new Error('SweetSocket is not connected'));
        return;
      }
      this.sendCommand(requestId, command, payload, options, resolve, reject);
    });
  }

  /** Transmit a command over the open socket and track its ack. */
  private sendCommand(
    requestId: string,
    command: string,
    payload: Record<string, unknown>,
    options: { channel?: string; clientMessageId?: string },
    resolve: (ack: SweetSocketAck) => void,
    reject: (error: Error) => void,
  ): void {
    const timer = setTimeout(() => {
      this.pendingCommands.delete(requestId);
      reject(new Error(`SweetSocket command timed out: ${command}`));
    }, COMMAND_TIMEOUT_MS);
    this.pendingCommands.set(requestId, { command, resolve, reject, timer });
    this.sendJson({
      type: 'command',
      requestId,
      command,
      channel: options.channel,
      clientMessageId: options.clientMessageId,
      payload,
    });
  }

  /** Replay queued commands in order once the socket is healthy again. */
  private flushQueued(): void {
    if (!this.isOpen() || this.queuedCommands.length === 0) return;
    const queued = this.queuedCommands;
    this.queuedCommands = [];
    for (const q of queued) {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.sendCommand(requestId, q.command, q.payload, q, q.resolve, q.reject);
    }
  }

  /**
   * Ask the server to replay durable events after this client's cursor. The
   * server answers with `synced` (through/hasMore); we ack the watermark and
   * page again while hasMore. One replay in flight at a time.
   */
  private requestSync(): void {
    if (this.syncInFlight) return;
    this.syncInFlight = true;
    // Replay pages arrive as ordinary `event` frames after the sync request —
    // mark that window so they can be tagged as replays.
    this.syncActive = true;
    void getClientId().then((clientId) => {
      if (!this.isOpen() || this.manualClosed || this.suspended) {
        this.syncInFlight = false;
        this.syncActive = false;
        return;
      }
      this.sendJson({ type: 'sync', clientId });
    });
  }

  /** Explicit name for feature code that prefers command terminology. */
  command = this.emit.bind(this);

  relay(channel: string, eventType: string, payload: Record<string, unknown> = {}): boolean {
    if (!this.isOpen()) return false;
    this.sendJson({ type: 'relay', channel, eventType, payload });
    return true;
  }

  on(type: string, handler: EventHandler): () => void {
    let handlers = this.typeHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.typeHandlers.set(type, handlers);
    }
    handlers.add(handler);
    return () => handlers?.delete(handler);
  }

  onChannel(channel: string, handler: EventHandler): () => void {
    let handlers = this.channelHandlers.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.channelHandlers.set(channel, handlers);
    }
    handlers.add(handler);
    return () => handlers?.delete(handler);
  }

  onAck(handler: AckHandler): () => void {
    this.ackHandlers.add(handler);
    return () => this.ackHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusHandlers.forEach((handler) => {
      try { handler(status); } catch { /* listener isolation */ }
    });
  }

  private installLifecycleListener(): void {
    if (this.lifecycleSubscription) return;
    this.lifecycleSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') this.resume();
      else if (state === 'background' || state === 'inactive') this.suspend();
    });
  }

  private async open(): Promise<void> {
    if (this.manualClosed || this.suspended) return;
    const flow = ++this.connectSeq;
    const wasReconnect = this.reconnecting || this.lastSequence !== null;
    this.setStatus(wasReconnect ? 'reconnecting' : 'connecting');
    log(wasReconnect ? 'reconnecting' : 'connecting');

    const token = await getAccessToken();
    if (!token || flow !== this.connectSeq || this.manualClosed || this.suspended) {
      if (!this.manualClosed && !this.suspended) this.scheduleReconnect();
      return;
    }

    let ws: WebSocket;
    try {
      // React Native's WebSocket accepts a third `options` argument carrying
      // custom headers (the DOM type only knows two args, hence the cast). The
      // server middleware rejects upgrade requests that lack the app id, so the
      // header must travel on the socket handshake itself.
      const NativeWebSocket = WebSocket as unknown as new (
        url: string,
        protocols?: string | string[] | null,
        options?: { headers?: Record<string, string> },
      ) => WebSocket;
      ws = new NativeWebSocket(wsUrl(token), null, { headers: { 'X-Client-App-Id': 'meetsweet-mobile' } });
    }
    catch { this.scheduleReconnect(); return; }
    if (flow !== this.connectSeq) return;
    this.ws = ws;

    ws.onopen = () => {
      if (flow !== this.connectSeq) return;
      this.retryDelay = RECONNECT_BASE_MS;
      this.helloReceived = false;
      this.setStatus('open');
      this.startHeartbeat();
      log('socket open');
    };
    ws.onmessage = (event) => {
      try { this.handleServerMessage(JSON.parse(String(event.data)) as Record<string, unknown>); }
      catch { log('invalid server frame'); }
    };
    ws.onerror = () => log('socket error');
    ws.onclose = (event) => {
      if (flow !== this.connectSeq) return;
      this.stopHeartbeat();
      this.activeChannels.clear();
      this.ws = null;
      this.helloReceived = false;
      if (this.manualClosed || this.suspended) return;
      if (event.code === CLOSE_UNAUTHORIZED) {
        void refreshAccessToken().then(async (fresh) => {
          if (!fresh) await clearSessionStorage().catch(() => {});
          this.scheduleReconnect();
        });
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.manualClosed || this.suspended || this.retryTimer) return;
    this.reconnecting = true;
    this.setStatus('reconnecting');
    this.emitLifecycle(REALTIME_EVENT.connectionReconnecting);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.open();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, RECONNECT_MAX_MS);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendJson({ type: 'ping' }), HEARTBEAT_MS);
  }
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.retryTimer = null;
    this.heartbeatTimer = null;
    this.flushTimer = null;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushSubscriptions();
    }, 0);
  }

  private flushSubscriptions(): void {
    if (!this.isOpen()) return;
    if (this.pendingSubscribe.size) {
      this.sendJson({ type: 'subscribe', channels: [...this.pendingSubscribe] });
      this.pendingSubscribe.clear();
    }
    if (this.pendingUnsubscribe.size) {
      this.sendJson({ type: 'unsubscribe', channels: [...this.pendingUnsubscribe] });
      this.pendingUnsubscribe.clear();
    }
  }

  private sendJson(frame: object): void {
    if (this.ws && this.status === 'open') {
      try { this.ws.send(JSON.stringify(frame)); }
      catch { /* close handler schedules reconnect */ }
    }
  }

  private handleServerMessage(message: Record<string, unknown>): void {
    switch (message.type) {
      case 'auth': {
        const state = message.state as string;
        if (state === 'session_expired' || state === 'logout') {
          this.desiredChannels.clear();
          this.activeChannels.clear();
          this.pendingSubscribe.clear();
          this.pendingUnsubscribe.clear();
          this.emitLifecycle(REALTIME_EVENT.authSessionExpired);
          this.rejectQueued(new Error('SweetSocket session expired'));
          void clearSessionStorage().catch(() => {});
          this.manualClosed = true;
          try { this.ws?.close(CLOSE_UNAUTHORIZED, 'Session expired'); } catch { /* ignore */ }
        }
        return;
      }
      case 'connection': {
        // Baileys-style connection.update: the server announces each lifecycle
        // transition (connected → authenticated → ready) explicitly, so UI can
        // show a precise connection state instead of inferring it from auth
        // frames. Re-emitted as a local lifecycle event for store/UI consumers.
        const state = message.state as string;
        const reason = typeof message.reason === 'string' ? message.reason : undefined;
        log('connection', state, reason ?? '');
        if (state === 'authenticated') log('authenticated');
        if (state === 'ready') log('ready');
        this.emitLifecycle(REALTIME_EVENT.connectionUpdate, { state, reason });
        return;
      }
      case 'hello': {
        const sequence = typeof message.sequence === 'number' ? message.sequence : null;
        this.helloReceived = true;
        for (const channel of this.desiredChannels) this.pendingSubscribe.add(channel);
        this.flushSubscriptions();
        // Deliver anything the user sent while offline, in order.
        this.flushQueued();
        // The hello value is a baseline only on the first connection. On a
        // reconnect, retain the last received sequence so we never regress.
        if (this.lastSequence === null) this.lastSequence = sequence;
        // Replay missed events on EVERY connection — first open and reconnect
        // alike. The server resumes from this client's durable cursor (keyed
        // by clientId), so events that happened while the app was closed,
        // backgrounded, or offline are delivered here without the user opening
        // any screen. The `synced` handler acks the watermark and pages again
        // while the server reports more.
        this.requestSync();
        if (this.reconnecting) {
          this.reconnecting = false;
          log('reconnected');
        } else {
          log('connected');
        }
        this.emitLifecycle(REALTIME_EVENT.connectionReconnected);
        return;
      }
      case 'subscribed': {
        for (const channel of (message.channels as string[] | undefined) ?? []) this.activeChannels.add(channel);
        log('subscribed', message.channels);
        return;
      }
      case 'unsubscribed': return;
      case 'pong': return;
      case 'synced': {
        // Replay page delivered — advance the durable cursor to the replayed
        // watermark so the next reconnect resumes AFTER this page, and page
        // again while the server reports more (bounded, convergent replay).
        const sync = message as { since?: number; through?: number; hasMore?: boolean };
        if (typeof sync.through === 'number' && Number.isFinite(sync.through)) {
          const through = sync.through;
          void getClientId().then((clientId) => {
            if (this.isOpen() && !this.manualClosed && !this.suspended) {
              this.sendJson({ type: 'ack', clientId, sequence: through });
            }
          });
        }
        this.syncInFlight = false;
        // Replay is done once the server reports no more pages — from here on
        // every event frame is live again.
        if (!sync.hasMore) this.syncActive = false;
        log('resync', sync.since, '→', sync.through, sync.hasMore ? '(more)' : '(done)');
        if (sync.hasMore) this.requestSync();
        return;
      }
      case 'ack': this.handleAck(message); return;
      case 'event': {
        const event = normalizedEvent(message.event as RealtimeEvent);
        if (this.syncActive) event.replayed = true;
        this.handleEvent(event);
        return;
      }
      case 'error': log('server error', message.code, message.message); return;
      default: return;
    }
  }

  private handleAck(raw: Record<string, unknown>): void {
    const ack: SweetSocketAck = {
      requestId: String(raw.requestId ?? ''),
      command: String(raw.command ?? ''),
      status: raw.status === 'failed' ? 'failed' : raw.status === 'persisted' ? 'persisted' : 'accepted',
      clientMessageId: typeof raw.clientMessageId === 'string' ? raw.clientMessageId : undefined,
      event: raw.event ? normalizedEvent(raw.event as RealtimeEvent) : undefined,
      error: typeof raw.error === 'string' ? raw.error : undefined,
    };
    this.ackHandlers.forEach((handler) => {
      try { handler(ack); } catch { /* listener isolation */ }
    });
    const pending = this.pendingCommands.get(ack.requestId);
    if (!pending) return;
    // Resolve only terminal acknowledgements. The accepted ack is still
    // available to global listeners but does not end the command promise.
    if (ack.status === 'accepted') return;
    clearTimeout(pending.timer);
    this.pendingCommands.delete(ack.requestId);
    if (ack.status === 'failed') pending.reject(new Error(ack.error ?? 'SweetSocket command failed'));
    else pending.resolve(ack);
  }

  private handleEvent(event: RealtimeEvent): void {
    // Advance the cursor even when a durable replay is a duplicate of an event
    // that arrived live before the disconnect. Otherwise every reconnect would
    // request that same already-seen event forever.
    const sequence = event.sequence ?? event.seq ?? null;
    if (typeof sequence === 'number' && (this.lastSequence === null || sequence > this.lastSequence)) this.lastSequence = sequence;
    if (!event.id || this.seenIds.has(event.id)) return;
    this.seenIds.add(event.id);
    if (this.seenIds.size > DEDUP_CAP) {
      const oldest = this.seenIds.values().next().value;
      if (oldest) this.seenIds.delete(oldest);
    }
    log('received', event.type, event.channel);
    this.dispatch(event);
  }

  private dispatch(event: RealtimeEvent): void {
    const types = [event.type, ...(REALTIME_EVENT_ALIASES[event.type] ?? [])];
    const handlers = new Set<EventHandler>();
    for (const type of types) {
      this.typeHandlers.get(type)?.forEach((handler) => handlers.add(handler));
    }
    handlers.forEach((handler) => { try { handler(event); } catch { /* listener isolation */ } });
    const channelHandlers = this.channelHandlers.get(event.channel);
    channelHandlers?.forEach((handler) => { try { handler(event); } catch { /* listener isolation */ } });
  }

  private emitLifecycle(type: string, payload: Record<string, unknown> = {}): void {
    const event: RealtimeEvent = normalizedEvent({
      id: `${type}:${Date.now()}`,
      type,
      channel: '',
      userId: '',
      payload,
      timestamp: Date.now(),
    });
    this.dispatch(event);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingCommands.clear();
  }

  private rejectQueued(error: Error): void {
    if (!this.queuedCommands.length) return;
    const queued = this.queuedCommands;
    this.queuedCommands = [];
    for (const q of queued) q.reject(error);
  }
}

export const sweetSocket = new SweetSocketClient();
/** Compatibility export. There is exactly one transport singleton. */
export const realtime = sweetSocket;
