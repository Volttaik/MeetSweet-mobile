/**
 * ExploreAlbumCard — Dedicated card for Album collections.
 *
 * Albums are premium curated collections — they deserve an elevated,
 * distinct visual presentation that communicates:
 *   "This is a premium collection, not a single post."
 *
 * Design language:
 * - Taller cover image with layered stack preview thumbnails
 * - Prominent COLLECTION badge
 * - Creator identity, item count, description
 * - For premium: accent-coloured unlock button with credit price
 * - Subscribe-then-purchase workflow communicated via UI
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
  CheckCircle,
  Images,
  Lock,
  Star,
} from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';
import type { AlbumCardData } from '@/services/albums';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
// Taller cover — collections deserve vertical space
const COVER_HEIGHT = 240;

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

function tone(gradient: string) {
  return TONE[gradient] ?? T.SURFACE_2;
}

interface ExploreAlbumCardProps {
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
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`Album: ${album.title} by ${album.creatorName}, ${album.itemCount} items`}
    >
      {/* ── Cover image ────────────────────────────────────── */}
      <View style={[styles.coverWrap, { backgroundColor: tone(album.gradient) }]}>

        {/* Main cover */}
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

        {/* Rich dark scrim for legibility */}
        <View style={styles.coverScrim} pointerEvents="none" />

        {/* Stacked preview thumbnails — top-right, fanned out */}
        {album.previewUrls.length >= 2 && (
          <View style={styles.stackWrap}>
            {album.previewUrls.slice(0, 3).reverse().map((url, i) => (
              <View
                key={url + i}
                style={[
                  styles.stackThumb,
                  {
                    right: i * 12,
                    zIndex: i,
                    opacity: 1 - i * 0.20,
                    transform: [{ rotate: `${i * 4}deg` }],
                  },
                ]}
              >
                <MsMediaLoader
                  uri={url}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  accessibleLabel=""
                  errorMessage=""
                  fallback={null}
                />
              </View>
            ))}
          </View>
        )}

        {/* COLLECTION badge — top left */}
        <View style={styles.collectionBadge}>
          <Images size={11} color="#fff" weight="bold" />
          <Text style={styles.collectionBadgeText}>COLLECTION</Text>
        </View>

        {/* Premium indicator — top right (alongside stack) */}
        {album.isPremium && (
          <View style={styles.premiumBadge}>
            <Star size={9} color={T.ACCENT} weight="fill" />
            <Text style={styles.premiumBadgeText}>PREMIUM</Text>
          </View>
        )}

        {/* Bottom info overlay */}
        <View style={styles.coverFooter}>
          {/* Item count pill */}
          <View style={styles.countPill}>
            <Text style={styles.countText}>{album.itemCount} items</Text>
          </View>

          {/* Price pill for premium */}
          {album.isPremium && (
            <View style={styles.pricePill}>
              <Star size={10} color={T.ACCENT} weight="fill" />
              <Text style={styles.priceText}>{album.priceCredits} credits</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Card body ──────────────────────────────────────── */}
      <View style={styles.body}>
        {/* Album title */}
        <Text style={styles.title} numberOfLines={1}>
          {album.title}
        </Text>

        {/* Description */}
        {album.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {album.description}
          </Text>
        ) : null}

        {/* Footer — creator + CTA */}
        <View style={styles.footer}>
          {/* Creator identity */}
          <TouchableOpacity
            style={styles.creatorRow}
            onPress={onCreatorPress ?? onPress}
            activeOpacity={0.8}
            hitSlop={6}
          >
            <MsAvatar
              size={28}
              initials={album.creatorInitials}
              imageUri={album.creatorAvatarUrl ?? undefined}
              showOnline={album.creatorIsOnline}
            />
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {album.creatorName}
              </Text>
              {album.creatorIsVerified && (
                <CheckCircle size={12} color={T.TEXT_3} weight="fill" />
              )}
            </View>
          </TouchableOpacity>

          {/* CTA button */}
          {album.isPremium ? (
            <TouchableOpacity
              style={styles.unlockButton}
              onPress={onUnlockPress ?? onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Unlock album for ${album.priceCredits} credits`}
            >
              <Lock size={11} color="#fff" weight="bold" />
              <Text style={styles.unlockText}>Unlock · {album.priceCredits}cr</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.viewButton}
              onPress={onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.viewText}>View all</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },

  coverWrap: {
    height: COVER_HEIGHT,
    position: 'relative',
    justifyContent: 'flex-end',
  },

  coverScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },

  // Stacked fanned thumbnails
  stackWrap: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 80,
    height: 62,
  },
  stackThumb: {
    position: 'absolute',
    top: 0,
    width: 56,
    height: 62,
    borderRadius: T.RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  collectionBadge: {
    position: 'absolute',
    top: 16,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.62)',
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

  premiumBadge: {
    position: 'absolute',
    top: 54,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(196,90,114,0.22)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: T.RADIUS.full,
  },
  premiumBadgeText: {
    color: T.ACCENT,
    fontFamily: T.FONT.bold,
    fontSize: 8,
    letterSpacing: 0.8,
  },

  coverFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingTop: 36,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  countPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: T.RADIUS.full,
  },
  countText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(196,90,114,0.28)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: T.RADIUS.full,
  },
  priceText: {
    color: T.ACCENT,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },

  body: {
    padding: 16,
    gap: 6,
  },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 17,
    letterSpacing: -0.4,
  },
  description: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
    lineHeight: 18,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  creatorName: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 12,
    flexShrink: 1,
  },

  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: T.RADIUS.full,
    ...T.SHADOWS.soft,
  },
  unlockText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
  viewButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE_2,
  },
  viewText: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
});
