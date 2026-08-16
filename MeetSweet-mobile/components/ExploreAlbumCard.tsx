/**
 * ExploreAlbumCard — Premium collection card with a 3D stacked-cards effect.
 *
 * Three physical cards rendered in depth:
 *   - Two back cards (rotated, semi-transparent) that peek out from behind
 *   - One front card using the ExploreImageCard design language
 *
 * The stacked-card silhouette communicates "collection" without any label.
 * The front face is identical to the explore image card so the feed feels
 * unified — large cover, creator chip overlay, caption + stats below.
 */
import React from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SealCheck,
  Heart,
  Images,
  Lock,
  Star,
} from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';
import type { AlbumCardData } from '@/services/albums';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH  = SCREEN_WIDTH - 32;
const IMAGE_HEIGHT = Math.round(CARD_WIDTH * 0.88);

const TONE: Record<string, string> = {
  violet:  '#1B1128',
  rose:    '#1C0E13',
  amber:   '#1C1508',
  teal:    '#091A18',
  indigo:  '#0E0F1E',
  emerald: '#0B1A12',
  sky:     '#091520',
  fuchsia: '#1A0E1C',
};

function tone(gradient: string): string {
  return TONE[gradient] ?? T.SURFACE_2;
}

export interface ExploreAlbumCardProps {
  album: AlbumCardData;
  onPress: () => void;
  onCreatorPress?: () => void;
  onUnlockPress?: () => void;
  onLongPress?: () => void;
}

