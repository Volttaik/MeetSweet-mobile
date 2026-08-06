/**
 * NotificationsContext
 *
 * Responsibilities:
 * 1. Register for push notifications (permissions + Expo push token → backend)
 * 2. Poll the /notifications endpoint for unread count
 * 3. Poll /messages/conversations for total unread message count
 * 4. Surface notifUnread + messageUnread counts app-wide (for badges)
 * 5. Handle foreground notification display
 * 6. Handle notification tap → navigate to the relevant post/profile
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotifications } from '@/services/notifications';
import { getConversations } from '@/services/messages';
import { apiFetch } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

// ─── Notification display while the app is foregrounded ──────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationsContextValue {
  /** Number of unread in-app notifications */
  notifUnread: number;
  /** Total unread messages across all conversations */
  messageUnread: number;
  /** Manually re-fetch both counts right now */
  refresh: () => void;
  /** Decrement notifUnread by n (optimistic mark-read) */
  decrementNotif: (n?: number) => void;
  /** Zero out notifUnread (mark-all-read) */
  clearNotif: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  notifUnread: 0,
  messageUnread: 0,
  refresh: () => {},
  decrementNotif: () => {},
  clearNotif: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

// ─── Push-token registration ──────────────────────────────────────────────────

async function registerPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // simulators don't get push tokens

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MeetSweet',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C45A72',
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

async function sendTokenToBackend(token: string): Promise<void> {
  try {
    const accessToken = await AsyncStorage.getItem('@ms_access_token');
    await apiFetch('/notifications/push-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform: Platform.OS }),
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
  } catch {
    // Best-effort; non-fatal
  }
}

// ─── Route notification tap to the right screen ──────────────────────────────

function handleNotificationTap(notification: Notifications.Notification) {
  const data = notification.request.content.data as Record<string, string> | null;
  if (!data) return;

  const postId = data.post_id ?? data.postId;
  const contentType = data.content_type ?? data.contentType ?? data.type;
  const contentId = data.content_id ?? data.contentId;
  const userId = data.user_id ?? data.userId;
  const conversationId = data.conversation_id ?? data.conversationId;

  if (conversationId) {
    router.push(`/chat/${conversationId}`);
    return;
  }

  if (postId) {
    // Route by content type if available, else default post detail
    if (contentType === 'video') {
      router.push(`/videos/${postId}`);
    } else if (contentType === 'short') {
      router.push('/shorts');
    } else {
      router.push(`/post/${postId}`);
    }
    return;
  }

  if (userId || contentId) {
    const id = userId ?? contentId;
    router.push(`/creator/${id}`);
    return;
  }

  // Fallback: open notifications screen
  router.push('/notifications');
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000; // 30 s

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [notifUnread, setNotifUnread] = useState(0);
  const [messageUnread, setMessageUnread] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const registeredToken = useRef<string | null>(null);
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);

  // ── Fetch both counts ──────────────────────────────────────────────────────
  const fetchCounts = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [notifResult, msgResult] = await Promise.allSettled([
        getNotifications(1),
        getConversations('all'),
      ]);

      if (notifResult.status === 'fulfilled') {
        setNotifUnread(notifResult.value.unreadCount);
      }

      if (msgResult.status === 'fulfilled') {
        const total = msgResult.value.conversations.reduce(
          (sum, c) => sum + (c.unreadCount ?? 0),
          0,
        );
        setMessageUnread(total);
      }
    } catch {
      // Non-fatal — badge just stays stale
    }
  }, [isAuthenticated]);

  // ── Push-token registration (once per login session) ──────────────────────
  useEffect(() => {
    if (!isAuthenticated || registeredToken.current) return;

    registerPushToken().then((token) => {
      if (token) {
        registeredToken.current = token;
        sendTokenToBackend(token);
      }
    });
  }, [isAuthenticated]);

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      setNotifUnread(0);
      setMessageUnread(0);
      return;
    }

    fetchCounts(); // immediate first fetch
    pollTimerRef.current = setInterval(fetchCounts, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isAuthenticated, fetchCounts]);

  // ── Notification listeners ─────────────────────────────────────────────────
  useEffect(() => {
    // Foreground: a notification arrives while the app is open
    notifListenerRef.current = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, string> | null;
      const type = data?.type ?? data?.content_type ?? '';
      if (type === 'message' || type === 'dm') {
        setMessageUnread((n) => n + 1);
      } else {
        setNotifUnread((n) => n + 1);
      }
    });

    // Background/quit: user taps a notification
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationTap(response.notification);
      },
    );

    return () => {
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, []);

  // ── Last-notification-response on cold start ──────────────────────────────
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationTap(response.notification);
    });
  }, []);

  const refresh = useCallback(() => {
    fetchCounts();
  }, [fetchCounts]);

  const decrementNotif = useCallback((n = 1) => {
    setNotifUnread((prev) => Math.max(0, prev - n));
  }, []);

  const clearNotif = useCallback(() => {
    setNotifUnread(0);
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ notifUnread, messageUnread, refresh, decrementNotif, clearNotif }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
