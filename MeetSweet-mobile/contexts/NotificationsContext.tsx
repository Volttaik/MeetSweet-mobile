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
import { resolveNotificationTarget } from '@/lib/notification-nav';
import { T } from '@/constants/theme';
import { pushOnce, whenNavigatorReady } from '@/lib/nav';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { realtime } from '@/services/realtime';

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
  /** Push notification permission status */
  permissionStatus: string | null;
  /** Device push token if registered */
  pushToken: string | null;
  /** Manually re-fetch both counts right now */
  refresh: () => void;
  /**
   * Decrement notifUnread. Pass a STRING notification id to record the local
   * read/deleted transition (so this device's own `notification.read` /
   * `notification.deleted` socket echo is not double-counted), or a NUMBER
   * count for a plain bulk decrement.
   */
  decrementNotif: (idOrCount?: string | number) => void;
  /** Zero out notifUnread (mark-all-read) */
  clearNotif: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  notifUnread: 0,
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

  // Android needs a notification channel. The channel carries the in-app
  // message chime (message_received.wav, bundled via the expo-notifications
  // plugin's `sounds` config) so native notifications sound on-brand instead
  // of the system default. Applies to builds — Expo Go ignores channel sounds.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MeetSweet',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: T.ACCENT,
      sound: 'message_received.wav',
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

  // Single source of truth for destinations — the SAME resolver the in-app
  // notification list uses. "View"/tap only navigates; read state is handled
  // by the Notifications screen when it opens.
  const target = resolveNotificationTarget({
    type: data.type ?? '',
    contentType: data.content_type ?? data.contentType,
    contentId: data.content_id ?? data.contentId,
    postId: data.post_id ?? data.postId,
    videoId: data.video_id ?? data.videoId,
    shortId: data.short_id ?? data.shortId,
    albumId: data.album_id ?? data.albumId,
    privateMessageId: data.private_message_id ?? data.privateMessageId,
    actorId: data.actor_id ?? data.actorId ?? data.username,
    commentId: data.comment_id ?? data.commentId,
    // The server's canonical entity reference — lets tag/mention pushes open
    // the exact post even when only entity_id/entity_type are in the payload.
    entityId: data.entity_id ?? data.entityId,
    entityType: data.entity_type ?? data.entityType,
    data: data as Record<string, unknown>,
  });

  // Never auto-open the notifications list. Every known push type routes to its
  // specific screen above; if the payload is unrecognized we do nothing rather
  // than hijacking the user into the generic list screen.
  if (target) navigate(target as any);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { refreshWallet } = useWallet();
  const [notifUnread, setNotifUnread] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);

  const lastRegisteredUser = useRef<string | null>(null);
  const lastHandledResponseId = useRef<string | null>(null);
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);

  // Notification ids this DEVICE transitioned itself (read/deleted) this
  // session. Used to make the badge idempotent: when our own write is echoed
  // back to us as a socket event, we must not decrement a second time, while
  // OTHER devices still decrement for the same event. Cleared on logout and
  // on a full read-all (the DB is then clean anyway).
  const locallyHandledRef = useRef(new Map<string, 'read' | 'deleted'>());

  // ── Fetch the unread count ───────────────────────────────────────────────
  const fetchCounts = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const notifResult = await getNotifications(1);
      setNotifUnread(notifResult.unreadCount);
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

  // ── 2b. Token rotation ──────────────────────────────────────────────────────
  // In rare situations the push service rolls the device token while the app
  // is running; the old token becomes invalid and pushes to it fail. Listening
  // for the rotation and swapping the state re-triggers the (user, token)-keyed
  // registration above so the backend targets the new token immediately.
  useEffect(() => {
    const sub = Notifications.addPushTokenListener((tokenData) => {
      const t = tokenData.data;
      if (!t) return;
      setPushToken((prev) => (prev === t ? prev : t));
    });
    return () => sub.remove();
  }, []);

  // ── Initial durable hydration ────────────────────────────────────────────
  // SweetSocket owns subsequent badge updates. This one request establishes
  // the baseline after login; reconnect replay handles events after that.
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifUnread(0);
      lastRegisteredUser.current = null;
      locallyHandledRef.current.clear();
      return;
    }
    fetchCounts();
  }, [isAuthenticated, fetchCounts]);



  // ── Notification listeners ─────────────────────────────────────────────────
  useEffect(() => {
    // Foreground: a notification arrives while the app is open. When the
    // SweetSocket connection is live, the same notification also arrives as a
    // durable `notification:new` socket event (and is replayed after a
    // reconnect) — incrementing here TOO would double-count the badge. The
    // push listener is therefore only the FALLBACK for the socket-down case
    // (socket suspended in background / reconnecting), where the OS push is
    // the only signal.
    notifListenerRef.current = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, string> | null;
      const type = data?.type ?? data?.content_type ?? '';
      setNotifUnread((n) => n + 1);
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

  // ── SweetSocket: the badge is live while the app is connected ────────────
  // Every server-side notification write emits a durable event on the
  // recipient's user channel (and replays it after reconnect). `created`
  // increments the badge; `read` / `deleted` / `read_all` decrement it. The
  // `locallyHandledRef` guard keeps each transition idempotent per device, so
  // our own HTTP write echoing back over the socket never double-decrements
  // while another logged-in device still updates correctly.
  useEffect(() => {
    if (!isAuthenticated) return;
    return realtime.on((event) => {
      const p = event.payload as Record<string, unknown>;
      const nid = p.notification_id as string | undefined;

      switch (event.type) {
        case 'notification.created': {
          const notification = (p as { notification?: { type?: string; entity_type?: string | null } }).notification;
          setNotifUnread((n) => n + 1);
          const t = notification?.type ?? '';
          if (t === 'payment' || t === 'purchase' || t === 'wallet' || t === 'referral_reward') {
            refreshWallet();
          }
          break;
        }
        case 'notification.read': {
          if (!nid) break;
          if (locallyHandledRef.current.has(nid)) break; // already counted on this device
          locallyHandledRef.current.set(nid, 'read');
          setNotifUnread((n) => Math.max(0, n - 1));
          break;
        }
        case 'notification.deleted': {
          if (!nid) break;
          if (locallyHandledRef.current.get(nid) === 'deleted') break;
          if (locallyHandledRef.current.get(nid) === 'read') break; // already removed from badge
          locallyHandledRef.current.set(nid, 'deleted');
          // Only decrement once for an unread deletion.
          setNotifUnread((n) => Math.max(0, n - (n > 0 ? 1 : 0)));
          break;
        }
        case 'notification.read_all': {
          locallyHandledRef.current.clear();
          setNotifUnread(0);
          break;
        }
        default:
          break;
      }
    });
  }, [isAuthenticated, refreshWallet]);

  const refresh = useCallback(() => {
    fetchCounts();
  }, [fetchCounts]);

  const decrementNotif = useCallback((idOrCount: string | number = 1) => {
    if (typeof idOrCount === 'string') {
      // A notification id: this device transitioned it locally. Record it so
      // our own socket echo does not double-decrement, then drop one unread.
      locallyHandledRef.current.set(idOrCount, 'read');
      setNotifUnread((prev) => Math.max(0, prev - 1));
      return;
    }
    setNotifUnread((prev) => Math.max(0, prev - (Number(idOrCount) || 0)));
  }, []);

  const clearNotif = useCallback(() => {
    locallyHandledRef.current.clear();
    setNotifUnread(0);
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        notifUnread,
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
