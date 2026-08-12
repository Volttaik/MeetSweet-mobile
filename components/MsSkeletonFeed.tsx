/**
 * MsSkeletonFeed — shimmer skeleton for the home feed loading state.
 * Renders compact post card skeletons matching the updated card sizes.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MsShimmer } from '@/components/MsShimmer';
import { T } from '@/constants/theme';

function SkeletonCard() {
  return (
    <View style={styles.card}>
      {/* Author row */}
      <View style={styles.authorRow}>
        <MsShimmer width={34} height={34} borderRadius={17} />
        <View style={styles.authorLines}>
          <MsShimmer width="42%" height={11} />
          <MsShimmer width="28%" height={9} />
        </View>
      </View>
      {/* Caption */}
      <View style={styles.caption}>
        <MsShimmer width="88%" height={11} />
        <MsShimmer width="66%" height={11} />
      </View>
      {/* Media placeholder */}
      <MsShimmer width="100%" height={190} borderRadius={0} />
      {/* Actions */}
      <View style={styles.actions}>
        <MsShimmer width={50} height={26} borderRadius={13} />
        <MsShimmer width={50} height={26} borderRadius={13} />
      </View>
      {/* Divider */}
      <View style={styles.divider} />
    </View>
  );
}

interface MsSkeletonFeedProps {
  count?: number;
}

export function MsSkeletonFeed({ count = 3 }: MsSkeletonFeedProps) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: T.BG },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  authorLines: { flex: 1, gap: 6 },
  caption: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 6,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  divider: {
    height: 6,
    backgroundColor: T.SURFACE,
  },
});
