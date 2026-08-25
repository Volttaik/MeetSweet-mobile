/**
 * Album detail screen — /album/[id]
 *
 * Shows the full album: cover hero, creator info, description, item count,
 * price, locked/unlocked state, and a grid preview of contained items.
 * Locked albums blur individual items and show an unlock CTA.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Images,
  Lock,
  Play,
  Star,
  UserCircle,
  ShareNetwork,
  X,
} from 'phosphor-react-native';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { MsVideoThumbnail } from '@/components/MsVideoThumbnail';
import { MsAvatar } from '@/components/MsAvatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsPostSkeleton } from '@/components/MsSkeletonCard';
import { T, alpha, MEDIA_BG, ALBUM_TONES } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { GradientBorder } from '@/components/GradientBorder';
import { useScrollMotion } from '@/lib/scroll-motion';
import { useAlbum, purchaseAlbum } from '@/services/albums';
import { soundService } from '@/services/sound-service';
import type { AlbumItem } from '@/services/albums';
import { MsShareSheet } from '@/components/MsShareSheet';
import { MsModal } from '@/components/MsModal';
import { MsFeedbackModal, type FeedbackVariant } from '@/components/MsFeedbackModal';
import { useWalletBalance } from '@/hooks/useWalletBalance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 3;
const GRID_COLS = 3;
const THUMB_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS + 1)) / GRID_COLS;

const TONE = ALBUM_TONES;

function tone(gradient: string) {
  return TONE[gradient] ?? T.SURFACE_2;
}

/** Duration badge label from the album item's real media metadata. */
function fmtDuration(secs: number | null | undefined): string | null {
  if (!secs || secs <= 0 || !isFinite(secs)) return null;
  const s  = Math.floor(secs);
  const m  = Math.floor(s / 60);
  const sc = s % 60;
  return `${m}:${String(sc).padStart(2, '0')}`;
}

/**
 * Dedicated album IMAGE card — ratio-aware (uses the real media dimensions
 * from the server, square fallback), rounded corners, consistent with the
 * app's other image cards. Tapping opens the fullscreen image preview.
 */
