/**
 * ExploreImageCard — Dedicated card for IMAGE posts only.
 *
 * This component is exclusively for photo/image content.
 * It NEVER renders video UI, play buttons, or duration badges.
 * The image is the hero — large, breathing, photographic.
 *
 * Premium images are blurred with a lock overlay and unlock price.
 * Creator identity, caption, and engagement stats are shown below.
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
  ChatCircle,
  CheckCircle,
  Heart,
  Lock,
  Star,
} from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
// Tall, photographic 4:5-ish ratio — images deserve vertical space
const IMAGE_HEIGHT = Math.round(CARD_WIDTH * 1.05);

export interface ExploreImageCardData {
  id: string;
  /** Caption or title for the post */
  caption: string;
  likes: string;
  comments: string;
  uploadDate: string;
  isPremium: boolean;
  lockedLabel?: string;
  /** Actual image URL */
  imageUrl?: string | null;
  /** Fallback background colour key */
  gradient: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl?: string | null;
}

interface ExploreImageCardProps {
  card: ExploreImageCardData;
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

function priceLabel(lockedLabel?: string): string {
  if (!lockedLabel) return '';
  // lockedLabel is already formatted as ₦X from the service layer
  return lockedLabel;
}

export function ExploreImageCard({
  card,
  onPress,
  onCreatorPress,
  onUnlockPress,
  onLongPress,
}: ExploreImageCardProps) {
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`Photo by ${card.creatorName}${card.caption ? `: ${card.caption}` : ''}`}
    >
      {/* ── Hero image ────────────────────────────────────── */}
      <View style={[styles.imageWrap, { backgroundColor: bg(card.gradient) }]}>

        {/* Real image — blurred/dimmed if premium */}
        {card.imageUrl ? (
          <MsMediaLoader
            uri={card.imageUrl}
            style={[StyleSheet.absoluteFill, card.isPremium && styles.blurredImage]}
            resizeMode="cover"
            accessibleLabel={card.isPremium ? 'Locked premium image' : (card.caption || 'Photo')}
            errorMessage=""
            fallback={null}
          />
        ) : null}

        {/* Gradient scrim — bottom fade for creator chip legibility */}
        <View style={styles.bottomScrim} pointerEvents="none" />

        {/* Premium lock overlay — full overlay, centred lock + price */}
        {card.isPremium && (
          <View style={styles.lockOverlay} pointerEvents="box-none">
            <View style={styles.lockCircle}>
              <Lock size={22} color={T.TEXT} weight="bold" />
            </View>
            <Text style={styles.lockTitle}>Premium Photo</Text>
            {card.lockedLabel && card.lockedLabel !== 'Free' ? (
              <View style={styles.lockPriceRow}>
                <Star size={12} color={T.ACCENT} weight="fill" />
                <Text style={styles.lockPrice}>{priceLabel(card.lockedLabel)}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.unlockButton}
              onPress={onUnlockPress ?? onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Unlock this photo"
            >
              <Lock size={12} color={T.BG} weight="bold" />
              <Text style={styles.unlockText}>Unlock</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Creator chip — bottom left, always visible */}
        <View style={styles.imageFooter} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.creatorChip}
            onPress={onCreatorPress ?? onPress}
            activeOpacity={0.85}
            hitSlop={6}
          >
            <MsAvatar
              size={28}
              initials={card.creatorInitials}
              imageUri={card.creatorAvatarUrl ?? undefined}
              showOnline={card.creatorIsOnline}
            />
            <View style={styles.creatorChipInner}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {card.creatorName}
              </Text>
              {card.creatorIsVerified && (
                <CheckCircle size={13} color="rgba(255,255,255,0.85)" weight="fill" />
              )}
            </View>
          </TouchableOpacity>

          {/* Premium badge */}
          {card.isPremium && (
            <View style={styles.premiumPill}>
              <Star size={8} color="#fff" weight="fill" />
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Caption + engagement ──────────────────────────── */}
      <View style={styles.body}>
        {/* Handle + time */}
        <View style={styles.metaTopRow}>
          <Text style={styles.handle}>{card.creatorHandle}</Text>
          <Text style={styles.uploadDate}>{card.uploadDate}</Text>
        </View>

        {/* Caption */}
        {card.caption ? (
          <Text style={styles.caption} numberOfLines={2}>
            {card.caption}
          </Text>
        ) : null}

        {/* Engagement */}
        <View style={styles.engagementRow}>
          <View style={styles.engagementItem}>
            <Heart size={13} color={T.TEXT_3} />
            <Text style={styles.engagementText}>{card.likes || '0'}</Text>
          </View>
          <View style={styles.engagementItem}>
            <ChatCircle size={13} color={T.TEXT_3} />
            <Text style={styles.engagementText}>{card.comments || '0'}</Text>
          </View>
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

  blurredImage: {
    opacity: 0.18,
  },

  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    // Gradient fade — use a dark-to-transparent scrim via backgroundColor
    backgroundColor: 'rgba(0,0,0,0)',
    // We layer two views for a proper fade effect
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 2,
    backgroundColor: 'rgba(8,5,14,0.68)',
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
    // Bottom scrim inline
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
    maxWidth: 140,
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
  },
  uploadDate: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
  },
  caption: {
    color: T.TEXT,
    fontFamily: T.FONT.medium,
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 2,
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  engagementText: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 12,
  },
});
