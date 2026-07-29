import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChatCircle, CheckCircle, Heart, Lock, ShareNetwork, UserPlus } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsAvatar } from '@/components/MsAvatar';
import { MsContentComments } from '@/components/MsContentComments';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsShareSheet } from '@/components/MsShareSheet';
import { MsShortsPlayer } from '@/components/MsShortsPlayer';
import { getShortsFeed, likeContent, trackShortView, type Short } from '@/services/content';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Premium paywall sheet (reuses the app's modal/sheet design language) ─────

function PremiumSheet({
  visible,
  creatorName,
  onSubscribe,
  onClose,
  insetBottom,
}: {
  visible: boolean;
  creatorName: string;
  onSubscribe: () => void;
  onClose: () => void;
  insetBottom: number;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={sheetStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[sheetStyles.sheet, { paddingBottom: Math.max(insetBottom, 20) }]}>
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.lockCircle}>
            <Lock size={22} color={T.ACCENT} />
          </View>
          <Text style={sheetStyles.title}>Premium Short</Text>
          <Text style={sheetStyles.desc}>
            Subscribe to {creatorName} to watch this Short and unlock their full feed.
          </Text>
          <TouchableOpacity style={sheetStyles.primaryBtn} activeOpacity={0.85} onPress={onSubscribe}>
            <Text style={sheetStyles.primaryLabel}>Subscribe to unlock</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sheetStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={sheetStyles.cancelLabel}>Not now</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, gap: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.TEXT_3, alignSelf: 'center', marginBottom: 8 },
  lockCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  title: { fontSize: 20, fontFamily: T.FONT.bold, color: T.TEXT, textAlign: 'center', letterSpacing: -0.4 },
  desc: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2, textAlign: 'center', lineHeight: 20 },
  primaryBtn: { height: 52, borderRadius: T.RADIUS.full, backgroundColor: T.ACCENT, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.BG },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_2 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ShortsScreen() {
  const insets = useSafeAreaInsets();
  const { startId } = useLocalSearchParams<{ startId?: string }>();
  const listRef = useRef<FlatList>(null);

  const [shorts, setShorts]     = useState<Short[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [commentsId, setCommentsId] = useState<string | null>(null);
  const [shareId, setShareId]   = useState<string | null>(null);
  const viewConfig = useRef({ itemVisiblePercentThreshold: 75 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getShortsFeed();
      setShorts(page.items);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Scroll to startId once list is loaded
  useEffect(() => {
    if (!startId || !shorts.length) return;
    const idx = shorts.findIndex((s) => s.id === startId);
    if (idx > 0) {
      // Slight delay lets the FlatList finish its initial layout
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, animated: false });
        setActiveIndex(idx);
      }, 100);
    }
  }, [startId, shorts]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const index = viewableItems[0]?.index;
    if (typeof index === 'number') setActiveIndex(index);
  }).current;

  if (loading) return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <ActivityIndicator color={T.TEXT} size="large" />
      <Text style={styles.loadingText}>Loading Shorts</Text>
    </View>
  );
  if (error) return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <MsEmptyState title="Shorts unavailable" message="The Shorts service could not be reached." actionLabel="Try again" onAction={load} />
    </View>
  );
  if (!shorts.length) return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <MsEmptyState title="No Shorts yet" message="Short-form videos from creators will appear here." actionLabel="Back to Explore" onAction={() => router.replace('/(tabs)/explore')} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={shorts}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ShortPage
            item={item}
            active={index === activeIndex}
            topInset={insets.top}
            bottomInset={insets.bottom}
            onComment={() => setCommentsId(item.id)}
            onShare={() => setShareId(item.id)}
            onViewProgress={(seconds) => { if (seconds > 0) trackShortView(item.id, seconds).catch(() => {}); }}
          />
        )}
        pagingEnabled
        decelerationRate="fast"
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewConfig.current}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, index) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * index, index })}
        removeClippedSubviews
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        bounces
        overScrollMode="always"
      />
      {commentsId ? (
        <MsContentComments
          kind="short"
          contentId={commentsId}
          visible
          onClose={() => setCommentsId(null)}
          count={shorts.find((item) => item.id === commentsId)?.commentCount}
        />
      ) : null}
      {shareId ? (
        <MsShareSheet
          visible
          contentType="short"
          contentId={shareId}
          title="Share Short"
          onClose={() => setShareId(null)}
        />
      ) : null}
    </View>
  );
}

// ─── Individual Short page ────────────────────────────────────────────────────

