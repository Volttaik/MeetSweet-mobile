/**
 * MsImageCard — wide image card for photo posts in the Explore feed.
 *
 * Shows the actual photo prominently (full-width, 4:3), creator identity
 * overlaid at the bottom, caption below. No play button — images don't play.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Heart, Lock } from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';

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

export function MsImageCard({
  card,
  onPress,
  onCreatorPress,
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
        {/* Real image */}
        {card.imageUrl ? (
          <MsMediaLoader
            uri={card.imageUrl}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibleLabel={card.title}
            errorMessage=""
            fallback={null}
          />
        ) : null}

        {/* Premium lock overlay */}
        {card.isPremium && (
          <View style={styles.lockOverlay}>
            <View style={styles.lockCircle}>
              <Lock size={18} color={T.TEXT} weight="bold" />
            </View>
            <Text style={styles.lockLabel}>Subscribe to view</Text>
          </View>
        )}

        {/* Bottom scrim + creator identity (overlaid on image) */}
        <View style={styles.scrim} pointerEvents="none" />
        <View style={styles.imageFooter}>
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
            <View style={styles.creatorChipText}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {card.creatorName}
              </Text>
              {card.creatorIsVerified && (
                <Check size={10} color="rgba(255,255,255,0.75)" weight="fill" />
              )}
            </View>
          </TouchableOpacity>

          {/* Premium badge */}
          {card.isPremium && (
            <View style={styles.premiumPill}>
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
          {card.uploadDate ? (
            <Text style={styles.metaDot}>·</Text>
          ) : null}
          {card.uploadDate ? (
            <Text style={styles.metaText}>{card.uploadDate}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const IMAGE_HEIGHT = 240;

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },

  imageWrap: {
    height: IMAGE_HEIGHT,
    position: 'relative',
    justifyContent: 'flex-end',
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,6,14,0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 2,
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
  lockLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: T.FONT.medium,
    fontSize: 13,
  },

  scrim: {
    ...StyleSheet.absoluteFillObject,
    // Gradient-like bottom scrim via a semi-transparent bottom portion
    backgroundColor: 'transparent',
    // We simulate the scrim with a bottom-aligned view below
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
    paddingTop: 28,
    // Dark gradient scrim
    backgroundColor: 'rgba(0,0,0,0)',
  },
  imageFooterScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },

  creatorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderRadius: T.RADIUS.full,
    paddingRight: 10,
    paddingLeft: 4,
    paddingVertical: 3,
    backdropFilter: 'blur(8px)',
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
    maxWidth: 120,
  },

  premiumPill: {
    backgroundColor: T.ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.RADIUS.full,
  },
  premiumText: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 8,
    letterSpacing: 0.6,
  },

  body: {
    padding: 12,
    gap: 5,
  },
  caption: {
    color: T.TEXT,
    fontFamily: T.FONT.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11 },
  metaDot: { color: T.TEXT_3, fontSize: 11 },
});
