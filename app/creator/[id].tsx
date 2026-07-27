import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CaretRight,
  Check,
  Lock,
  Sparkle,
  Star,
  Users,
  X,
} from 'phosphor-react-native';
import { blockUser, reportUser } from '@/services/users';
import { Spinner } from 'heroui-native';
import type { Creator } from '@/lib/api-client-react';
import { useLocalExploreCatalog } from '@/services/explore';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsAvatar } from '@/components/MsAvatar';
import { MsPreviewCard } from '@/components/MsExploreVisual';
import { MsEmptyState } from '@/components/MsEmptyState';
import { T } from '@/constants/theme';

// ─── Fake reviews (until backend exposes a reviews endpoint) ──────────────────

interface Review {
  id: string;
  authorName: string;
  authorInitials: string;
  rating: number;  // 1-5
  body: string;
  dateLabel: string;
}

function generateReviews(creator: Creator): Review[] {
  // Deterministic seed from creator id so they don't flicker
  const seed = creator.id.charCodeAt(0) + creator.id.charCodeAt(creator.id.length - 1);
  const banks: Omit<Review, 'id'>[] = [
    { authorName: 'Alex M.',       authorInitials: 'AM', rating: 5, body: 'Absolutely love the exclusive content! Worth every credit.',   dateLabel: '2 days ago' },
    { authorName: 'Jordan P.',     authorInitials: 'JP', rating: 5, body: 'One of the best creators on the platform. Always consistent.', dateLabel: '1 week ago' },
    { authorName: 'Sam K.',        authorInitials: 'SK', rating: 4, body: 'Great content. Would love more frequent drops!',               dateLabel: '2 weeks ago' },
    { authorName: 'Taylor W.',     authorInitials: 'TW', rating: 5, body: 'Incredible value. The premium posts are stunning.',            dateLabel: '3 weeks ago' },
    { authorName: 'Riley C.',      authorInitials: 'RC', rating: 4, body: 'Really enjoy the behind-the-scenes content.',                 dateLabel: '1 month ago' },
    { authorName: 'Morgan B.',     authorInitials: 'MB', rating: 5, body: 'Top-tier creator. Highly recommend subscribing!',             dateLabel: '1 month ago' },
    { authorName: 'Casey L.',      authorInitials: 'CL', rating: 3, body: 'Good content overall, hoping for more variety soon.',         dateLabel: '2 months ago' },
    { authorName: 'Drew H.',       authorInitials: 'DH', rating: 5, body: 'The interaction and exclusives make it totally worth it.',    dateLabel: '2 months ago' },
  ];
  // Rotate based on seed to give each creator slightly different reviews
  const rotated = [...banks.slice(seed % banks.length), ...banks.slice(0, seed % banks.length)];
  return rotated.slice(0, 4).map((r, i) => ({ ...r, id: `rev-${i}` }));
}

function avgRating(reviews: Review[]): number {
  if (!reviews.length) return 0;
  return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
}

// ─── Star display ─────────────────────────────────────────────────────────────

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          color={n <= Math.round(rating) ? '#FFB800' : T.BORDER_2}
          weight={n <= Math.round(rating) ? 'fill' : 'regular'}
        />
      ))}
    </View>
  );
}

// ─── Review card ─────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: Review }) {
  return (
    <View style={revStyles.card}>
      <View style={revStyles.header}>
        <View style={revStyles.avatar}>
          <Text style={revStyles.avatarInitial}>{review.authorInitials}</Text>
        </View>
        <View style={revStyles.meta}>
          <Text style={revStyles.name}>{review.authorName}</Text>
          <Text style={revStyles.date}>{review.dateLabel}</Text>
        </View>
        <StarRow rating={review.rating} size={13} />
      </View>
      <Text style={revStyles.body}>{review.body}</Text>
    </View>
  );
}

const revStyles = StyleSheet.create({
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER,
    padding: 14,
    gap: 10,
    marginBottom: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 12, fontFamily: T.FONT.bold, color: T.TEXT_2 },
  meta: { flex: 1 },
  name: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },
  date: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 1 },
  body: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2, lineHeight: 20 },
});

// ─── Subscribe sheet ──────────────────────────────────────────────────────────

