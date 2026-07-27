/**
 * MsImageCard — Wide image card for photo posts in the Explore feed.
 *
 * Full-width 4:3 image preview with creator identity overlaid at the bottom.
 * Premium posts show a blurred image, a lock overlay, the credit price,
 * and an Unlock button — never exposing the protected image.
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
import { Check, Heart, Lock, Star } from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const IMAGE_HEIGHT = Math.round(CARD_WIDTH * 0.72);

export interface ImageCardData {
  id: string;
  title: string;
  likes: string;
  uploadDate: string;
  isPremium: boolean;
  lockedLabel?: string;
  /** Actual image URL */
  imageUrl?: string | null;
  /** Fallback solid background colour key */
  gradient: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl?: string | null;
}

interface MsImageCardProps {
  card: ImageCardData;
  onPress: () => void;
  onCreatorPress?: () => void;
  onUnlockPress?: () => void;
  onLongPress?: () => void;
}

const FALLBACK: Record<string, string> = {
  violet:  '#1B1128',
  rose:    '#1C0E13',
  amber:   '#1C1508',
  teal:    '#091A18',
  indigo:  '#0E0F1E',
  emerald: '#0B1A12',
  sky:     '#091520',
  fuchsia: '#1A0E1C',
};

function bg(gradient: string) {
  return FALLBACK[gradient] ?? T.SURFACE_2;
}

/** Extract numeric price from lockedLabel like "50 credits" → "50cr" */
function priceLabel(lockedLabel?: string): string {
  if (!lockedLabel) return '';
  const match = lockedLabel.match(/(\d+)/);
  return match ? `${match[1]} cr` : lockedLabel;
}

export function MsImageCard({
  card,
  onPress,
  onCreatorPress,
  onUnlockPress,
  onLongPress,
}: MsImageCardProps) {
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${card.title} by ${card.creatorName}`}
    >
      {/* ── Image area ─────────────────────────────────────── */}
      <View style={[styles.imageWrap, { backgroundColor: bg(card.gradient) }]}>

        {/* Real image — dimmed if premium so shape is visible but content protected */}
        {card.imageUrl ? (
          <MsMediaLoader
            uri={card.imageUrl}
            style={[StyleSheet.absoluteFill, card.isPremium && styles.dimmedImage]}
            resizeMode="cover"
            accessibleLabel={card.isPremium ? 'Locked image' : card.title}
            errorMessage=""
            fallback={null}
          />
        ) : null}

        {/* Gradient scrim — bottom fade for legibility */}
        <View style={styles.bottomScrim} pointerEvents="none" />

        {/* Premium lock overlay */}
        {card.isPremium && (
          <View style={styles.lockOverlay}>
            <View style={styles.lockCircle}>
              <Lock size={20} color={T.TEXT} weight="bold" />
            </View>
            <View style={styles.lockInfo}>
              <Text style={styles.lockTitle}>Premium Content</Text>
              {card.lockedLabel && card.lockedLabel !== 'Free' ? (
                <View style={styles.lockPriceRow}>
                  <Star size={11} color={T.ACCENT} weight="fill" />
                  <Text style={styles.lockPrice}>{priceLabel(card.lockedLabel)}</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.unlockButton}
              onPress={onUnlockPress ?? onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Unlock this content"
            >
              <Lock size={11} color={T.BG} weight="bold" />
              <Text style={styles.unlockText}>Unlock</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom: creator chip + premium badge */}
        <View style={styles.imageFooter}>
          <TouchableOpacity
            style={styles.creatorChip}
            onPress={onCreatorPress ?? onPress}
            activeOpacity={0.85}
            hitSlop={6}
          >
            <MsAvatar
              size={26}
              initials={card.creatorInitials}
              imageUri={card.creatorAvatarUrl ?? undefined}
              showOnline={card.creatorIsOnline}
            />
            <View style={styles.creatorChipText}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {card.creatorName}
              </Text>
              {card.creatorIsVerified && (
                <Check size={10} color="rgba(255,255,255,0.75)" weight="fill" />
              )}
            </View>
          </TouchableOpacity>

          {card.isPremium && (
            <View style={styles.premiumPill}>
              <Star size={8} color="#fff" weight="fill" />
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Caption + meta ─────────────────────────────────── */}
      <View style={styles.body}>
        {card.title ? (
          <Text style={styles.caption} numberOfLines={2}>
            {card.title}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {card.likes ? (
            <View style={styles.metaItem}>
              <Heart size={11} color={T.TEXT_3} />
              <Text style={styles.metaText}>{card.likes}</Text>
            </View>
          ) : null}
          {card.likes && card.uploadDate ? <Text style={styles.metaDot}>·</Text> : null}
          {card.uploadDate ? (
            <Text style={styles.metaText}>{card.uploadDate}</Text>
          ) : null}
          {card.isPremium && card.lockedLabel && card.lockedLabel !== 'Free' ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.priceTag}>{priceLabel(card.lockedLabel)}</Text>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },

  imageWrap: {
    height: IMAGE_HEIGHT,
    position: 'relative',
    justifyContent: 'flex-end',
  },

  dimmedImage: {
    opacity: 0.25,
  },

  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 2,
    backgroundColor: 'rgba(8,5,14,0.62)',
  },
  lockCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },
  lockInfo: {
    alignItems: 'center',
    gap: 5,
  },
  lockTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
  },
  lockPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  lockPrice: {
    color: T.ACCENT,
    fontFamily: T.FONT.bold,
    fontSize: 15,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.TEXT,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: T.RADIUS.full,
    marginTop: 4,
    ...T.SHADOWS.soft,
  },
  unlockText: {
    color: T.BG,
    fontFamily: T.FONT.bold,
    fontSize: 13,
  },

  imageFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 3,
  },
  creatorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderRadius: T.RADIUS.full,
    paddingRight: 10,
    paddingLeft: 4,
    paddingVertical: 3,
  },
  creatorChipText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    paddingVertical: 4,
    borderRadius: T.RADIUS.full,
  },
  premiumText: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 8,
    letterSpacing: 0.6,
  },

  body: {
    padding: 14,
    gap: 6,
  },
  caption: {
    color: T.TEXT,
    fontFamily: T.FONT.medium,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11 },
  metaDot:  { color: T.TEXT_3, fontSize: 11 },
  priceTag: {
    color: T.ACCENT,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
});
