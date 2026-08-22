/**
 * NotificationsContext
 *
 * Responsibilities:
 * 1. Register for device/Expo push notifications (permissions + token → live backend)
 * 2. Hydrate unread counts once per authenticated session
 * 3. Apply notification/message events from SweetSocket to local badge state
 * 4. Surface notifUnread + messageUnread counts app-wide (for badges)
 * 5. Handle foreground notification display without hijacking navigation
 * 6. Route user on explicit notification tap to the target destination
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { getNotifications, registerPushTokenToBackend } from '@/services/notifications';
import { getChatRoomList } from '@/services/room-service';
import { realtime, REALTIME_EVENT } from '@/services/realtime';
import { pushOnce, whenNavigatorReady } from '@/lib/nav';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { usePostActions } from '@/contexts/PostActionsContext';

const LAST_HANDLED_NOTIF_KEY = '@ms_last_handled_notif_id';

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
  /** Total unread messages across all chat rooms */
  messageUnread: number;
  /** Push notification permission status */
  permissionStatus: string | null;
  /** Device push token if registered */
  pushToken: string | null;
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
  permissionStatus: null,
  pushToken: null,
  refresh: () => {},
  decrementNotif: () => {},
  clearNotif: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

// ─── Push-token registration ──────────────────────────────────────────────────

async function registerPushToken(): Promise<{ token: string | null; status: string }> {
  if (!Device.isDevice && Platform.OS !== 'web') {
    return { token: null, status: 'simulator' };
  }

  let finalStatus = 'undetermined';
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    finalStatus = existing;
    if (existing === 'undetermined') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
  } catch {
    return { token: null, status: 'denied' };
  }

  if (finalStatus !== 'granted') {
    return { token: null, status: finalStatus };
  }

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MeetSweet',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C45A72',
    }).catch(() => {});
  }

  try {
    // Pass the EAS projectId so the token is bound to the installed app,
    // NOT to Expo Go. Without this, standalone builds and Expo Go produce
    // the same-form token and notifications go to the wrong client.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    // Standalone MeetSweet builds must use the EAS project id. Calling without
    // it can bind a token to Expo Go, which silently sends notifications to the
    // wrong installation.
    if (!projectId) return { token: null, status: finalStatus };
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId }).catch(() => null);
    return { token: tokenData?.data ?? null, status: finalStatus };
  } catch {
    return { token: null, status: finalStatus };
  }
}

// ─── Route notification tap to the right screen ──────────────────────────────

/**
 * Navigate from a notification tap. Two guards prevent the "post opens but is
 * non-interactive" failure:
 *   1. whenNavigatorReady — a tap can fire while the app is still cold-starting
 *      (the root Redirect to (tabs) is settling) or resuming from background;
 *      pushing during that window mounts the screen on an inconsistent stack,
 *      leaving it rendered but dead to touches. The gate defers the push until
 *      the navigator is marked ready.
 *   2. pushOnce — the same tap can be delivered to BOTH the response listener
 *      and the cold-start handler; the dedupe prevents double-stacking.
 */
function navigate(href: Parameters<typeof router.push>[0]) {
  whenNavigatorReady(() => pushOnce(href as any));
}