function AlbumImageCard({ item, onPress }: { item: AlbumItem; onPress: () => void }) {
  const ratio = item.width && item.height && item.height > 0 ? item.width / item.height : 1;
  // Images have no thumbnail_url — the actual media URL IS the image. Fall
  // back to mediaUrl so purchased/owned image items render immediately instead
  // of showing a blank card until the user taps into the fullscreen preview.
  const uri = item.thumbnailUrl ?? item.mediaUrl;
  return (
    <Pressable
      style={[styles.albumCard, { width: THUMB_SIZE, height: THUMB_SIZE / ratio, backgroundColor: T.SURFACE_2 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View image"
    >
      {uri ? (
        <MsMediaLoader
          uri={uri}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel=""
          errorMessage=""
          fallback={null}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * Dedicated album VIDEO card — ratio-aware (real media dimensions, 16:9
 * fallback), thumbnail + play badge + duration. Tapping opens the standalone
 * video player (no post UI / comments / likes).
 */
function AlbumVideoCard({ item, onPress }: { item: AlbumItem; onPress: () => void }) {
  const ratio = item.width && item.height && item.height > 0 ? item.width / item.height : 16 / 9;
  return (
    <Pressable
      style={[styles.albumCard, { width: THUMB_SIZE, height: THUMB_SIZE / ratio, backgroundColor: T.SURFACE_2 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View video"
    >
      {item.thumbnailUrl ? (
        <MsMediaLoader
          uri={item.thumbnailUrl}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel=""
          errorMessage=""
          fallback={null}
        />
      ) : item.mediaUrl ? (
        // Album videos have no thumbnail_url — render the first decoded frame
        // of the real video so the card is never a blank black tile.
        <MsVideoThumbnail videoUri={item.mediaUrl} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.playBadge}>
        <Play size={10} color={T.TEXT} weight="fill" />
      </View>
      {fmtDuration(item.durationSecs) ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationBadgeText}>{fmtDuration(item.durationSecs)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [unlocking, setUnlocking] = useState(false);
  const [unlockedOverride, setUnlockedOverride] = useState<boolean | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  // Album items are media rows (not posts) — opening one shows a fullscreen
  // preview of its own media instead of navigating to the post viewer.
  const [previewItem, setPreviewItem] = useState<AlbumItem | null>(null);
  const [feedback, setFeedback] = useState<{
    variant: FeedbackVariant;
    title: string;
    message?: string;
    secondaryLabel?: string;
    onSecondary?: () => void;
  } | null>(null);
  const { refreshWallet } = useWalletBalance();

  const { data: album, isLoading, isError } = useAlbum(id ?? '');

  // isUnlockedByMe from the backend is the source of truth (server marks owned
  // albums and purchased albums as unlocked); unlockedOverride reflects a
  // successful unlock within the current session without a refetch.
  const isUnlockedByMe = unlockedOverride ?? album?.isUnlockedByMe ?? false;

  // Screen-capture protection is application-wide (see lib/screen-protection.ts)
  // — every MeetSweet screen, including paid-album content and its fullscreen
  // item preview, is protected from the moment the app launches.

  /** Run the actual purchase — success is only reported when the server's
   *  atomic transaction committed. Never fabricate a success locally. */
  const runPurchase = async () => {
    if (!album) return;
    setConfirmVisible(false);
    setUnlocking(true);
    try {
      const res = await purchaseAlbum(album.id);
      if (!res.purchased) {
        throw new Error('Purchase could not be completed.');
      }
      setUnlockedOverride(true);
      // The album purchase debits the wallet — refresh the shared balance so
      // the header badge reflects it immediately.
      if (!res.alreadyUnlocked) {
        refreshWallet();
      }
      // Re-fetch so the server-authoritative unlock state replaces the cached
      // "locked" snapshot (and stays correct on the next open).
      queryClient.invalidateQueries({ queryKey: ['album', album.id] });
      if (res.alreadyUnlocked) {
        // Owner / free / previously purchased — no new transaction was charged,
        // so this is NOT a fresh purchase success.
        setFeedback({
          variant: 'info',
          title: 'Already unlocked',
          message: `You already have full access to "${album.title}".`,
        });
      } else {
        setFeedback({
          variant: 'success',
          title: 'Album unlocked',
          message: `Purchase completed — you now have full access to "${album.title}".`,
        });
        // An important successful action — subtle confirmation chime.
        soundService.playSuccess(`album:${album.id}`);
      }
    } catch (err) {
      const msg = (err as Error).message ?? 'Please try again.';
      setFeedback({
        variant: 'error',
        title: 'Could not purchase',
        message: msg,
        ...((err as { code?: string }).code === 'INSUFFICIENT_BALANCE'
          ? {
              secondaryLabel: 'Top up wallet',
              onSecondary: () => {
                setFeedback(null);
                router.push('/wallet');
              },
            }
          : {}),
      });
    } finally {
      setUnlocking(false);
    }
  };

  const handleUnlock = () => {
    if (!album) return;
    setConfirmVisible(true);
  };

  const handleShare = () => {
    if (!album) return;
    setShareVisible(true);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.backRow}>
          <Pressable style={styles.backButton} onPress={() => goBack()}>
            <ArrowLeft size={20} color={T.TEXT} />
          </Pressable>
        </View>
        <View style={styles.skeletonWrap}>
          <MsPostSkeleton />
          <MsPostSkeleton />
          <MsPostSkeleton />
        </View>
      </MsAmbientBackground>
    );
  }

  // ── Error / not found ────────────────────────────────────────────────────────
  if (isError || !album) {
    return (
      <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.backRow}>
          <Pressable style={styles.backButton} onPress={() => goBack()}>
            <ArrowLeft size={20} color={T.TEXT} />
          </Pressable>
        </View>
        <View style={styles.loadingWrap}>
          <MsEmptyState
            title="Album not found"
            message="This album may have been removed or is unavailable."
            actionLabel="Go back"
            onAction={() => goBack()}
          />
        </View>
      </MsAmbientBackground>
    );
  }

  // A locked album exposes NO content preview — only album info, price, and
  // the Purchase option. The item grid (and every thumbnail) renders ONLY
  // after the server confirms the unlock (isUnlockedByMe).
  const isLocked = album.requiresPurchase && !isUnlockedByMe;

  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        {...useScrollMotion()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* ── Hero cover ─────────────────────────────────────────────────────── */}
        <View style={[styles.hero, { backgroundColor: tone(album.gradient) }]}>
          {album.coverUrl ? (
            <MsMediaLoader
              uri={album.coverUrl}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibleLabel={`${album.title} cover`}
              errorMessage=""
              fallback={null}
            />
          ) : null}

          {/* Gradient scrim */}
          <View style={styles.heroScrim} pointerEvents="none" />

          {/* Back button */}
          <View style={styles.backRow}>
            <Pressable style={styles.backButton} onPress={() => goBack()}>
              <ArrowLeft size={20} color={T.TEXT} />
            </Pressable>
          </View>
          {/* Share button */}
          <Pressable style={styles.shareButton} onPress={handleShare} accessibilityLabel="Share album">
            <ShareNetwork size={18} color={T.TEXT} />
          </Pressable>

          {/* Collection badge — same visual language as the Home/Explore cards */}
          <View style={styles.heroBadge}>
            <Images size={10} color={T.ACCENT_FG} weight="bold" />
            <Text style={styles.heroBadgeText}>COLLECTION</Text>
          </View>

          {/* Price badge */}
          {album.requiresPurchase && (
            <View style={styles.heroPriceBadge}>
              <BrandGradientFill />
              <Star size={10} color="#FFFFFF" weight="fill" />
              <Text style={styles.heroPriceText}>₦{album.price?.toLocaleString()}</Text>
            </View>
          )}
        </View>

        {/* ── Album info ──────────────────────────────────────────────────────── */}
        <View style={styles.info}>
          {/* Title */}
          <Text style={styles.albumTitle}>{album.title}</Text>

          {/* Creator row */}
          <TouchableOpacity
            style={styles.creatorRow}
            onPress={() => router.push(`/creator/${album.creatorId}`)}
            activeOpacity={0.8}
          >
            <MsAvatar
              size={34}
              initials={album.creatorInitials}
              imageUri={album.creatorAvatarUrl ?? undefined}
              showOnline={album.creatorIsOnline}
            />
            <View style={styles.creatorText}>
              <View style={styles.creatorNameRow}>
                <Text style={styles.creatorName}>{album.creatorName}</Text>
                {album.creatorIsVerified && <VerifiedBadge />}
              </View>
              <Text style={styles.creatorHandle}>{album.creatorHandle}</Text>
            </View>
            <View style={styles.viewProfileBtn}>
              <UserCircle size={14} color={T.TEXT_2} />
              <Text style={styles.viewProfileText}>Profile</Text>
            </View>
          </TouchableOpacity>

          {/* Description */}
          {album.description ? (
            <Text style={styles.description}>{album.description}</Text>
          ) : null}

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{album.itemCount}</Text>
              <Text style={styles.statLabel}>items</Text>
            </View>
            {album.requiresPurchase && (
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: T.GOLD }]}>
                  {album.price}
                </Text>
                <Text style={styles.statLabel}>Naira</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Unlock CTA ──────────────────────────────────────────────────────── */}
        {isLocked && (
          <GradientBorder radius={T.RADIUS.xl} surface={T.SURFACE} style={styles.unlockCardBorder}>
          <View style={styles.unlockCard}>
            <View style={styles.unlockIconWrap}>
              <BrandGradientFill />
              <Lock size={22} color="#FFFFFF" weight="bold" />
            </View>
            <View style={styles.unlockCopy}>
              <Text style={styles.unlockTitle}>Exclusive Album</Text>
              <Text style={styles.unlockSub}>
                Purchase all {album.itemCount} items for ₦{album.price?.toLocaleString()}.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.unlockButton, unlocking && { opacity: 0.6 }]}
              onPress={handleUnlock}
              activeOpacity={0.85}
              disabled={unlocking}
            >
              <BrandGradientFill />
              {unlocking
                ? <ActivityIndicator size="small" color={T.ACCENT_FG} />
                : <><Star size={13} color={T.ACCENT_FG} weight="fill" /><Text style={styles.unlockButtonText}>Purchase</Text></>}
            </TouchableOpacity>
          </View>
          </GradientBorder>
        )}

        {/* ── Item grid — ONLY visible when unlocked (never before purchase) ── */}
        {!isLocked && (
          <View style={styles.gridSection}>
            <View style={styles.gridHeader}>
              <Text style={styles.gridTitle}>All {album.itemCount} items</Text>
            </View>

            <View style={styles.grid}>
              {album.items.map((item) => (
                <View key={item.id}>
                  {item.type === 'video' ? (
                    <AlbumVideoCard item={item} onPress={() => setPreviewItem(item)} />
                  ) : (
                    <AlbumImageCard item={item} onPress={() => setPreviewItem(item)} />
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* ── Purchase confirmation (styled sheet) ── */}
      <MsModal
        visible={confirmVisible}
        onClose={() => { if (!unlocking) setConfirmVisible(false); }}
        title="Purchase album"
        subtitle={`${album.title} · ₦${album.price?.toLocaleString()}`}
        footer={
          <View style={styles.confirmFooter}>
            <TouchableOpacity
              style={[styles.confirmCancel, unlocking && styles.confirmDisabled]}
              onPress={() => setConfirmVisible(false)}
              disabled={unlocking}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmCancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBuy, unlocking && styles.confirmDisabled]}
              onPress={runPurchase}
              disabled={unlocking}
              activeOpacity={0.85}
            >
              <BrandGradientFill />
              {unlocking ? (
                <ActivityIndicator size="small" color={T.ACCENT_FG} />
              ) : (
                <><Star size={14} color={T.ACCENT_FG} weight="fill" /><Text style={styles.confirmBuyLabel}>Purchase · ₦{album.price?.toLocaleString()}</Text></>
              )}
            </TouchableOpacity>
          </View>
        }
      >
        <Text style={styles.confirmCopy}>
          The amount will be deducted from your wallet balance and the album will be unlocked permanently.
        </Text>
      </MsModal>

      {/* ── Purchase / unlock feedback (styled modal) ── */}
      <MsFeedbackModal
        visible={Boolean(feedback)}
        variant={feedback?.variant ?? 'info'}
        title={feedback?.title ?? ''}
        message={feedback?.message}
        secondaryLabel={feedback?.secondaryLabel}
        onSecondary={feedback?.onSecondary}
        onClose={() => setFeedback(null)}
      />

      <MsShareSheet
        visible={shareVisible}
        contentType="album"
        contentId={album.id}
        title={album.title}
        onClose={() => setShareVisible(false)}
      />

      {/* ── Fullscreen item preview ───────────────────────────────────────── */}
      <Modal
        visible={!!previewItem}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewItem(null)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: MEDIA_BG }}>
          <Pressable
            style={styles.previewClose}
            onPress={() => setPreviewItem(null)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
          >
            <X size={22} color="#fff" weight="bold" />
          </Pressable>
          {previewItem?.type === 'video' ? (
            <MsVideoPlayer
              videoId={`album-item-${previewItem.id}`}
              uri={previewItem.mediaUrl ?? null}
              qualities={previewItem.qualities}
              fillContainer
            />
          ) : (
            <MsMediaLoader
              uri={previewItem?.mediaUrl ?? previewItem?.thumbnailUrl ?? ''}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              accessibleLabel=""
              errorMessage=""
              fallback={null}
            />
          )}
        </View>
      </Modal>
    </MsAmbientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  scroll: { paddingBottom: 40 },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  skeletonWrap: {
    paddingTop: 16,
  },

  previewClose: {
    position: 'absolute',
    top: 52,
    right: 18,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero
  hero: {
    height: 320,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backRow: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
  },
  shareButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },
  // Same visual language as ExploreAlbumCard's collectionBadge (the reference
  // badge) — positioned next to the back button instead of under it.
  heroBadge: {
    position: 'absolute',
    top: 16,
    left: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.60)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: T.RADIUS.full,
  },
  heroBadgeText: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 8,
    letterSpacing: 1.1,
  },
  heroPriceBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: T.RADIUS.full,
  },
  heroPriceText: {
    color: '#FFFFFF',
    fontFamily: T.FONT.bold,
    fontSize: 11,
  },

  // Info section
  info: {
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 14,
  },
  albumTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 26,
    letterSpacing: -0.5,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  creatorText: { flex: 1, gap: 2 },
  creatorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  creatorName: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
  },
  creatorHandle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
  },
  viewProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
  },
  viewProfileText: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 12,
  },
  description: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  stat: { alignItems: 'center', gap: 2 },
  statValue: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 18,
    letterSpacing: -0.4,
  },
  statLabel: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
  },

  // Unlock card
  unlockCardBorder: {
    marginHorizontal: 20,
    marginTop: 22,
    borderRadius: T.RADIUS.xl,
    ...T.SHADOWS.medium,
  },
  unlockCard: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unlockIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  unlockCopy: { flex: 1, gap: 3 },
  unlockTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
  },
  unlockSub: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.GOLD,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: T.RADIUS.full,
    flexShrink: 0,
    ...T.SHADOWS.soft,
  },
  unlockButtonText: {
    color: T.ACCENT_FG,
    fontFamily: T.FONT.bold,
    fontSize: 13,
  },

  // Grid
  gridSection: {
    marginTop: 28,
  },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  gridTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 15,
  },
  gridSubtitle: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    paddingHorizontal: GRID_GAP,
  },
  albumCard: {
    borderRadius: T.RADIUS.md,
    overflow: 'hidden',
    position: 'relative',
  },
  blurredThumb: {
    opacity: 0.18,
  },
  playBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationBadgeText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  thumbLock: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,5,12,0.72)',
  },

  lockedRemainderThumb: {
    // same size as other thumbs
  },
  lockedRemainder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(8,5,12,0.82)',
  },
  lockedRemainderText: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 22,
    letterSpacing: -0.5,
  },
  lockedRemainderSub: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 11,
  },

  bottomSpace: { height: 32 },

  // Purchase confirmation sheet
  confirmCopy: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  confirmFooter: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancel: {
    flex: 1,
    height: 48,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelLabel: {
    color: T.TEXT_2,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
  },
  confirmBuy: {
    flex: 1.4,
    height: 48,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.GOLD,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  confirmBuyLabel: {
    color: T.ACCENT_FG,
    fontFamily: T.FONT.bold,
    fontSize: 14,
  },
  confirmDisabled: { opacity: 0.6 },
});
