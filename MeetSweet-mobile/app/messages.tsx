/**
 * Private Messages — Inbox / Outbox / Waiting list.
 *
 * Email-style correspondence: originals only, replies live inside each
 * thread. Live updates arrive over SweetSocket — new inbox messages prepend,
 * outbox reply/status changes refresh in place, approvals/deletions sync
 * across devices. No polling.
 *
 * Long-press a row for message actions:
 *   • inbox    → Delete (for me), Mute sender (future messages → Waiting),
 *                Block sender
 *   • outbox   → Delete (for both), Block recipient
 *   • waiting  → Approve, Allow sender (approves all pending), Block sender,
 *                Delete
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollMotion } from '@/lib/scroll-motion';
import { ArrowLeft, Envelope, EnvelopeOpen, Hourglass, PaperPlaneTilt } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { GradientText } from '@/components/GradientText';
import { GradientBorder } from '@/components/GradientBorder';
import { goBack } from '@/lib/safe-back';
import { MsShimmer } from '@/components/MsShimmer';
import { MsAvatar } from '@/components/MsAvatar';
import { MsModal } from '@/components/MsModal';
import {
  approvePrivateMessage,
  allowPrivateSender,
  deletePrivateMessage,
  listPrivateMessages,
  restrictPrivateSender,
  type InboxBox,
  type PrivateMessage,
} from '@/services/private-inbox';
import { listMySubscriptions, type SubscribedCreator } from '@/services/subscriptions';
import { getCreatorSubscribers, type CreatorSubscriber } from '@/services/creator';
import { useAuth } from '@/contexts/AuthContext';
import { blockUser } from '@/services/users';
import { realtime } from '@/services/realtime';

function Item({
  message,
  box,
  onOpen,
  onLongPress,
}: {
  message: PrivateMessage;
  box: InboxBox;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const name =
    box === 'inbox' || box === 'waiting'
      ? message.sender_name ?? message.sender_username ?? 'User'
      : message.recipient_name ?? message.recipient_username ?? 'Creator';
  const isUnread =
    (box === 'inbox' && message.status === 'sent' && !message.read_at) ||
    (box === 'waiting' && message.status === 'waiting');
  return (
    <GradientBorder radius={T.RADIUS.lg} surface={T.SURFACE} style={styles.itemBorder}>
      <Pressable
        style={styles.item}
        onPress={onOpen}
        onLongPress={onLongPress}
        delayLongPress={250}
        accessibilityRole="button"
        accessibilityLabel={`Open message from ${name}`}
        accessibilityHint="Long press for message actions"
      >
        <View style={styles.avatar}>
          <BrandGradientFill />
          <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
          {isUnread ? (
            <View style={styles.unreadDot}>
              <BrandGradientFill />
            </View>
          ) : null}
        </View>
        <View style={styles.content}>
          <Text style={[styles.name, isUnread && styles.nameUnread]} numberOfLines={1}>{name}</Text>
          <Text style={styles.preview} numberOfLines={2}>{message.body}</Text>
          <Text style={styles.meta}>
            {message.status === 'waiting'
              ? 'Awaiting approval'
              : message.status === 'replied'
                ? `${message.reply_count} reply${message.reply_count === 1 ? '' : 's'}`
                : isUnread
                  ? 'Unread'
                  : 'Read'}
          </Text>
        </View>
        <Text style={styles.date}>{new Date(message.created_at).toLocaleDateString()}</Text>
      </Pressable>
    </GradientBorder>
  );
}

/** Loading skeleton matching the row layout. */
function RowsSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <MsShimmer width={42} height={42} borderRadius={21} />
          <View style={{ flex: 1, gap: 7 }}>
            <MsShimmer width="60%" height={12} />
            <MsShimmer width="85%" height={10} />
            <MsShimmer width="35%" height={9} />
          </View>
        </View>
      ))}
    </View>
  );
}