export function ExploreAlbumCard({
  album,
  onPress,
  onCreatorPress,
  onUnlockPress,
  onLongPress,
}: ExploreAlbumCardProps) {
  const bg = tone(album.gradient);

  return (
    /**
     * Stack wrapper — overflow visible so the rotated back-card corners
     * can peek out below the front card. paddingTop absorbs the few pixels
     * the back cards' top corners extend upward. paddingBottom gives room
     * for the larger bottom extension.
     */
    <View style={styles.stackWrapper}>

      {/* ── Back card 2 (furthest) ─────────────────────────────────────── */}
      <View
        style={[
          styles.backCard,
          styles.backCard2,
          { backgroundColor: bg },
        ]}
      />

      {/* ── Back card 1 (middle) ──────────────────────────────────────── */}
      <View
        style={[
          styles.backCard,
          styles.backCard1,
          { backgroundColor: bg },
        ]}
      />

      {/* ── Front card ────────────────────────────────────────────────── */}
      <Pressable
        style={styles.frontShadow}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`Album: ${album.title} by ${album.creatorName}, ${album.itemCount} items`}
      >
        <View style={styles.frontCard}>

          {/* ── Cover image ─────────────────────────────────────────── */}
          <View style={[styles.imageWrap, { backgroundColor: bg }]}>

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

            {/* Bottom scrim */}
            <View style={styles.bottomScrim} pointerEvents="none" />

            {/* Purchase lock overlay */}
            {album.requiresPurchase && (
              <View style={styles.lockOverlay} pointerEvents="box-none">
                <View style={styles.lockCircle}>
                  <Lock size={22} color={T.TEXT} weight="bold" />
                </View>
                <Text style={styles.lockTitle}>Purchase to Unlock</Text>
                {album.price ? (
                  <View style={styles.lockPriceRow}>
                    <Star size={12} color={T.ACCENT} weight="fill" />
                    <Text style={styles.lockPrice}>₦{album.price.toLocaleString()}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.unlockButton}
                  onPress={onUnlockPress ?? onPress}
                  activeOpacity={0.85}
                >
                  <Lock size={12} color={T.BG} weight="bold" />
                  <Text style={styles.unlockText}>Purchase</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* COLLECTION badge — top left */}
            <View style={styles.collectionBadge}>
              <Images size={10} color="#fff" weight="bold" />
              <Text style={styles.collectionBadgeText}>COLLECTION</Text>
            </View>

            {/* Item count — top right */}
            <View style={styles.itemCountBadge}>
              <Text style={styles.itemCountText}>{album.itemCount} items</Text>
            </View>

            {/* Creator chip + premium pill — bottom overlay */}
            <View style={styles.imageFooter} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.creatorChip}
                onPress={onCreatorPress ?? onPress}
                activeOpacity={0.85}
                hitSlop={6}
              >
                <MsAvatar
                  size={28}
                  initials={album.creatorInitials}
                  imageUri={album.creatorAvatarUrl ?? undefined}
                  showOnline={album.creatorIsOnline}
                />
                <View style={styles.creatorChipInner}>
                  <Text style={styles.creatorName} numberOfLines={1}>
                    {album.creatorName}
                  </Text>
                  {album.creatorIsVerified && (
                    <SealCheck size={13} color={T.TEXT} weight="fill" />
                  )}
                </View>
              </TouchableOpacity>

              {album.requiresPurchase && (
                <View style={styles.premiumPill}>
                  <Star size={8} color="#fff" weight="fill" />
                  <Text style={styles.premiumText}>PURCHASE</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Card body ───────────────────────────────────────────── */}
          <View style={styles.body}>

            {/* Handle + date row */}
            <View style={styles.metaTopRow}>
              <Text style={styles.handle} numberOfLines={1}>
                {album.creatorHandle}
              </Text>
              <View style={styles.countRow}>
                <Heart size={11} color={T.TEXT_3} />
                <Text style={styles.countLabel}>{album.itemCount} items</Text>
              </View>
            </View>

            {/* Album title */}
            <Text style={styles.title} numberOfLines={2}>
              {album.title}
            </Text>

            {/* Description */}
            {album.description ? (
              <Text style={styles.description} numberOfLines={2}>
                {album.description}
              </Text>
            ) : null}

            {/* Footer CTA */}
            <View style={styles.footerRow}>
              <View style={styles.footerLeft}>
                <Images size={13} color={T.TEXT_3} />
                <Text style={styles.footerMeta}>{album.itemCount} items in collection</Text>
              </View>
              {album.requiresPurchase ? (
                <TouchableOpacity
                  style={styles.ctaUnlock}
                  onPress={onUnlockPress ?? onPress}
                  activeOpacity={0.85}
                >
                  <Lock size={11} color="#fff" weight="bold" />
                  <Text style={styles.ctaUnlockText}>
                    {album.price ? `Purchase · ₦${album.price.toLocaleString()}` : 'Purchase'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.ctaView}
                  onPress={onPress}
                  activeOpacity={0.85}
                >
                  <Text style={styles.ctaViewText}>View all</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({

  // ── Stack wrapper ──────────────────────────────────────────────────────────
  stackWrapper: {
    // paddingTop absorbs the few px the back-card top corners extend upward
    // paddingBottom gives room for the larger bottom corner peek
    paddingTop: 14,
    paddingBottom: 20,
    marginHorizontal: 16,
    // overflow: 'visible' is the RN default — rotated corners will show
  },

  // Back cards: absolute-fill the stackWrapper so they match front-card size.
  // Rotation makes their bottom corners extend below the front card.
  backCard: {
    position: 'absolute',
    // Inset slightly to match front card margins (frontShadow has no extra margin)
    top: 14,    // == paddingTop of stackWrapper
    left: 0,
    right: 0,
    bottom: 20, // == paddingBottom of stackWrapper
    borderRadius: T.RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...T.SHADOWS.medium,
  },
  backCard2: {
    transform: [{ rotate: '-4.8deg' }, { translateY: -4 }],
    opacity: 0.55,
  },
  backCard1: {
    transform: [{ rotate: '3.2deg' }, { translateY: -2 }],
    opacity: 0.75,
  },

  // ── Front card ─────────────────────────────────────────────────────────────
  frontShadow: {
    borderRadius: T.RADIUS.xl,
    ...T.SHADOWS.hard,
  },
  frontCard: {
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: T.SURFACE,
  },

  // ── Cover image ────────────────────────────────────────────────────────────
  imageWrap: {
    height: IMAGE_HEIGHT,
    position: 'relative',
    justifyContent: 'flex-end',
  },

  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 110,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 2,
    backgroundColor: 'rgba(8,5,14,0.70)',
  },
  lockCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.medium,
  },
  lockTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  lockPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockPrice: {
    color: T.ACCENT,
    fontFamily: T.FONT.bold,
    fontSize: 17,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: T.TEXT,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: T.RADIUS.full,
    marginTop: 4,
    ...T.SHADOWS.soft,
  },
  unlockText: {
    color: T.BG,
    fontFamily: T.FONT.bold,
    fontSize: 14,
  },

  collectionBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.60)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: T.RADIUS.full,
  },
  collectionBadgeText: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 9,
    letterSpacing: 1.1,
  },

  itemCountBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.60)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: T.RADIUS.full,
  },
  itemCountText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 10,
  },

  imageFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  creatorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: T.RADIUS.full,
    paddingRight: 12,
    paddingLeft: 4,
    paddingVertical: 4,
  },
  creatorChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  creatorName: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 12,
    maxWidth: 130,
  },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.ACCENT,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
  },
  premiumText: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 8,
    letterSpacing: 0.8,
  },

  // ── Card body ──────────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 6,
  },
  metaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  handle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 12,
    flex: 1,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countLabel: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
  },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.4,
  },
  description: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  footerMeta: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
  },

  ctaUnlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.ACCENT,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: T.RADIUS.full,
    ...T.SHADOWS.soft,
  },
  ctaUnlockText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
  ctaView: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE_2,
  },
  ctaViewText: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
});
