/**
 * Private Messages — Inbox / Outbox list.
 *
 * Email-style correspondence: originals only, replies live inside each
 * thread. Live updates arrive over SweetSocket — new inbox messages prepend,
 * outbox reply/status changes refresh in place. No polling.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollMotion } from '@/lib/scroll-motion';
import { ArrowLeft, Envelope, EnvelopeOpen, PaperPlaneTilt } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { GradientText } from '@/components/GradientText';
import { GradientBorder } from '@/components/GradientBorder';
import { goBack } from '@/lib/safe-back';
import { MsShimmer } from '@/components/MsShimmer';
import { listPrivateMessages, type PrivateMessage } from '@/services/private-inbox';
import { realtime } from '@/services/realtime';

function Item({ message, box }: { message: PrivateMessage; box: 'inbox' | 'outbox' }) {
  const name =
    box === 'inbox'
      ? message.sender_name ?? message.sender_username ?? 'User'
      : message.recipient_name ?? message.recipient_username ?? 'Creator';
  const isUnread = box === 'inbox' && message.status === 'sent' && !message.read_at;
  return (
    <GradientBorder radius={T.RADIUS.lg} surface={T.SURFACE} style={styles.itemBorder}>
    <Pressable
      style={styles.item}
      onPress={() => router.push(`/inbox/${message.id}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`Open message from ${name}`}
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
          ₦{message.price_paid.toLocaleString()} · {message.status === 'replied' ? 'Replied' : isUnread ? 'Unread' : 'Read'}
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

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState<'inbox' | 'outbox'>('inbox');
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [load]);

  // SweetSocket — the lists are live:
  //  • inbox: a newly paid message prepends instantly
  //  • outbox: a creator reply / status change refreshes in place
  useEffect(
    () =>
      realtime.on((event) => {
        if (event.type === 'private_message.created' && box === 'inbox') {
          const message = (event.payload as any).message as PrivateMessage;
          setMessages((old) => (old.some((m) => m.id === message.id) ? old : [message, ...old]));
        }
        if ((event.type === 'private_message.reply_created' || event.type === 'private_message.updated') && box === 'outbox') {
          load();
        }
      }),
    [box, load],
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
          onPress={() => router.push('/compose-private-message' as any)}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="New private message"
        >
          <PaperPlaneTilt size={19} color={T.PRIMARY_LIGHT} />
        </Pressable>
      </View>

      {/* Inbox / Outbox tabs */}
      <View style={styles.tabs}>
        <Pressable
          onPress={() => setBox('inbox')}
          style={[styles.tab, box === 'inbox' && styles.active]}
          accessibilityRole="tab"
          accessibilityState={{ selected: box === 'inbox' }}
        >
          {box === 'inbox' && <BrandGradientFill />}
          {box === 'inbox' ? <EnvelopeOpen size={16} color={box === 'inbox' ? T.ACCENT_FG : T.TEXT_2} /> : <Envelope size={16} color={T.TEXT_2} />}
          <Text style={[styles.tabText, box === 'inbox' && styles.tabTextActive]}>Inbox</Text>
        </Pressable>
        <Pressable
          onPress={() => setBox('outbox')}
          style={[styles.tab, box === 'outbox' && styles.active]}
          accessibilityRole="tab"
          accessibilityState={{ selected: box === 'outbox' }}
        >
          {box === 'outbox' && <BrandGradientFill />}
          <PaperPlaneTilt size={16} color={box === 'outbox' ? T.ACCENT_FG : T.TEXT_2} />
          <Text style={[styles.tabText, box === 'outbox' && styles.tabTextActive]}>Outbox</Text>
        </Pressable>
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
          messages.map((m) => <Item key={m.id} message={m} box={box} />)
        ) : (
          <View style={stateStyles.wrap}>
            <View style={stateStyles.iconWrap}>
              {box === 'inbox' ? <Envelope size={30} color={T.TEXT_3} /> : <PaperPlaneTilt size={30} color={T.TEXT_3} />}
            </View>
            <Text style={stateStyles.title}>{box === 'inbox' ? 'No correspondence yet' : 'Nothing sent yet'}</Text>
            <Text style={stateStyles.sub}>
              {box === 'inbox'
                ? 'Paid private messages from you to creators appear here with their replies.'
                : 'Messages you send to creators will show up here.'}
            </Text>
          </View>
        )}
      </ScrollView>
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
    flex: 1, flexDirection: 'row', gap: 8,
    paddingVertical: 11,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  active: { backgroundColor: T.ACCENT, overflow: 'hidden' },
  tabText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 13.5 },
  tabTextActive: { color: T.ACCENT_FG, fontFamily: T.FONT.bold },

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