function handleNotificationTap(notification: Notifications.Notification) {
  const data = (notification.request.content.data ?? {}) as Record<string, string>;

  const type = data.type ?? '';
  const postId = data.post_id ?? data.postId;
  const contentType = data.content_type ?? data.contentType ?? type;
  const contentId = data.content_id ?? data.contentId;
  const actorId = data.actor_id ?? data.actorId ?? data.username;
  const chatRoomId = data.chat_room_id ?? data.chatRoomId;

  // message / dm → open the chat room
  if (type === 'message' || type === 'dm' || chatRoomId) {
    if (chatRoomId) {
      navigate(`/chat-room/${chatRoomId}`);
      return;
    }
  }

  // wallet / payout → open wallet
  if (type === 'wallet' || type === 'payout' || type === 'payment' || type === 'purchase' || type === 'referral_reward') {
    navigate('/wallet');
    return;
  }

  // subscribe / creator → open profile
  if (type === 'subscribe' || type === 'creator' || type === 'subscription') {
    if (actorId) {
      navigate(`/creator/${actorId}`);
      return;
    }
  }

  // new_post / mention → route by content_type using content_id
  if (type === 'new_post' || type === 'mention' || contentId) {
    const id = contentId ?? postId;
    if (id) {
      if (contentType === 'video') {
        navigate(`/videos/${id}`);
      } else if (contentType === 'short') {
        navigate({ pathname: '/shorts', params: { startId: id } } as any);
      } else if (contentType === 'album') {
        navigate(`/album/${id}`);
      } else {
        navigate(`/post/${id}`);
      }
      return;
    }
  }

  // like / comment → route by content_type using post_id
  if (postId) {
    if (contentType === 'video') {
      navigate(`/videos/${postId}`);
    } else if (contentType === 'short') {
      navigate({ pathname: '/shorts', params: { startId: postId } } as any);
    } else if (contentType === 'album') {
      navigate(`/album/${postId}`);
    } else {
      navigate(`/post/${postId}`);
    }
    return;
  }

  // Never auto-open the notifications list. Every known push type routes to its
  // specific screen above; if the payload is unrecognized we do nothing rather
  // than hijacking the user into the generic list screen.
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { refreshWallet, setBalance } = useWallet();
  const { markLiked, setCommentCount } = usePostActions();
  const [notifUnread, setNotifUnread] = useState(0);
  const [messageUnread, setMessageUnread] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);

  const lastRegisteredUser = useRef<string | null>(null);
  const lastHandledResponseId = useRef<string | null>(null);
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);

  // ── Fetch both counts ──────────────────────────────────────────────────────
  const fetchCounts = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [notifResult, msgResult] = await Promise.allSettled([
        getNotifications(1),
        getChatRoomList('all'),
      ]);

      if (notifResult.status === 'fulfilled') {
        setNotifUnread(notifResult.value.unreadCount);
      }

      if (msgResult.status === 'fulfilled') {
        const total = msgResult.value.chatRooms.reduce(
          (sum, c) => sum + (c.unreadCount ?? 0),
          0,
        );
        setMessageUnread(total);
      }
    } catch {
      // Non-fatal — badge just stays stale
    }
  }, [isAuthenticated]);

  // ── 1. Request permission + obtain the token ONCE at launch ──────────────────────────────────────
  // The system prompt must appear on first install (not delayed until login),
  // so this runs independently of the auth state.
  useEffect(() => {
    let cancelled = false;
    registerPushToken().then(({ token, status }) => {
      if (cancelled) return;
      setPermissionStatus(status);
      if (token) setPushToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── 2. Register the token with the backend once a session exists ─────────────────────────────────
  // The registration key is (user, token): a REINSTALL (or cleared app data)
  // produces a fresh device token for the same user, and that new token must
  // be registered too — otherwise pushes keep going to the old, dead token.
  useEffect(() => {
    if (!isAuthenticated || !user?.id || !pushToken) return;
    const regKey = `${user.id}:${pushToken}`;
    if (lastRegisteredUser.current === regKey) return;

    lastRegisteredUser.current = regKey;
    registerPushTokenToBackend(pushToken, Platform.OS);
  }, [isAuthenticated, user?.id, pushToken]);

  // ── Initial durable hydration ────────────────────────────────────────────
  // SweetSocket owns subsequent badge updates. This one request establishes
  // the baseline after login; reconnect replay handles events after that.
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifUnread(0);
      setMessageUnread(0);
      lastRegisteredUser.current = null;
      return;
    }
    fetchCounts();
  }, [isAuthenticated, fetchCounts]);

  // ── Realtime: private user channel ───────────────────────────────────────
  // Notification rows (written server-side through the single createNotification
  // choke point) arrive instantly on the socket: the badge updates live, and
  // confirmed wallet changes trigger a balance refresh.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const channel = `user:${user.id}`;
    realtime.subscribe(channel);

    const offNotif = realtime.on(REALTIME_EVENT.notificationCreated, (event) => {
      const p = event.payload as { notification?: { type?: string } };
      const type = p.notification?.type;
      if (type === 'message' || type === 'dm') {
        setMessageUnread((n) => n + 1);
      } else {
        setNotifUnread((n) => n + 1);
      }
    });
    const applyWallet = (event: import('@/services/realtime').RealtimeEvent) => {
      const p = event.payload as { balance?: number; newBalance?: number };
      const balance = p.balance ?? p.newBalance;
      if (typeof balance === 'number') setBalance(balance);
      else refreshWallet().catch(() => {});
    };
    const offWallet = realtime.on(REALTIME_EVENT.walletUpdated, applyWallet);
    const offBalance = realtime.on(REALTIME_EVENT.balanceUpdated, applyWallet);

    const offLike = realtime.on(REALTIME_EVENT.postLikeUpdated, (event) => {
      const p = event.payload as { postId?: string; likeCount?: number; liked?: boolean };
      const postId = p.postId ?? event.resourceId;
      if (postId && typeof p.likeCount === 'number') markLiked(postId, Boolean(p.liked), p.likeCount);
    });
    const offComment = realtime.on(REALTIME_EVENT.postCommentCreated, (event) => {
      const p = event.payload as { commentCount?: number };
      const postId = event.channel.replace(/^post:/, '');
      if (postId && typeof p.commentCount === 'number') setCommentCount(postId, p.commentCount);
    });

    return () => {
      realtime.unsubscribe(channel);
      offNotif(); offWallet(); offBalance(); offLike(); offComment();
    };
  }, [isAuthenticated, user?.id, refreshWallet]);

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
      if (data?.wallet || type === 'wallet' || type === 'payment' || type === 'referral_reward') {
        // WalletProvider owns the balance; this makes a foreground reward or
        // payment reflect in the header without waiting for a restart.
        refreshWallet();
      }
    });

    // Background/quit: user taps a notification
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        // Only an explicit tap on the notification body is a navigation intent.
        // Custom action buttons and dismissals must never navigate the app.
        if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

        const id = response.notification.request.identifier;
        if (id && lastHandledResponseId.current === id) return;
        if (id) {
          lastHandledResponseId.current = id;
          AsyncStorage.setItem(LAST_HANDLED_NOTIF_KEY, id).catch(() => {});
        }

        handleNotificationTap(response.notification);
        // Consume the response so a later cold start never re-fires it.
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      },
    );

    return () => {
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, [refreshWallet]);

  // ── Cold start response handling (guarded against double-handling) ─────────
  useEffect(() => {
    if (!isAuthenticated) return;

    (async () => {
      try {
        const storedLastId = await AsyncStorage.getItem(LAST_HANDLED_NOTIF_KEY);
        const response = await Notifications.getLastNotificationResponseAsync();
        if (!response) return;

        const id = response.notification.request.identifier;
        const alreadyHandled = id
          ? id === storedLastId || lastHandledResponseId.current === id
          : false;

        // Consume the stored response on every launch so it can never re-fire
        // on a later cold start (the "notification screen opens after a while"
        // bug). Clear before deciding whether to route.
        await Notifications.clearLastNotificationResponseAsync().catch(() => {});

        if (alreadyHandled || !id) return;

        lastHandledResponseId.current = id;
        await AsyncStorage.setItem(LAST_HANDLED_NOTIF_KEY, id);

        // Only handle if action was default tap AND has target payload data
        if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          handleNotificationTap(response.notification);
        }
      } catch {
        // Non-fatal
      }
    })();
  }, [isAuthenticated]);

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
      value={{
        notifUnread,
        messageUnread,
        permissionStatus,
        pushToken,
        refresh,
        decrementNotif,
        clearNotif,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
