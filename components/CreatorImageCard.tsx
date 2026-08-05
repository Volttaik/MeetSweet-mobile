/**
 * CreatorImageCard — Compact half-width image card for the Creators feed.
 *
 * Used in pairs (2-column grid) inside the Creators mode to display
 * creator photos at a glance. Intentionally minimal — the image is the hero.
 *
 * Differences from ExploreImageCard:
 * - Half-width, portrait ratio (takes CARD_WIDTH as a prop)
 * - Smaller creator avatar chip (22px)
 * - No body section — only the image area with overlaid meta
 * - Compact premium overlay (icon + label, no big unlock button)
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CheckCircle,
  Lock,
  Star,
} from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';
import type { ExploreImageCardData } from '@/components/ExploreImageCard';

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

interface CreatorImageCardProps {
  card: ExploreImageCardData;
  /** Card width — caller computes based on available space */
  width: number;
  onPress: () => void;
  onCreatorPress?: () => void;
  onLongPress?: () => void;
}

export function CreatorImageCard({
  card,
  width,
  onPress,
  onCreatorPress,
  onLongPress,
}: CreatorImageCardProps) {
  // Portrait ratio — slightly taller than square for visual interest
  const height = Math.round(width * 1.22);

  return (
    <Pressable
      style={[styles.card, { width, ...T.SHADOWS.medium }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`Photo by ${card.creatorName}${card.caption ? ': ' + card.caption : ''}`}
    >
      {/* ── Image area ───────────────────────────────────────── */}
      <View style={[styles.imageWrap, { height, backgroundColor: bg(card.gradient) }]}>

        {/* Photo */}
        {card.imageUrl ? (
          <MsMediaLoader
            uri={card.imageUrl}
            style={[StyleSheet.absoluteFill, card.isPremium && styles.dimmed]}
            resizeMode="cover"
            accessibleLabel={card.isPremium ? 'Locked photo' : (card.caption || 'Photo')}
            errorMessage=""
            fallback={null}
          />
        ) : null}

        {/* Bottom gradient scrim */}
        <View style={styles.scrim} pointerEvents="none" />

        {/* Premium overlay — compact lock icon centred */}
        {card.isPremium && (
          <View style={styles.lockOverlay} pointerEvents="box-none">
            <View style={styles.lockCircle}>
              <Lock size={16} color={T.TEXT} weight="bold" />
            </View>
          </View>
        )}

        {/* Subscriber-only badge — top right (never shown in Explore, only in subscriber feeds) */}
        {card.isPremium && (
          <View style={styles.premiumBadge}>
            <Star size={8} color="#fff" weight="fill" />
            <Text style={styles.premiumText}>SUBSCRIBER</Text>
          </View>
        )}

        {/* Creator chip — bottom left */}
        <TouchableOpacity
          style={styles.creatorChip}
          onPress={onCreatorPress ?? onPress}
          activeOpacity={0.85}
          hitSlop={6}
        >
          <MsAvatar
            size={22}
            initials={card.creatorInitials}
            imageUri={card.creatorAvatarUrl ?? undefined}
            showOnline={card.creatorIsOnline}
          />
          {card.creatorIsVerified && (
            <CheckCircle size={11} color="rgba(255,255,255,0.8)" weight="fill" />
          )}
        </TouchableOpacity>

        {/* Caption overlay — bottom, truncated */}
        {card.caption ? (
          <View style={styles.captionStrip} pointerEvents="none">
            <Text style={styles.captionText} numberOfLines={1}>{card.caption}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
  },

  imageWrap: {
    position: 'relative',
    justifyContent: 'flex-end',
  },

  dimmed: { opacity: 0.15 },

  scrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,5,14,0.55)',
    zIndex: 2,
  },
  lockCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  premiumBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: T.ACCENT,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: T.RADIUS.full,
    zIndex: 3,
  },
  premiumText: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 7,
    letterSpacing: 0.8,
  },

  creatorChip: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    zIndex: 4,
  },

  captionStrip: {
    position: 'absolute',
    bottom: 8,
    left: 36,
    right: 8,
    zIndex: 3,
  },
  captionText: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: T.FONT.medium,
    fontSize: 10,
    lineHeight: 14,
  },
});