function ShortPage({
  item,
  active,
  topInset,
  bottomInset,
  onComment,
  onShare,
  onViewProgress,
}: {
  item: Short;
  active: boolean;
  topInset: number;
  bottomInset: number;
  onComment: () => void;
  onShare: () => void;
  onViewProgress: (seconds: number) => void;
}) {
  const [liked,     setLiked]     = useState(item.likedByMe);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const [premiumSheetVisible, setPremiumSheetVisible] = useState(false);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
    try {
      const result = await likeContent('short', item.id, liked);
      setLikeCount(result.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount(item.likeCount);
    }
  };

  return (
    <View style={styles.page}>
      <MsShortsPlayer
        item={item}
        active={active}
        onViewProgress={onViewProgress}
        onPremiumRequired={() => setPremiumSheetVisible(true)}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topInset + 12 }]}>
        <Pressable style={styles.topButton} onPress={() => router.back()} accessibilityLabel="Close Shorts">
          <ArrowLeft size={21} color="#fff" />
        </Pressable>
        <View style={styles.topTitle}>
          <Text style={styles.topEyebrow}>MEETSWEET</Text>
          <Text style={styles.topText}>Shorts</Text>
        </View>
        <View style={{ minWidth: 40 }} />
      </View>

      {/* Bottom content */}
      <View style={styles.content}>
        {item.isPremium ? (
          <TouchableOpacity style={styles.upgradePill} onPress={() => setPremiumSheetVisible(true)} activeOpacity={0.8}>
            <Lock size={12} color="#fff" />
            <Text style={styles.upgradeText}>Subscribe to watch</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.creatorLine}>
          <MsAvatar size={38} initials={item.creator.name.slice(0, 2).toUpperCase()} imageUri={item.creator.avatarUrl ?? undefined} />
          <Text style={styles.creatorName}>{item.creator.name}</Text>
          {item.creator.isVerified ? <CheckCircle size={15} color="#fff" weight="fill" /> : null}
          <Pressable style={styles.subscribe} onPress={() => router.push(`/creator/${item.creator.id}`)}>
            <UserPlus size={12} color={T.BG} />
            <Text style={styles.subscribeText}>Subscribe</Text>
          </Pressable>
        </View>
        {item.caption ? <Text style={styles.caption} numberOfLines={3}>{item.caption}</Text> : null}
        <Text style={styles.views}>{formatCount(item.viewCount)} views</Text>
      </View>

      {/* Side actions */}
      <View style={[styles.actions, { paddingBottom: bottomInset + 20 }]}>
        <Pressable style={styles.actionButton} onPress={toggleLike}>
          <View style={[styles.actionCircle, liked && styles.actionCircleActive]}>
            <Heart size={23} color="#fff" weight={liked ? 'fill' : 'regular'} />
          </View>
          <Text style={styles.actionCount}>{formatCount(likeCount)}</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={onComment}>
          <View style={styles.actionCircle}>
            <ChatCircle size={23} color="#fff" />
          </View>
          <Text style={styles.actionCount}>{formatCount(item.commentCount)}</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={onShare}>
          <View style={styles.actionCircle}>
            <ShareNetwork size={23} color="#fff" />
          </View>
          <Text style={styles.actionCount}>{formatCount(item.shareCount)}</Text>
        </Pressable>
      </View>

      {/* Premium paywall */}
      <PremiumSheet
        visible={premiumSheetVisible}
        creatorName={item.creator.name}
        onSubscribe={() => { setPremiumSheetVisible(false); router.push(`/creator/${item.creator.id}`); }}
        onClose={() => setPremiumSheetVisible(false)}
        insetBottom={bottomInset}
      />
    </View>
  );
}

function formatCount(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K`
    : String(value);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  page: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#050506' },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 13, marginTop: 14 },
  topBar: {
    position: 'absolute', left: 16, right: 16, top: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topButton: {
    minWidth: 40, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
  },
  topTitle: { alignItems: 'center' },
  topEyebrow: { color: 'rgba(255,255,255,0.62)', fontFamily: T.FONT.semibold, fontSize: 8, letterSpacing: 1.3 },
  topText: { color: '#fff', fontFamily: T.FONT.bold, fontSize: 15, marginTop: 1 },

  content: { position: 'absolute', left: 18, right: 78, bottom: 36, gap: 9 },
  upgradePill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: T.ACCENT, borderRadius: T.RADIUS.full, paddingHorizontal: 10, paddingVertical: 6,
  },
  upgradeText: { color: '#fff', fontFamily: T.FONT.semibold, fontSize: 10 },
  creatorLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  creatorName: { color: '#fff', fontFamily: T.FONT.semibold, fontSize: 14 },
  subscribe: {
    marginLeft: 4, flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: T.RADIUS.full, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 7,
  },
  subscribeText: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 10 },
  caption: { color: '#fff', fontFamily: T.FONT.regular, fontSize: 14, lineHeight: 21 },
  views: { color: 'rgba(255,255,255,0.68)', fontFamily: T.FONT.medium, fontSize: 11 },

  actions: { position: 'absolute', right: 14, bottom: 0, alignItems: 'center', gap: 18 },
  actionButton: { alignItems: 'center', gap: 4 },
  actionCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center',
  },
  actionCircleActive: { backgroundColor: T.ACCENT },
  actionCount: { color: '#fff', fontFamily: T.FONT.semibold, fontSize: 10 },
});
