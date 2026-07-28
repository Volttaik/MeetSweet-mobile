/**
 * MsShimmer — reusable skeleton shimmer using Reanimated + LinearGradient.
 * Renders a moving highlight that sweeps left-to-right over a dark base.
 *
 * Usage:
 *   <MsShimmer width={240} height={14} radius={7} />
 *   <MsShimmer width="100%" height={190} radius={12} />
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from '@/constants/theme';

interface MsShimmerProps {
  width?: number | `${number}%` | 'auto';
  height?: number;
  radius?: number;
  style?: ViewStyle;
  /** Override the base background colour */
  baseColor?: string;
  /** Override the highlight colour */
  highlightColor?: string;
  /** Animation duration per sweep (ms). Default: 1400 */
  duration?: number;
}

export function MsShimmer({
  width = '100%',
  height = 14,
  radius = 6,
  style,
  baseColor = T.SURFACE,
  highlightColor = 'rgba(255,255,255,0.065)',
  duration = 1400,
}: MsShimmerProps) {
  const translateX = useSharedValue(-1);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${translateX.value * 100}%` as any }],
  }));

  return (
    <View
      style={[
        styles.root,
        { width: width as any, height, borderRadius: radius, backgroundColor: baseColor },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
        <LinearGradient
          colors={['transparent', highlightColor, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
});
