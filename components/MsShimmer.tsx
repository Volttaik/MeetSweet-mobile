/**
 * MsShimmer — reusable shimmer skeleton component.
 * Use for loading states throughout the app.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { T } from '@/constants/theme';

interface MsShimmerProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function MsShimmer({ width = '100%', height = 16, borderRadius = 6, style }: MsShimmerProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.15] });

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: T.TEXT },
        { opacity },
        style,
      ]}
    />
  );
}

/** Preset shimmer layouts for common content types */
export function MsShimmerPostCard() {
  return (
    <View style={shimStyles.card}>
      {/* Author row */}
      <View style={shimStyles.authorRow}>
        <MsShimmer width={34} height={34} borderRadius={17} />
        <View style={{ flex: 1, gap: 6 }}>
          <MsShimmer width="45%" height={11} />
          <MsShimmer width="30%" height={9} />
        </View>
      </View>
      {/* Caption */}
      <View style={shimStyles.caption}>
        <MsShimmer width="90%" height={11} />
        <MsShimmer width="70%" height={11} />
      </View>
      {/* Media */}
      <MsShimmer width="100%" height={200} borderRadius={0} />
      {/* Actions */}
      <View style={shimStyles.actions}>
        <MsShimmer width={52} height={28} borderRadius={14} />
        <MsShimmer width={52} height={28} borderRadius={14} />
      </View>
    </View>
  );
}

export function MsShimmerUserRow() {
  return (
    <View style={shimStyles.userRow}>
      <MsShimmer width={38} height={38} borderRadius={19} />
      <View style={{ flex: 1, gap: 6 }}>
        <MsShimmer width="50%" height={12} />
        <MsShimmer width="35%" height={10} />
      </View>
    </View>
  );
}

const shimStyles = StyleSheet.create({
  card: { backgroundColor: T.BG, paddingBottom: 8 },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
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
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 12,
  },
});
