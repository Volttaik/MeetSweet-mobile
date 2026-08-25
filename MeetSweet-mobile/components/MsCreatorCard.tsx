/**
 * MsCreatorCard
 *
 * A real-data creator card component.  All displayed information must be
 * passed as props — no fake/hardcoded data is generated internally.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Users, SealCheck } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';

export interface MsCreatorCardData {
  id: string;
  name: string;
  handle: string;
  bio?: string;
  category?: string;
  /** Pre-formatted subscriber count string, e.g. "12.4K" */
  subscriberCount?: string;
  /** Subscription price in Naira (₦) per month */
  subscriptionPrice?: number;
  isOnline?: boolean;
  isVerified?: boolean;
  avatarUrl?: string | null;
  initials?: string;
}

interface MsCreatorCardProps {
  creator: MsCreatorCardData;
  variant?: 'compact' | 'featured';
  onPress?: () => void;
  onSubscribe?: () => void;
}

function deriveInitials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name ?? '??').substring(0, 2).toUpperCase();
}

export function MsCreatorCard({
  creator,
  variant = 'compact',
  onPress,
  onSubscribe,
}: MsCreatorCardProps) {
  const avatarInitials = creator.initials || deriveInitials(creator.name);

  if (variant === 'compact') {
    return (
      <TouchableOpacity style={styles.compact} activeOpacity={0.75} onPress={onPress}>
        <MsAvatar
          size={58}
          initials={avatarInitials}
          showOnline={creator.isOnline}
          imageUri={creator.avatarUrl ?? undefined}
        />
        <View style={styles.compactNameRow}>
          <Text style={styles.compactName} numberOfLines={1}>
            {creator.name.split(' ')[0]}
          </Text>
          {creator.isVerified && <SealCheck size={12} color={T.TEXT} weight="fill" />}
        </View>
        <Text style={styles.compactHandle} numberOfLines={1}>{creator.handle}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.featured} activeOpacity={0.75} onPress={onPress}>
      {/* Top row: avatar + online status */}
      <View style={styles.featuredTop}>
        <MsAvatar
          size={50}
          initials={avatarInitials}
          showOnline={creator.isOnline}
          imageUri={creator.avatarUrl ?? undefined}
        />
        {creator.isOnline && <Text style={styles.onlineLabel}>● Online</Text>}
      </View>

      {/* Category tag — only render when available */}
      {creator.category ? (
        <View style={styles.categoryTag}>
          <Text style={styles.categoryTagText}>{creator.category.toUpperCase()}</Text>
        </View>
      ) : null}

      {/* Name + verified checkmark + handle */}
      <View style={styles.featuredNameRow}>
        <Text style={styles.featuredName} numberOfLines={1}>{creator.name}</Text>
        {creator.isVerified && <SealCheck size={14} color={T.TEXT} weight="fill" />}
      </View>
      <Text style={styles.featuredHandle} numberOfLines={1}>{creator.handle}</Text>
      {creator.bio ? (
        <Text style={styles.featuredBio} numberOfLines={2}>{creator.bio}</Text>
      ) : null}

      {/* Metrics: subscribers + price */}
      {(creator.subscriberCount || creator.subscriptionPrice) ? (
        <View style={styles.metrics}>
          {creator.subscriberCount ? (
            <View style={styles.metric}>
              <Users size={11} color={T.TEXT_3} />
              <Text style={styles.metricText}>{creator.subscriberCount}</Text>
            </View>
          ) : null}
          {creator.subscriptionPrice ? (
            <Text style={styles.priceText}>₦{creator.subscriptionPrice.toLocaleString()}/mo</Text>
          ) : null}
        </View>
      ) : null}

      {/* Subscribe button */}
      <TouchableOpacity
        style={styles.subscribeBtn}
        activeOpacity={0.8}
        onPress={onSubscribe ?? onPress}
      >
        <Text style={styles.subscribeBtnLabel}>Subscribe</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  compact: {
    width: 76,
    alignItems: 'center',
    gap: 5,
  },
  compactName: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    textAlign: 'center',
    flexShrink: 1,
  },
  compactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: 76,
    justifyContent: 'center',
  },
  compactHandle: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
  },

  featured: {
    width: 170,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    // No outline — card separation comes from surface contrast, never a line.
    padding: 14,
    gap: 4,
  },
  featuredTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  onlineLabel: {
    fontSize: 9,
    fontFamily: T.FONT.medium,
    color: T.SUCCESS,
    letterSpacing: 0.2,
    marginTop: 3,
  },
  categoryTag: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: T.SURFACE_2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: T.RADIUS.xs,
  },
  categoryTagText: {
    fontSize: 8,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.8,
  },
  featuredName: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    marginTop: 2,
    flexShrink: 1,
  },
  featuredNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featuredHandle: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },
  featuredBio: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    lineHeight: 18,
    marginTop: 3,
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  priceText: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  subscribeBtn: {
    marginTop: 8,
    height: 32,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeBtnLabel: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
});
