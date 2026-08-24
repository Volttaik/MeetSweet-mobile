/**
 * SweetSocket Event Map (mobile) — must stay in sync with the server's
 * lib/realtime/sweet-socket/event-map.ts.
 *
 * Canonical event names use the `domain:event` form (messages:upsert,
 * chats:update, …). REALTIME_EVENT_ALIASES maps each arriving event type to the
 * legacy handler names that must ALSO fire, so existing listeners keep working
 * while the protocol migrates to canonical names.
 */

export const REALTIME_EVENT = {
  // ── Connection / session ──────────────────────────────────────────────────
  connectionUpdate: 'connection:update',
  connectionOpen: 'auth:connected',
  connectionReady: 'auth:authenticated',
  connectionAuthenticated: 'auth:authenticated',
  connectionClosed: 'auth:disconnected',
  connectionError: 'system:error',
  connectionReconnecting: 'system:reconnecting',
  connectionReconnected: 'system:reconnected',
  authConnected: 'auth:connected',
  authAuthenticated: 'auth:authenticated',
  authSessionExpired: 'auth:session:expired',
  authLogout: 'auth:logout',
  authDisconnected: 'auth:disconnected',
  sessionUpdate: 'session:update',
  sessionExpired: 'session:expired',

  // ── Messages (canonical) ──────────────────────────────────────────────────
  messagesUpsert: 'messages:upsert',
  messagesUpdate: 'messages:update',
  messagesDelete: 'messages:delete',
  messagesReaction: 'messages:reaction',
  messageReceipt: 'message:receipt',
  messageRead: 'message:read',
  messageFailed: 'message:failed',
  // Legacy spellings (same wire values as canonical aliases).
  chatMessageCreated: 'message:created',
  chatMessageNew: 'message:created',
  chatMessageAck: 'message:acknowledged',
  chatMessageFailed: 'message:failed',
  chatMessageUpdated: 'message:updated',
  chatMessageDeleted: 'message:deleted',
  chatMessageRead: 'message:read',
  chatReactionUpdated: 'chat.reaction.updated',

  // ── Chats ─────────────────────────────────────────────────────────────────
  chatsUpsert: 'chats:upsert',
  chatsUpdate: 'chats:update',
  chatsDelete: 'chats:delete',
  chatOpen: 'chat:open',
  chatClose: 'chat:close',
  chatClear: 'chat:clear',
  chatHistory: 'chat:history',
  historySet: 'history:set',
  // A legacy pre-deterministic room was adopted to its canonical derived id;
  // re-key local state from legacyRoomId → roomId.
  roomMigrated: 'room:migrated',

  // ── Ephemeral state ───────────────────────────────────────────────────────
  chatTypingStarted: 'typing:start',
  chatTypingStopped: 'typing:stop',
  chatRecordingStarted: 'voice:start',
  chatRecordingStopped: 'voice:stop',
  chatPresenceUpdated: 'presence:updated',
  chatPresenceOffline: 'presence:offline',
  presenceOnline: 'presence:online',
  presenceOffline: 'presence:offline',
  presenceUpdated: 'presence:updated',

  // ── Social ────────────────────────────────────────────────────────────────
  postCreated: 'post:created',
  postUpdated: 'post:updated',
  postDeleted: 'post:deleted',
  postCommentCreated: 'comment:created',
  postCommentUpdated: 'comment:updated',
  postCommentDeleted: 'comment:deleted',
  postLikeCreated: 'like:created',
  postLikeRemoved: 'like:removed',
  postLikeUpdated: 'like:updated',
  shareCreated: 'share:created',
  albumPurchased: 'album:purchased',
  albumLiked: 'album:liked',
  albumUnliked: 'album:unliked',

  // ── Notifications ─────────────────────────────────────────────────────────
  notificationCreated: 'notification:new',
  notificationRead: 'notification:read',
  notificationReadAll: 'notification:read-all',
  notificationDeleted: 'notification:delete',
  notificationCount: 'notification:count',

  // ── Wallet / subscriptions ────────────────────────────────────────────────
  subscriptionCreated: 'subscription:created',
  subscriptionCancelled: 'subscription:cancelled',
  subscriptionCountUpdated: 'subscription:updated',
  walletUpdated: 'wallet:updated',
  balanceUpdated: 'balance:updated',
  transactionCreated: 'transaction:created',
  transactionUpdated: 'transaction:updated',
  transactionCompleted: 'transaction:completed',
  transactionFailed: 'transaction:failed',

  // ── Structured errors ─────────────────────────────────────────────────────
  errorAuth: 'error:auth',
  errorPermission: 'error:permission',
  errorValidation: 'error:validation',
  errorRateLimit: 'error:rate-limit',
  errorServer: 'error:server',
} as const;

/**
 * Maps an ARRIVING event type to additional handler names that must also fire.
 * Canonical names fan out to the legacy handler names registered by existing
 * screens; legacy dotted spellings still map to colon names during rollout.
 */
export const REALTIME_EVENT_ALIASES: Record<string, string[]> = {
  // Canonical messages → legacy handlers.
  'messages:upsert': ['message:created', 'chat.message.created', 'message.new'],
  'messages:update': ['message:updated', 'chat.message.updated'],
  'messages:delete': ['message:deleted', 'chat.message.deleted'],
  'messages:reaction': ['chat.reaction.updated', 'reaction:updated'],
  'message:receipt': ['message:acknowledged', 'message.ack'],
  'message:read': ['chat.message.read'],
  'message:failed': ['message.failed', 'chat.message.failed'],
  'chat:clear': [],
  'chat:open': [],
  'chat:close': [],
  'history:set': [],

  // Legacy dotted spellings (old servers during rollout).
  'message.new': ['message:created'],
  'message.ack': ['message:acknowledged'],
  'chat.message.created': ['message:created'],
  'chat.message.updated': ['message:updated'],
  'chat.message.deleted': ['message:deleted'],
  'chat.message.read': ['message:read'],
  'typing.start': ['typing:start'],
  'typing.stop': ['typing:stop'],
  'recording.start': ['voice:start'],
  'recording.stop': ['voice:stop'],
  'presence.online': ['presence:online', 'presence:updated'],
  'presence.offline': ['presence:offline', 'presence:updated'],
  'presence:online': ['presence:updated'],
  'presence:offline': ['presence:updated'],
  'comment.created': ['comment:created'],
  'comment.updated': ['comment:updated'],
  'comment.deleted': ['comment:deleted'],
  'post.comment.created': ['comment:created'],
  'post.comment.updated': ['comment:updated'],
  'post.comment.deleted': ['comment:deleted'],
  'post.like.updated': ['like:updated'],
  'like:created': ['like:updated'],
  'like:removed': ['like:updated'],
  'notification.new': ['notification:new'],
  'notification.created': ['notification:new'],
  'notification.read_all': ['notification:read-all'],
  'subscription.count_updated': ['subscription:updated'],
  'wallet.updated': ['wallet:updated'],
  'purchase.completed': ['album:purchased'],
};
