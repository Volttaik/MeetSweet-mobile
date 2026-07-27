/**
 * MsAlbumCard — Feed card for an Album content type.
 *
 * Visually distinct from image/video cards. Shows a cover image with
 * layered preview thumbnails to communicate "this is a collection",
 * premium badge, item count, creator info, and an unlock price for
 * premium albums.
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
import { Check, Images, Lock, Star } from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';
import type { AlbumCardData } from '@/services/albums';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const COVER_HEIGHT = 220;

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

interface MsAlbumCardProps {
  album: AlbumCardData;
  onPress: () => void;
  onCreatorPress?: () => void;
  onUnlockPress?: () => void;
  onLongPress?: () => void;
}

export function MsAlbumCard({
  album,
  onPress,
  onCreatorPress,
  onUnlockPress,
  onLongPress,
}: MsAlbumCardProps) {
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`Album: ${album.title} by ${album.creatorName}`}
    >
      {/* ── Cover image with layered preview thumbnails ── */}
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

        {/* Dark scrim over cover */}
        <View style={styles.coverScrim} pointerEvents="none" />

        {/* Stacked preview thumbnails — top-right corner */}
        {album.previewUrls.length >= 2 && (
          <View style={styles.stackWrap}>
            {album.previewUrls.slice(0, 3).reverse().map((url, i) => (
              <View
                key={url + i}
                style={[
                  styles.stackThumb,
                  {
                    right: i * 10,
                    zIndex: i,
                    opacity: 1 - i * 0.22,
                    transform: [{ rotate: `${i * 3}deg` }],
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

        {/* Collection badge — top left */}
        <View style={styles.collectionBadge}>
          <Images size={11} color={T.TEXT} weight="bold" />
          <Text style={styles.collectionBadgeText}>COLLECTION</Text>
        </View>

        {/* Premium lock overlay for paid albums */}
        {album.isPremium && (
          <View style={styles.lockOverlay} pointerEvents="none">
            <View style={styles.lockCircle}>
              <Lock size={16} color={T.TEXT} weight="bold" />
            </View>
          </View>
        )}

        {/* Bottom info row overlaid on cover */}
        <View style={styles.coverFooter}>
          {/* Item count */}
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{album.itemCount} items</Text>
          </View>

          {/* Premium price */}
          {album.isPremium && (
            <View style={styles.priceBadge}>
              <Star size={9} color={T.ACCENT} weight="fill" />
              <Text style={styles.priceText}>{album.priceCredits} credits</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Card body ── */}
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

        {/* Footer — creator + unlock button */}
        <View style={styles.footer}>
          {/* Creator identity */}
          <TouchableOpacity
            style={styles.creatorRow}
            onPress={onCreatorPress ?? onPress}
            activeOpacity={0.8}
            hitSlop={6}
          >
            <MsAvatar
              size={26}
              initials={album.creatorInitials}
              imageUri={album.creatorAvatarUrl ?? undefined}
              showOnline={album.creatorIsOnline}
            />
            <View style={styles.creatorText}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {album.creatorName}
              </Text>
              {album.creatorIsVerified && (
                <Check size={10} color={T.TEXT_3} weight="fill" />
              )}
            </View>
          </TouchableOpacity>

          {/* Unlock / View button */}
          {album.isPremium ? (
            <TouchableOpacity
              style={styles.unlockButton}
              onPress={onUnlockPress ?? onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Unlock for ${album.priceCredits} credits`}
            >
              <Lock size={11} color={T.BG} weight="bold" />
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
    backgroundColor: 'rgba(0,0,0,0.32)',
  },

  stackWrap: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 72,
    height: 56,
  },
  stackThumb: {
    position: 'absolute',
    top: 0,
    width: 52,
    height: 56,
    borderRadius: T.RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
  },

  collectionBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
  },
  collectionBadgeText: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 9,
    letterSpacing: 1,
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,5,12,0.52)',
  },
  lockCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
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
    paddingTop: 32,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  countBadge: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
  },
  countText: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(196,90,114,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
  },
  priceText: {
    color: T.ACCENT,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },

  body: {
    padding: 14,
    gap: 6,
  },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 16,
    letterSpacing: -0.3,
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
    marginTop: 6,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  creatorText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    ...T.SHADOWS.soft,
  },
  unlockText: {
    color: T.BG,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
  viewButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE_2,
  },
  viewText: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
});
