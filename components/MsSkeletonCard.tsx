import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { T } from '@/constants/theme';

/** Animated shimmer skeleton rectangle */
export function MsSkeletonCard({
  style,
  height = 120,
  radius = T.RADIUS.md,
}: {
  style?: ViewStyle;
  height?: number;
  radius?: number;
}) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ backgroundColor: T.SURFACE, height, borderRadius: radius, opacity }, style]}
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
  const opacity = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.25, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { backgroundColor: T.SURFACE_2, height, borderRadius: radius, width: width as number, opacity },
        style,
      ]}
    />
  );
}

/** Full post card skeleton — header + image area + footer */
export function MsPostSkeleton() {
  return (
    <View style={postStyles.card}>
      <View style={postStyles.header}>
        <MsSkeletonCard height={40} radius={20} style={{ width: 40 }} />
        <View style={postStyles.headerText}>
          <MsSkeletonRow width="55%" height={12} />
          <MsSkeletonRow width="38%" height={10} />
        </View>
      </View>
      <MsSkeletonCard height={200} radius={T.RADIUS.lg} style={{ marginTop: 12 }} />
      <View style={postStyles.footer}>
        <MsSkeletonRow width={56} height={10} />
        <MsSkeletonRow width={56} height={10} />
        <MsSkeletonRow width={40} height={10} />
      </View>
    </View>
  );
}

const postStyles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 7 },
  footer: { flexDirection: 'row', gap: 16, marginTop: 14 },
});
