/**
 * MsSkeletonCard — shimmer skeleton primitives used for loading states.
 * Replaced HeroUI pulse with a custom LinearGradient sweep (MsShimmer)
 * for a more premium, consistent shimmer effect.
 */
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { MsShimmer } from '@/components/MsShimmer';
import { T } from '@/constants/theme';

interface MsSkeletonCardProps {
  style?: ViewStyle;
  height?: number;
  radius?: number;
}

/** Animated shimmer rectangle — wraps content or stands alone. */
export function MsSkeletonCard({
  style,
  height = 120,
  radius = T.RADIUS.md,
}: MsSkeletonCardProps) {
  return (
    <MsShimmer
      height={height}
      radius={radius}
      baseColor={T.SURFACE}
      highlightColor="rgba(255,255,255,0.07)"
      duration={1300}
      style={style}
    />
  );
}

/** Skeleton row — for building complex multi-line skeletons */
export function MsSkeletonRow({
  width = '100%' as string | number,
  height = 12,
  radius = T.RADIUS.xs,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  return (
    <MsShimmer
      width={width as any}
      height={height}
      radius={radius}
      baseColor={T.SURFACE_2}
      highlightColor="rgba(255,255,255,0.06)"
      duration={1500}
      style={style}
    />
  );
}

/** Full post card skeleton — header + image area + footer */
export function MsPostSkeleton() {
  return (
    <View style={postStyles.card}>
      {/* Header */}
      <View style={postStyles.header}>
        <MsSkeletonCard height={38} radius={19} style={{ width: 38 }} />
        <View style={postStyles.headerText}>
          <MsSkeletonRow width="55%" height={12} />
          <MsSkeletonRow width="38%" height={10} />
        </View>
      </View>
      {/* Content */}
      <MsSkeletonCard height={190} radius={T.RADIUS.md} style={{ marginTop: 12 }} />
      {/* Footer */}
      <View style={postStyles.footer}>
        <MsSkeletonRow width={60} height={10} />
        <MsSkeletonRow width={60} height={10} />
        <MsSkeletonRow width={40} height={10} />
      </View>
    </View>
  );
}

const postStyles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 4,
    paddingBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 6 },
  footer: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 14,
  },
});
