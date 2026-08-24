import AsyncStorage from '@react-native-async-storage/async-storage';
import { realtime } from '@/services/realtime';
import type { SendRoomMessagePayload, RoomMessage } from './room-service';

const OUTBOX_KEY = '@meetsweet_chat_outbox_v1';

function queueKey(userId?: string): string {
  return `${OUTBOX_KEY}_${userId || 'anonymous'}`;
}

export type QueuedMessage = {
  clientMessageId: string;
  chatRoomId: string;
  payload: SendRoomMessagePayload;
  userId?: string;
};

type Waiter = {
  resolve: (message: RoomMessage) => void;
  reject: (error: Error) => void;
};

const waiters = new Map<string, Waiter[]>();
let flushPromise: Promise<void> | null = null;

async function readQueue(userId?: string): Promise<QueuedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as QueuedMessage[] : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedMessage[], userId?: string): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(queueKey(userId));
    return;
  }
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
}

function resolveWaiters(clientMessageId: string, message: RoomMessage): void {
  const pending = waiters.get(clientMessageId) ?? [];
  waiters.delete(clientMessageId);
  pending.forEach(({ resolve }) => resolve(message));
}

function rejectWaiters(clientMessageId: string, error: Error): void {
  const pending = waiters.get(clientMessageId) ?? [];
  waiters.delete(clientMessageId);
  pending.forEach(({ reject }) => reject(error));
}

/**
 * Queue a message before attempting transport. The caller can render its
 * optimistic message immediately and await this promise without exposing a
 * retry action to the user.
 */
export async function enqueueChatMessage(
  item: QueuedMessage,
): Promise<RoomMessage> {
  const queue = await readQueue(item.userId);
  if (!queue.some((entry) => entry.clientMessageId === item.clientMessageId)) {
    queue.push(item);
    await writeQueue(queue, item.userId);
  }

  const result = new Promise<RoomMessage>((resolve, reject) => {
    const entries = waiters.get(item.clientMessageId) ?? [];
    entries.push({ resolve, reject });
    waiters.set(item.clientMessageId, entries);
  });
  void flushChatOutbox();
  return result;
}

/** Flushes oldest-first over SweetSocket. A transport failure leaves the item. */
export async function flushChatOutbox(): Promise<void> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    try {
      if (!realtime.isOpen()) return;
      const keys = await AsyncStorage.getAllKeys();
      const userIds = keys
        .filter((key) => key.startsWith(`${OUTBOX_KEY}_`))
        .map((key) => key.slice(`${OUTBOX_KEY}_`.length));
      const queue = (await Promise.all(userIds.map((userId) => readQueue(userId)))).flat();
      for (const item of queue) {
        if (!realtime.isOpen()) break;
        try {
          const ack = await realtime.emit(
            'message.send',
            {
              body: item.payload.body,
              mediaUrl: item.payload.mediaUrl,
              mediaType: item.payload.mediaType,
              caption: item.payload.caption,
              fileName: item.payload.fileName,
              fileSize: item.payload.fileSize,
              mimeType: item.payload.mimeType,
              audioDuration: item.payload.audioDuration,
              fileType: item.payload.fileType,
              isVoiceNote: item.payload.isVoiceNote,
              replyToId: item.payload.replyToId,
              participantId: item.payload.participantId,
            },
            {
              channel: `chat:${item.chatRoomId}`,
              clientMessageId: item.clientMessageId,
            },
          );
          const raw = ack.event?.payload?.message;
          if (!raw) throw new Error('SweetSocket did not return the queued message');
          const message = raw as RoomMessage;
          const itemQueue = await readQueue(item.userId);
          const next = itemQueue.filter((entry) => entry.clientMessageId !== item.clientMessageId);
          await writeQueue(next, item.userId);
          resolveWaiters(item.clientMessageId, message);
        } catch (error) {
          if (!realtime.isOpen()) break;
          // A server-side validation/authorization failure is terminal. Do not
          // spin forever or present a retry prompt; transport failures remain
          // queued for the next reconnect.
          const message = error instanceof Error ? error : new Error('Queued message failed');
          const transportFailure = /not connected|timed out|disconnected|socket/i.test(message.message);
          if (!transportFailure) {
            const itemQueue = await readQueue(item.userId);
            const next = itemQueue.filter((entry) => entry.clientMessageId !== item.clientMessageId);
            await writeQueue(next, item.userId);
            rejectWaiters(item.clientMessageId, message);
          }
          break;
        }
      }
    } finally {
      flushPromise = null;
    }
  })();
  return flushPromise;
}

export async function clearChatOutbox(userId?: string): Promise<void> {
  const queue = await readQueue(userId);
  await writeQueue([], userId);
  queue.forEach((item) => rejectWaiters(item.clientMessageId, new Error('Chat session ended')));
}

// The outbox is transport-driven, not network-probe-driven. It flushes as soon
// as SweetSocket becomes usable after a reconnect.
realtime.onStatus((status) => {
  if (status === 'open') void flushChatOutbox();
});