function SubscribeSheet({
  visible,
  creator,
  canSubscribe,
  creditBalance,
  onConfirm,
  onWallet,
  onClose,
}: {
  visible: boolean;
  creator: Creator;
  canSubscribe: boolean;
  creditBalance: number;
  onConfirm: () => void;
  onWallet: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={shStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[shStyles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={shStyles.handle} />
          <View style={shStyles.lockIcon}>
            <Lock size={22} color={T.ACCENT} />
          </View>
          <Text style={shStyles.title}>
            {canSubscribe ? `Subscribe to ${creator.name}` : 'More credits needed'}
          </Text>
          <Text style={shStyles.desc}>
            {canSubscribe
              ? `${creator.monthlyCredits} credits unlock this creator's complete premium feed. Your balance will update after confirmation.`
              : `You need ${creator.monthlyCredits - creditBalance} more credits to subscribe to ${creator.name}.`}
          </Text>

          <TouchableOpacity
            style={shStyles.primaryBtn}
            activeOpacity={0.85}
            onPress={canSubscribe ? onConfirm : onWallet}
          >
            <Text style={shStyles.primaryLabel}>
              {canSubscribe ? `Confirm · ${creator.monthlyCredits} credits` : 'Open wallet'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={shStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={shStyles.cancelLabel}>Not now</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const shStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, gap: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: T.BORDER_2, alignSelf: 'center', marginBottom: 8,
  },
  lockIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
  },
  title: { fontSize: 20, fontFamily: T.FONT.bold, color: T.TEXT, textAlign: 'center', letterSpacing: -0.4 },
  desc: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    height: 52, borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.BG },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_2 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type TabKey = 'drops' | 'reviews' | 'about';

export default function CreatorProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useLocalExploreCatalog();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('drops');

  const creator = useMemo(
    () => query.data?.creators?.find((item) => item.id === id),
    [id, query.data],
  );
  const creatorPreviews = query.data?.previews.filter((item) => item.creatorId === id) ?? [];
  const creditBalance = Number(query.data?.creditBalance ?? 0);
  const canSubscribe = Boolean(creator && creditBalance >= creator.monthlyCredits);

  const reviews = useMemo(() => (creator ? generateReviews(creator) : []), [creator]);
  const avg = avgRating(reviews);

  if (query.isLoading) {
    return <View style={styles.center}><Spinner color="default" size="lg" /></View>;
  }

  if (query.isError || !creator) {
    return (
      <View style={styles.center}>
        <MsEmptyState
          title="Creator not found"
          message="This profile may have moved. Head back to Explore to keep discovering."
          actionLabel="Back to Explore"
          onAction={() => router.replace('/(tabs)/explore')}
        />
      </View>
    );
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'drops',   label: `Drops (${creatorPreviews.length})` },
    { key: 'reviews', label: `Reviews (${reviews.length})` },
    { key: 'about',   label: 'About' },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Creator profile</Text>
        <Pressable style={styles.moreButton} onPress={() => setMoreSheetOpen(true)}>
          <Sparkle size={17} color={T.TEXT_2} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.profileHero}>
          <View style={styles.avatarWrap}>
            <MsAvatar size={84} initials={creator.initials} showOnline={creator.isOnline} imageUri={creator.avatarUrl ?? undefined} />
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{creator.name}</Text>
            {creator.isVerified && <Check size={16} color={T.ACCENT} />}
          </View>
          <Text style={styles.handle}>{creator.handle} · {creator.category}</Text>

          {/* Rating summary */}
          <View style={styles.ratingRow}>
            <StarRow rating={avg} size={15} />
            <Text style={styles.ratingText}>{avg.toFixed(1)} ({reviews.length} reviews)</Text>
          </View>

          <Text style={styles.bio}>{creator.bio}</Text>

          {/* Metrics */}
          <View style={styles.metrics}>
            <View>
              <Text style={styles.metricValue}>{creator.followers}</Text>
              <Text style={styles.metricLabel}>Followers</Text>
            </View>
            <View style={styles.metricDivider} />
            <View>
              <Text style={styles.metricValue}>{creator.monthlyCredits}</Text>
              <Text style={styles.metricLabel}>Credits / mo</Text>
            </View>
            <View style={styles.metricDivider} />
            <View>
              <Text style={styles.metricValue}>{creatorPreviews.length}</Text>
              <Text style={styles.metricLabel}>Previews</Text>
            </View>
          </View>

          {/* Subscribe button */}
          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={() => setSheetOpen(true)}
            activeOpacity={0.85}
          >
            <Lock size={16} color={T.BG} />
            <Text style={styles.subscribeBtnLabel}>
              {canSubscribe
                ? `Subscribe · ${creator.monthlyCredits} credits`
                : 'Get more credits to subscribe'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Tabs ── */}
        <View style={styles.tabs}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab content ── */}
        {activeTab === 'drops' && (
          <View style={styles.tabContent}>
            {creatorPreviews.length > 0 ? (
              <View style={styles.previewGrid}>
                {creatorPreviews.map((preview) => (
                  <MsPreviewCard
                    key={preview.id}
                    preview={preview}
                    creator={creator}
                    onPress={() => router.push(`/content/${preview.id}`)}
                    onLongPress={() => undefined}
                  />
                ))}
              </View>
            ) : (
              <MsEmptyState
                title="No drops yet"
                message="This creator hasn't published any premium content yet."
              />
            )}
          </View>
        )}

        {activeTab === 'reviews' && (
          <View style={styles.tabContent}>
            {/* Rating summary card */}
            <View style={styles.ratingCard}>
              <Text style={styles.ratingBig}>{avg.toFixed(1)}</Text>
              <StarRow rating={avg} size={20} />
              <Text style={styles.ratingCardSub}>{reviews.length} subscriber reviews</Text>
            </View>

            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </View>
        )}

        {activeTab === 'about' && (
          <View style={styles.tabContent}>
            <View style={styles.aboutCard}>
              <Users size={18} color={T.TEXT_2} />
              <View style={styles.aboutCopy}>
                <Text style={styles.aboutTitle}>A closer connection</Text>
                <Text style={styles.aboutText}>
                  Subscribe for the full feed, private drops, and monthly creator notes.
                </Text>
              </View>
              <CaretRight size={17} color={T.TEXT_3} />
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Category</Text>
                <Text style={styles.infoValue}>{creator.category}</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Monthly credits</Text>
                <Text style={styles.infoValue}>{creator.monthlyCredits} credits</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Availability</Text>
                <View style={styles.onlineRow}>
                  <View style={[styles.onlineDot, { backgroundColor: creator.isOnline ? T.SUCCESS : T.TEXT_3 }]} />
                  <Text style={styles.infoValue}>{creator.isOnline ? 'Online now' : 'Offline'}</Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Verified</Text>
                <Text style={styles.infoValue}>{creator.isVerified ? '✓ Verified creator' : 'Not verified'}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 35 }} />
      </ScrollView>

      {/* Subscribe sheet */}
      <SubscribeSheet
        visible={sheetOpen}
        creator={creator}
        canSubscribe={canSubscribe}
        creditBalance={creditBalance}
        onConfirm={() => { setSheetOpen(false); }}
        onWallet={() => { setSheetOpen(false); router.push('/wallet'); }}
        onClose={() => setSheetOpen(false)}
      />

      {/* More (sparkle) action sheet */}
      <MsActionSheet
        visible={moreSheetOpen}
        title={creator.name}
        subtitle={creator.handle}
        actions={[
          {
            label: 'Copy Username',
            onPress: async () => {
              setMoreSheetOpen(false);
              await Clipboard.setStringAsync(creator.handle);
              Alert.alert('Copied', `${creator.handle} copied to clipboard.`);
            },
          },
          {
            label: 'Share Profile',
            onPress: async () => {
              setMoreSheetOpen(false);
              await Share.share({
                title: creator.name,
                message: `Check out ${creator.name} ${creator.handle} on MeetSweet!`,
              });
            },
          },
          {
            label: 'Report',
            onPress: () => {
              setMoreSheetOpen(false);
              Alert.alert(
                'Report Creator',
                'Are you sure you want to report this creator?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Report',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await reportUser(creator.handle.replace('@', ''), 'inappropriate_content');
                        Alert.alert('Reported', 'Thank you. We will review this profile.');
                      } catch {
                        Alert.alert('Error', 'Could not submit report. Please try again.');
                      }
                    },
                  },
                ],
              );
            },
          },
          {
            label: 'Block',
            destructive: true,
            onPress: () => {
              setMoreSheetOpen(false);
              Alert.alert(
                'Block Creator',
                `Block ${creator.name}? You won't see their content anymore.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await blockUser(creator.handle.replace('@', ''));
                        Alert.alert('Blocked', `${creator.name} has been blocked.`);
                        router.back();
                      } catch {
                        Alert.alert('Error', 'Could not block this user. Please try again.');
                      }
                    },
                  },
                ],
              );
            },
          },
        ] satisfies ActionItem[]}
        onClose={() => setMoreSheetOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },

  header: {
    height: 62, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: T.BORDER,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
  },
  moreButton: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15,
  },

  content: { paddingBottom: 35 },

  profileHero: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 28 },
  avatarWrap: { marginBottom: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 24, letterSpacing: -0.6 },
  handle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, marginTop: 4 },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ratingText: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },

  bio: {
    color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13, lineHeight: 20,
    textAlign: 'center', marginTop: 14, maxWidth: 320,
  },
  metrics: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 25, paddingVertical: 16,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.BORDER,
  },
  metricValue: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 16, textAlign: 'center' },
  metricLabel: {
    color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 9,
    textAlign: 'center', marginTop: 3, letterSpacing: 0.3,
  },
  metricDivider: { width: 1, height: 24, backgroundColor: T.BORDER_2 },

  subscribeButton: {
    width: '100%', marginTop: 18, height: 52,
    borderRadius: T.RADIUS.full, backgroundColor: T.ACCENT,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  subscribeBtnLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.BG },

  // Tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: T.BORDER,
    marginTop: 28,
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: T.ACCENT },
  tabLabel: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  tabLabelActive: { color: T.ACCENT, fontFamily: T.FONT.semibold },

  tabContent: { padding: 20 },

  // Drops
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  // Reviews rating card
  ratingCard: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg, borderWidth: 1, borderColor: T.BORDER,
    padding: 20, alignItems: 'center', gap: 8, marginBottom: 16,
  },
  ratingBig: { fontSize: 48, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -2 },
  ratingCardSub: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 4 },

  // About
  aboutCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE, borderWidth: 1, borderColor: T.BORDER,
    marginBottom: 12,
  },
  aboutCopy: { flex: 1 },
  aboutTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 12 },
  aboutText: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, lineHeight: 17, marginTop: 3 },

  infoCard: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg, borderWidth: 1, borderColor: T.BORDER,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  infoDivider: { height: 1, backgroundColor: T.BORDER, marginHorizontal: 16 },
  infoLabel: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  infoValue: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
});