const TABS: { key: InboxBox; label: string; icon: 'inbox' | 'outbox' | 'waiting' }[] = [
  { key: 'inbox', label: 'Inbox', icon: 'inbox' },
  { key: 'outbox', label: 'Outbox', icon: 'outbox' },
  { key: 'waiting', label: 'Waiting', icon: 'waiting' },
];

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isCreator = Boolean(user?.isCreator);
  // Allow deep-links like "View waiting messages" from a conversation's
  // three-dot menu to land on the Waiting tab.
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [box, setBox] = useState<InboxBox>(() =>
    tab === 'waiting' ? 'waiting' : tab === 'outbox' ? 'outbox' : 'inbox',
  );
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [waitingMessages, setWaitingMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Composer picker ────────────────────────────────────────────────────────
  // Fans pick a creator they subscribe to (fan → creator). Creators also get
  // a second tab listing their own subscribers (creator → subscriber).
  type PickerTab = 'subscriptions' | 'subscribers';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>('subscriptions');
  const [subscribedCreators, setSubscribedCreators] = useState<SubscribedCreator[]>([]);
  const [subscribers, setSubscribers] = useState<CreatorSubscriber[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const openCreatorPicker = useCallback(async () => {
    setPickerOpen(true);
    setPickerTab('subscriptions');
    setPickerLoading(true);
    setPickerError(null);
    try {
      setSubscribedCreators(await listMySubscriptions());
      if (isCreator) {
        getCreatorSubscribers(1)
          .then((r) => setSubscribers(r.subscribers ?? []))
          .catch(() => setSubscribers([]));
      }
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : 'Could not load your subscriptions');
    } finally {
      setPickerLoading(false);
    }
  }, [isCreator]);

  /** Keep the Waiting tab badge honest without polling. */
  const refreshWaiting = useCallback(async () => {
    try {
      setWaitingMessages(await listPrivateMessages('waiting'));
    } catch {
      /* badge is best-effort; the tab itself surfaces errors */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setMessages(await listPrivateMessages(box));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [box]);

  useEffect(() => {
    setLoading(true);
    load();
    refreshWaiting();
  }, [load, refreshWaiting]);

  // ── Long-press actions ─────────────────────────────────────────────────────

  const reloadAll = useCallback(() => {
    load();
    refreshWaiting();
  }, [load, refreshWaiting]);

  const onItemLongPress = useCallback(
    (message: PrivateMessage, currentBox: InboxBox) => {
      const senderId = message.sender_id;
      const senderUsername = message.sender_username ?? senderId;
      const senderName = message.sender_name ?? message.sender_username ?? 'this sender';
      const recipientName = message.recipient_name ?? message.recipient_username ?? 'this creator';
      const openThread = () => router.push(`/inbox/${message.id}` as any);

      const confirmDelete = (forBoth: boolean, label: string) =>
        Alert.alert(
          'Delete message?',
          forBoth
            ? 'This removes the entire correspondence for BOTH you and the other person. This cannot be undone.'
            : 'This hides the conversation from your inbox. The other person keeps their copy.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: label,
              style: 'destructive',
              onPress: async () => {
                try {
                  await deletePrivateMessage(message.id);
                  reloadAll();
                } catch (e) {
                  Alert.alert('Could not delete', e instanceof Error ? e.message : 'Please try again.');
                }
              },
            },
          ],
        );

      const confirmBlock = () =>
        Alert.alert(
          `Block ${senderName}?`,
          'They will no longer be able to send you private messages. You can unblock them later from their profile.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block',
              style: 'destructive',
              onPress: async () => {
                try {
                  await blockUser(senderUsername);
                  Alert.alert('Blocked', `You can no longer receive private messages from ${senderName}.`);
                } catch (e) {
                  Alert.alert('Could not block', e instanceof Error ? e.message : 'Please try again.');
                }
              },
            },
          ],
        );

      const confirmMute = () =>
        Alert.alert(
          `Mute ${senderName}?`,
          'Future messages from this sender will be placed in Waiting for your approval instead of your inbox.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Mute',
              onPress: async () => {
                try {
                  await restrictPrivateSender(senderId);
                  Alert.alert('Muted', `Messages from ${senderName} will now wait for your approval.`);
                } catch (e) {
                  Alert.alert('Could not mute', e instanceof Error ? e.message : 'Please try again.');
                }
              },
            },
          ],
        );

      if (currentBox === 'waiting') {
        Alert.alert('Message actions', `From ${senderName}`, [
          {
            text: 'Approve',
            onPress: async () => {
              try {
                await approvePrivateMessage(message.id);
                Alert.alert('Approved', 'The message is now in your inbox.');
                reloadAll();
              } catch (e) {
                Alert.alert('Could not approve', e instanceof Error ? e.message : 'Please try again.');
              }
            },
          },
          {
            text: 'Allow sender',
            onPress: async () => {
              try {
                const r = await allowPrivateSender(senderId);
                Alert.alert(
                  'Allowed',
                  r.approved > 0
                    ? `${senderName} is allowed again — ${r.approved} pending message${r.approved === 1 ? '' : 's'} moved to your inbox.`
                    : `${senderName} is allowed again.`,
                );
                reloadAll();
              } catch (e) {
                Alert.alert('Could not allow', e instanceof Error ? e.message : 'Please try again.');
              }
            },
          },
          { text: 'Block sender', style: 'destructive', onPress: confirmBlock },
          { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(true, 'Delete') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }

      if (currentBox === 'inbox') {
        Alert.alert('Message actions', `From ${senderName}`, [
          { text: 'Open', onPress: openThread },
          { text: 'Mute sender', onPress: confirmMute },
          { text: 'Block sender', style: 'destructive', onPress: confirmBlock },
          { text: 'Delete for me', style: 'destructive', onPress: () => confirmDelete(false, 'Delete for me') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }

      // outbox — sender ownership: deleting removes it for both.
      Alert.alert('Message actions', `To ${recipientName}`, [
        { text: 'Open', onPress: openThread },
        { text: 'Delete for both', style: 'destructive', onPress: () => confirmDelete(true, 'Delete for both') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [reloadAll],
  );

  // SweetSocket — the lists are live:
  //  • inbox/waiting: a newly paid message prepends to the matching box
  //  • read receipts flip the outbox row in place (no reload needed)
  //  • approvals / deletions / replies / status changes refresh in place
  useEffect(
    () =>
      realtime.on((event) => {
        if (event.type === 'private_message.created') {
          const message = (event.payload as any).message as PrivateMessage;
          const targetBox = (event.payload as any).box as InboxBox;
          if (targetBox === 'waiting') {
            setWaitingMessages((old) => (old.some((m) => m.id === message.id) ? old : [message, ...old]));
            if (box === 'waiting') {
              setMessages((old) => (old.some((m) => m.id === message.id) ? old : [message, ...old]));
            }
          } else if (box === 'inbox') {
            setMessages((old) => (old.some((m) => m.id === message.id) ? old : [message, ...old]));
          }
        }
        if (event.type === 'private_message.read') {
          // The recipient opened our message — flip status/read_at in place.
          const { message_id, read_at } = event.payload as { message_id?: string; read_at?: string };
          if (message_id) {
            const patch = (m: PrivateMessage): PrivateMessage =>
              m.id === message_id
                ? { ...m, read_at: read_at ?? m.read_at, status: m.status === 'replied' ? 'replied' : 'read' }
                : m;
            setMessages((old) => old.map(patch));
            setWaitingMessages((old) => old.map(patch));
          }
        }
        if (
          event.type === 'private_message.approved' ||
          event.type === 'private_message.deleted' ||
          event.type === 'private_message.reply_created' ||
          event.type === 'private_message.updated'
        ) {
          reloadAll();
        }
      }),
    [box, reloadAll],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} style={styles.iconBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={22} color={T.TEXT} />
        </Pressable>
        <GradientText text="Private Messages" style={styles.title} />
        <Pressable
          onPress={openCreatorPicker}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="New private message"
        >
          <PaperPlaneTilt size={19} color={T.PRIMARY_LIGHT} />
        </Pressable>
      </View>

      {/* Inbox / Outbox / Waiting tabs */}
      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = box === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setBox(tab.key)}
              style={[styles.tab, active && styles.active]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              {active && <BrandGradientFill />}
              {tab.icon === 'inbox' ? (
                active ? <EnvelopeOpen size={16} color={T.ACCENT_FG} /> : <Envelope size={16} color={T.TEXT_2} />
              ) : tab.icon === 'outbox' ? (
                <PaperPlaneTilt size={16} color={active ? T.ACCENT_FG : T.TEXT_2} />
              ) : (
                <Hourglass size={16} color={active ? T.ACCENT_FG : T.TEXT_2} />
              )}
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              {tab.key === 'waiting' && waitingMessages.length > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{waitingMessages.length > 99 ? '99+' : waitingMessages.length}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        {...useScrollMotion()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <RowsSkeleton />
        ) : error ? (
          <View style={stateStyles.wrap}>
            <Text style={stateStyles.text}>{error}</Text>
            <Pressable style={stateStyles.retry} onPress={load}><Text style={stateStyles.retryText}>Retry</Text></Pressable>
          </View>
        ) : messages.length ? (
          messages.map((m) => (
            <Item
              key={m.id}
              message={m}
              box={box}
              onOpen={() => router.push(`/inbox/${m.id}` as any)}
              onLongPress={() => onItemLongPress(m, box)}
            />
          ))
        ) : (
          <View style={stateStyles.wrap}>
            <View style={stateStyles.iconWrap}>
              {box === 'inbox' ? <Envelope size={30} color={T.TEXT_3} /> : box === 'waiting' ? <Hourglass size={30} color={T.TEXT_3} /> : <PaperPlaneTilt size={30} color={T.TEXT_3} />}
            </View>
            <Text style={stateStyles.title}>
              {box === 'inbox' ? 'No correspondence yet' : box === 'waiting' ? 'Nothing waiting' : 'Nothing sent yet'}
            </Text>
            <Text style={stateStyles.sub}>
              {box === 'inbox'
                ? 'Paid private messages from you to creators appear here with their replies.'
                : box === 'waiting'
                  ? 'Messages from senders you muted land here until you approve them.'
                  : 'Messages you send to creators will show up here.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Composer picker — the airplane icon first shows the creators the
          user is subscribed to (private messaging is subscriber-only).
          Creators additionally see their own subscribers, so they can
          initiate a message in the other direction. */}
      <MsModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={pickerTab === 'subscribers' ? 'Message a subscriber' : 'Message a creator'}
        subtitle={
          pickerTab === 'subscribers'
            ? 'Pick one of your subscribers — free delivery; you can price attachments.'
            : "Pick a creator you're subscribed to — only subscribers can send private messages."
        }
        style={pickerStyles.modal}
      >
        {isCreator ? (
          <View style={pickerStyles.tabs}>
            <Pressable
              style={[pickerStyles.tab, pickerTab === 'subscriptions' && pickerStyles.tabActive]}
              onPress={() => setPickerTab('subscriptions')}
              accessibilityRole="tab"
              accessibilityState={{ selected: pickerTab === 'subscriptions' }}
            >
              {pickerTab === 'subscriptions' ? <BrandGradientFill /> : null}
              <Text style={[pickerStyles.tabText, pickerTab === 'subscriptions' && pickerStyles.tabTextActive]}>
                Your subscriptions
              </Text>
            </Pressable>
            <Pressable
              style={[pickerStyles.tab, pickerTab === 'subscribers' && pickerStyles.tabActive]}
              onPress={() => setPickerTab('subscribers')}
              accessibilityRole="tab"
              accessibilityState={{ selected: pickerTab === 'subscribers' }}
            >
              {pickerTab === 'subscribers' ? <BrandGradientFill /> : null}
              <Text style={[pickerStyles.tabText, pickerTab === 'subscribers' && pickerStyles.tabTextActive]}>
                Your subscribers
              </Text>
            </Pressable>
          </View>
        ) : null}
        {pickerLoading ? (
          <View style={pickerStyles.stateWrap}>
            <ActivityIndicator color={T.PRIMARY_LIGHT} />
          </View>
        ) : pickerError ? (
          <View style={pickerStyles.stateWrap}>
            <Text style={pickerStyles.stateText}>{pickerError}</Text>
            <Pressable style={pickerStyles.retryBtn} onPress={openCreatorPicker}>
              <Text style={pickerStyles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : pickerTab === 'subscribers' && subscribers.length === 0 ? (
          <View style={pickerStyles.stateWrap}>
            <View style={pickerStyles.stateIcon}>
              <PaperPlaneTilt size={26} color={T.TEXT_3} />
            </View>
            <Text style={pickerStyles.stateTitle}>No subscribers yet</Text>
            <Text style={pickerStyles.stateText}>
              When fans subscribe to you, you can message them here — free delivery, with optional paid attachments.
            </Text>
          </View>
        ) : pickerTab === 'subscriptions' && subscribedCreators.length === 0 ? (
          <View style={pickerStyles.stateWrap}>
            <View style={pickerStyles.stateIcon}>
              <PaperPlaneTilt size={26} color={T.TEXT_3} />
            </View>
            <Text style={pickerStyles.stateTitle}>No subscriptions yet</Text>
            <Text style={pickerStyles.stateText}>
              Subscribe to a creator to unlock private messaging with them.
            </Text>
            <Pressable
              style={pickerStyles.discoverBtn}
              onPress={() => {
                setPickerOpen(false);
                router.replace('/(tabs)/explore' as any);
              }}
            >
              <BrandGradientFill />
              <Text style={pickerStyles.discoverBtnText}>Discover creators</Text>
            </Pressable>
          </View>
        ) : pickerTab === 'subscribers' ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pickerStyles.list}>
            {subscribers.map((s) => {
              const name = s.display_name?.trim() || s.username || 'Subscriber';
              return (
                <Pressable
                  key={s.id}
                  style={pickerStyles.row}
                  onPress={() => {
                    setPickerOpen(false);
                    router.push({
                      pathname: '/compose-private-message',
                      params: { recipientId: s.id, mode: 'creator' },
                    } as any);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${name}`}
                >
                  <MsAvatar
                    size={42}
                    initials={name.slice(0, 2).toUpperCase()}
                    imageUri={s.avatar_url ?? undefined}
                  />
                  <View style={pickerStyles.rowCopy}>
                    <Text style={pickerStyles.rowName} numberOfLines={1}>{name}</Text>
                    {s.username ? (
                      <Text style={pickerStyles.rowHandle} numberOfLines={1}>@{s.username}</Text>
                    ) : null}
                  </View>
                  <PaperPlaneTilt size={15} color={T.TEXT_3} />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pickerStyles.list}>
            {subscribedCreators.map((c) => {
              const name = c.creator_name?.trim() || c.creator_username || 'Creator';
              return (
                <Pressable
                  key={c.id}
                  style={pickerStyles.row}
                  onPress={() => {
                    setPickerOpen(false);
                    router.push({
                      pathname: '/compose-private-message',
                      params: { creatorId: c.creator_id },
                    } as any);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${name}`}
                >
                  <MsAvatar
                    size={42}
                    initials={name.slice(0, 2).toUpperCase()}
                    imageUri={c.creator_avatar ?? undefined}
                  />
                  <View style={pickerStyles.rowCopy}>
                    <Text style={pickerStyles.rowName} numberOfLines={1}>{name}</Text>
                    {c.creator_username ? (
                      <Text style={pickerStyles.rowHandle} numberOfLines={1}>@{c.creator_username}</Text>
                    ) : null}
                  </View>
                  <PaperPlaneTilt size={15} color={T.TEXT_3} />
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </MsModal>
    </View>
  );
}

const stateStyles = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 70, paddingHorizontal: 32, gap: 8 },
  iconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  title: { color: T.TEXT, fontSize: 15, fontFamily: T.FONT.semibold },
  sub: { color: T.TEXT_3, fontSize: 12.5, fontFamily: T.FONT.regular, textAlign: 'center', lineHeight: 19 },
  text: { color: T.TEXT_2, fontSize: 13, textAlign: 'center' },
  retry: { marginTop: 6, paddingHorizontal: 18, paddingVertical: 8, borderRadius: T.RADIUS.full, backgroundColor: T.SURFACE },
  retryText: { color: T.TEXT, fontSize: 13, fontFamily: T.FONT.medium },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: T.TEXT, fontSize: 17, fontFamily: T.FONT.bold, textAlign: 'center' },

  tabs: { flexDirection: 'row', gap: 10, paddingHorizontal: 18 },
  tab: {
    flex: 1, flexDirection: 'row', gap: 6,
    paddingVertical: 11,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  active: { backgroundColor: T.ACCENT, overflow: 'hidden' },
  tabText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 13 },
  tabTextActive: { color: T.ACCENT_FG, fontFamily: T.FONT.bold },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: T.SECONDARY,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: T.FONT.bold },

  list: { gap: 10, paddingVertical: 14, paddingHorizontal: 18 },

  itemBorder: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: T.RADIUS.lg,
  },
  item: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
  },
  avatar: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontFamily: T.FONT.bold, fontSize: 16 },
  unreadDot: {
    position: 'absolute', top: -1, right: -1,
    width: 11, height: 11, borderRadius: 5.5,
    backgroundColor: T.SECONDARY,
    overflow: 'hidden',
    borderWidth: 2, borderColor: T.BG,
  },
  content: { flex: 1, gap: 3 },
  name: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 14.5 },
  nameUnread: { fontFamily: T.FONT.bold },
  preview: { color: T.TEXT_2, fontSize: 13, lineHeight: 18 },
  meta: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.medium },
  date: { color: T.TEXT_3, fontSize: 11, alignSelf: 'flex-start' },

  skeletonWrap: { gap: 10 },
  skeletonRow: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: T.RADIUS.lg, backgroundColor: T.SURFACE, alignItems: 'center' },
});

const pickerStyles = StyleSheet.create({
  modal: { maxHeight: '78%' },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.full,
    padding: 3,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    overflow: 'hidden',
  },
  tabActive: { backgroundColor: T.ACCENT },
  tabText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12 },
  tabTextActive: { color: T.ACCENT_FG, fontFamily: T.FONT.bold },
  list: { gap: 8, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  rowCopy: { flex: 1, gap: 1 },
  rowName: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  rowHandle: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12 },

  stateWrap: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 12, gap: 8 },
  stateIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  stateTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15 },
  stateText: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12.5, textAlign: 'center', lineHeight: 19 },
  retryBtn: {
    marginTop: 6, paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: T.RADIUS.full, backgroundColor: T.SURFACE_2,
  },
  retryText: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 13 },
  discoverBtn: {
    marginTop: 10, height: 46, paddingHorizontal: 26,
    borderRadius: T.RADIUS.full, backgroundColor: T.ACCENT,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  discoverBtnText: { color: T.ACCENT_FG, fontFamily: T.FONT.semibold, fontSize: 14 },
});
