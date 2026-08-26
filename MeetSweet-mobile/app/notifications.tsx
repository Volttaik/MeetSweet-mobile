import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MsShimmer } from '@/components/MsShimmer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowBendUpLeft,
  ArrowDown,
  ArrowLeft,
  ArrowsClockwise,
  At,
  Bell,
  CaretDown,
  CaretUp,
  ChatCircle,
  CheckCircle,
  CurrencyNgn,
  Gift,
  Heart,
  PaperPlaneTilt,
  Sparkle,
  Trash,
  UserPlus,
  WarningCircle,
} from 'phosphor-react-native';
import type { IconProps } from 'phosphor-react-native';
import { router, Redirect } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import { T, alpha } from '@/constants/theme';
import { GradientText } from '@/components/GradientText';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmptyState } from '@/components/MsEmptyState';
import { toast } from '@/components/MsToast';
import {
  getNotifications,
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
  normalizeNotification,
  type Notification,
} from '@/services/notifications';
import { resolveNotificationTarget } from '@/lib/notification-nav';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useScrollMotion } from '@/lib/scroll-motion';
import { realtime, type RealtimeEvent } from '@/services/realtime';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupNotifications(items: Notification[]) {
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const earlier: Notification[] = [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);

  for (const n of items) {
    const d = new Date(n.createdAt);
    if (isNaN(d.getTime())) {
      earlier.push(n);
      continue;
    }
    if (d >= startOfToday) today.push(n);
    else if (d >= startOfYesterday) yesterday.push(n);
    else earlier.push(n);
  }

  return { today, yesterday, earlier };
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function notificationMessage(n: Notification): string {
  if (n.body && n.body.trim().length > 0) return n.body.trim();
  const fallback: Record<string, string> = {
    like: 'liked your post',
    comment: 'commented on your post',
    reply: 'replied to your comment',
    follow: 'started following you',
    subscribe: 'just subscribed to you',
    new_post: 'posted something new',
    mention: 'tagged you in a post',
    message: 'sent you a message',
    payment: 'sent you a payment',
    private_message: 'sent you a private message',
    private_message_reply: 'replied to your private message',
    withdrawal: 'updated your withdrawal',
    referral_reward: 'sent you a referral reward',
    subscription_renewed: 'renewed your subscription',
    subscription_renewal_failed: 'your subscription renewal failed',
  };
  return fallback[n.type] ?? 'sent you a notification';
}

// ─── Per-type icon + accent (notification type at a glance) ──────────────────

type MetaIcon = React.ComponentType<IconProps>;

function notifMeta(type: string): { Icon: MetaIcon; color: string } {
  switch (type) {
    case 'like': return { Icon: Heart, color: T.PRIMARY_LIGHT };
    case 'comment': return { Icon: ChatCircle, color: T.PRIMARY };
    case 'reply': return { Icon: ArrowBendUpLeft, color: T.PRIMARY };
    case 'subscribe': return { Icon: UserPlus, color: T.ACCENT };
    case 'new_post': return { Icon: Sparkle, color: T.ACCENT };
    case 'mention': return { Icon: At, color: T.PRIMARY_LIGHT };
    case 'payment':
    case 'purchase': return { Icon: CurrencyNgn, color: T.SUCCESS };
    case 'private_message':
    case 'private_message_reply': return { Icon: PaperPlaneTilt, color: T.PRIMARY_LIGHT };
    case 'withdrawal': return { Icon: ArrowDown, color: T.INFO };
    case 'referral_reward': return { Icon: Gift, color: T.SUCCESS };
    case 'subscription_renewed': return { Icon: CheckCircle, color: T.SUCCESS };
    case 'subscription_renewal_failed': return { Icon: WarningCircle, color: T.ERROR };
    default: return { Icon: Bell, color: T.TEXT_2 };
  }
}

/** Content-type label used by the preview strip on content notifications. */
function contentLabel(contentType?: string): string {
  const t = contentType ?? '';
  if (t === 'video') return 'Video';
  if (t === 'short') return 'Short';
  if (t === 'album') return 'Album';
  return 'Post';
}

// ─── Notification card ────────────────────────────────────────────────────────
//
// Three independent responsibilities, never mixed:
//   • READ STATE  — set by the screen on open (auto read-all); the card only
//                   READS it to style the unread accent.
//   • PREVIEW     — the chevron expands compact per-type preview content.
//   • VIEW        — navigates to the source content; has NOTHING to do with
//                   read state.

function NotifRow({
  item,
  onPress,
  onDelete,
}: {
  item: Notification;
  onPress: (n: Notification) => void;
  onDelete: (n: Notification) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const actorName = item.actor?.name ?? 'MeetSweet';
  const actorInitials = initials(actorName);
  const actorAvatar = item.actor?.avatarUrl ?? undefined;
  const meta = notifMeta(item.type);
  const data = item.data ?? {};

  const isContent = ['like', 'comment', 'reply', 'mention', 'new_post'].includes(item.type);
  const isSubscribe = item.type === 'subscribe';
  const isWallet = [
    'payment',
    'purchase',
    'withdrawal',
    'referral_reward',
    'subscription_renewed',
    'subscription_renewal_failed',
  ].includes(item.type);
  const isMessage = item.type === 'private_message' || item.type === 'private_message_reply';
  const previewLabel = isContent
    ? contentLabel(item.contentType ?? (data.content_type as string | undefined))
    : isSubscribe
      ? 'Creator profile'
      : isWallet
        ? 'Wallet'
        : isMessage
          ? 'Message thread'
          : null;

  // Does the payload carry actual preview content worth expanding?
  // (thumbnail/caption for content, message text for private messages).
  const preview = item.preview;
  const hasExpandable =
    !!preview &&
    (!!preview.thumbnail || !!preview.title || !!preview.caption || !!preview.body);

  const toggleExpand = () => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpanded((e) => !e);
  };

  return (
    <TouchableOpacity
      style={[styles.card, !item.isRead && styles.cardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      {/* Unread gradient accent bar */}
      {!item.isRead ? (
        <View style={styles.unreadBar}>
          <BrandGradientFill />
        </View>
      ) : null}

      {/* Actor avatar + type badge */}
      <View style={styles.avatarWrap}>
        <MsAvatar size={44} initials={item.actor ? actorInitials : '!'} imageUri={actorAvatar} />
        <View style={[styles.typeBadge, { backgroundColor: meta.color }]}>
          <meta.Icon size={10} color="#FFFFFF" weight="bold" />
        </View>
      </View>

      {/* Description + time + contextual preview */}
      <View style={styles.cardContent}>
        <Text style={styles.cardBody} numberOfLines={2}>
          <Text style={styles.cardActor}>{actorName} </Text>
          {notificationMessage(item)}
        </Text>
        <Text style={styles.cardTime}>{formatTime(item.createdAt)}</Text>

        {/* Expandable preview content (only when the payload has some) */}
        {hasExpandable && expanded ? (
          <View style={styles.previewBody}>
            {preview.thumbnail ? (
              <Image
                source={{ uri: preview.thumbnail }}
                style={styles.previewThumb}
                resizeMode="cover"
              />
            ) : null}
            {preview.body ? (
              <Text style={styles.previewTextBody} numberOfLines={3}>
                {preview.body}
              </Text>
            ) : null}
            {preview.title || preview.caption ? (
              <Text style={styles.previewTextBody} numberOfLines={2}>
                {preview.caption ?? preview.title}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Preview label + expand chevron + View */}
        <View style={styles.preview}>
          {hasExpandable ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                toggleExpand();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Collapse preview' : 'Expand preview'}
            >
              {expanded ? (
                <CaretUp size={13} color={T.TEXT_2} weight="bold" />
              ) : (
                <CaretDown size={13} color={T.TEXT_2} weight="bold" />
              )}
            </TouchableOpacity>
          ) : null}
          {previewLabel ? (
            <Text style={styles.previewText} numberOfLines={1}>{previewLabel}</Text>
          ) : null}
          <View style={styles.viewChip}>
            <BrandGradientFill />
            <Text style={styles.viewChipText}>View</Text>
          </View>
        </View>
      </View>

      {!item.isRead ? <View style={styles.unreadDot} /> : null}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={(e) => {
          e.stopPropagation();
          onDelete(item);
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Delete notification"
      >
        <Trash size={15} color={T.TEXT_3} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function NotifGroup({
  title,
  items,
  onPress,
  onDelete,
}: {
  title: string;
  items: Notification[];
  onPress: (n: Notification) => void;
  onDelete: (n: Notification) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      {items.map((item) => (
        <NotifRow key={item.id} item={item} onPress={onPress} onDelete={onDelete} />
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { clearNotif, refresh: refreshCounts } = useNotifications();

  const load = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await getNotifications();
      setNotifications(data.notifications);

      // Opening the Notification screen IS the acknowledgement: auto-mark the
      // unread notifications as read, immediately (no manual "mark read"
      // button, no checkmark, and View never touches read state). The server
      // is updated best-effort in the background; the UI reflects read state
      // instantly so the unread accents disappear.
      if (data.unreadCount > 0) {
        setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true, read: true })));
        clearNotif();
        markAllNotificationsRead().catch(() => {});
      }
      refreshCounts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshCounts, clearNotif]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Realtime (SweetSocket): the list is live, not just the badge ─────────
  // The DB remains authoritative (load() on mount + pull-to-refresh); socket
  // events only update rows in place. Dedup by id keeps replay-after-reconnect
  // and the same device's own HTTP writes from double-adding rows. This screen
  // subscribes through the ONE global connection — no second socket.
  useEffect(() => {
    if (!isAuthenticated) return;
    return realtime.on((event: RealtimeEvent) => {
      const p = event.payload as Record<string, unknown>;
      const nid = p.notification_id as string | undefined;

      switch (event.type) {
        case 'notification.created': {
          const notif = (p.notification ?? null) as Record<string, unknown> | null;
          if (!notif?.id) break;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === notif.id)) return prev;
            const row = normalizeNotification(notif);
            return [row, ...prev].slice(0, 100);
          });
          // The user is ALREADY on the screen — being on the screen is the
          // acknowledgement, so a live arrival is read immediately (same rule
          // as on open). The server emits notification.read over the socket;
          // the Context reconciles the badge idempotently.
          markNotificationRead(String(notif.id)).catch(() => {});
          setNotifications((prev) =>
            prev.map((x) => (x.id === notif.id ? { ...x, isRead: true, read: true } : x)),
          );
          break;
        }
        case 'notification.read': {
          if (!nid) break;
          setNotifications((prev) =>
            prev.map((x) => (x.id === nid ? { ...x, isRead: true, read: true } : x)),
          );
          break;
        }
        case 'notification.deleted': {
          if (!nid) break;
          setNotifications((prev) => prev.filter((x) => x.id !== nid));
          break;
        }
        case 'notification.read_all': {
          setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true, read: true })));
          break;
        }
        default:
          break;
      }
    });
  }, [isAuthenticated]);

  // VIEW = navigate to the source content. Deliberately does NOT touch read
  // state (read state is handled when the screen opens) and does NOT need to.
  const handlePress = (n: Notification) => {
    const data = n.data || {};
    const target = resolveNotificationTarget({
      type: n.type,
      contentType: n.contentType ?? undefined,
      contentId: n.contentId ?? undefined,
      postId: n.postId ?? undefined,
      videoId: n.videoId ?? undefined,
      shortId: n.shortId ?? undefined,
      albumId: n.albumId ?? undefined,
      actorId: n.actor?.id ?? undefined,
      // Server entity reference fallback — tag notifications open their post.
      entityId: n.entityId ?? undefined,
      entityType: n.entityType ?? undefined,
      data,
    });
    if (target) router.push(target as any);
  };

  const handleDelete = async (n: Notification) => {
    try {
      await deleteNotification(n.id);
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      // Delete is independent of read state: the server emits notification.deleted
      // and the socket handler in the Context reconciles the badge idempotently.
    } catch {
      toast.error('Failed to delete notification');
    }
  };

  const { today, yesterday, earlier } = groupNotifications(notifications);

  // Authenticated screen only — a logged-out visit (stale navigation history
  // or a direct web URL) must land on Login, never a placeholder shell.
  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: T.BG }} />;
  }
  if (!isAuthenticated) {
    return <Redirect href="/auth" />;
  }

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color={T.TEXT} />
        </TouchableOpacity>
        <GradientText text="Notifications" style={styles.headerTitle} />
        {/* No manual "mark all read" control: opening this screen IS the
            acknowledgement, so unread notifications are marked read
            automatically on load. */}
      </View>

      {loading ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.shimmerRow}>
              <MsShimmer width={42} height={42} borderRadius={21} />
              <View style={{ flex: 1, gap: 7 }}>
                <MsShimmer width="75%" height={12} />
                <MsShimmer width="45%" height={10} />
              </View>
              <MsShimmer width={36} height={10} />
            </View>
          ))}
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.7}>
            <ArrowsClockwise size={16} color={T.TEXT} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : notifications.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={T.TEXT_2}
            />
          }
        >
          <MsEmptyState
            title="You're all caught up"
            message="When someone likes your post, subscribes to you, or messages you — it'll show up here."
          />
        </ScrollView>
      ) : (
        <ScrollView
          {...useScrollMotion()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={T.TEXT_2}
            />
          }
        >
          <NotifGroup title="Today" items={today} onPress={handlePress} onDelete={handleDelete} />
          <NotifGroup title="Yesterday" items={yesterday} onPress={handlePress} onDelete={handleDelete} />
          <NotifGroup title="Earlier" items={earlier} onPress={handlePress} onDelete={handleDelete} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: T.BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
  },
  shimmerRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
  },
  retryText: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },

  groupHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  groupTitle: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },

  // ── Notification cards ────────────────────────────────────────────────────
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
    overflow: 'hidden',
  },
  cardUnread: {
    backgroundColor: alpha(T.PRIMARY, 0.07),
    borderColor: alpha(T.PRIMARY_LIGHT, 0.28),
  },
  unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  avatarWrap: { position: 'relative' },
  typeBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: T.SURFACE,
  },
  cardContent: { flex: 1, gap: 3 },
  cardBody: {
    fontSize: 13.5,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 19,
  },
  cardActor: { fontFamily: T.FONT.bold, color: T.TEXT },
  cardTime: {
    fontSize: 11.5,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  previewText: {
    color: T.TEXT_2,
    fontSize: 11.5,
    fontFamily: T.FONT.medium,
    flexShrink: 1,
  },
  viewChip: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  viewChipText: { color: '#FFFFFF', fontSize: 10.5, fontFamily: T.FONT.bold },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: T.PRIMARY_LIGHT,
    marginTop: 4,
    flexShrink: 0,
  },
  previewBody: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER,
    overflow: 'hidden',
    padding: 8,
  },
  previewThumb: {
    width: 56,
    height: 56,
    borderRadius: T.RADIUS.sm,
    backgroundColor: T.SURFACE_2,
  },
  previewTextBody: {
    flex: 1,
    color: T.TEXT_2,
    fontSize: 12.5,
    fontFamily: T.FONT.medium,
    lineHeight: 18,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
