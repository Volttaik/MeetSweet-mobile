/**
 * PressScale — shared tactile press wrapper for video-experience buttons.
 *
 * Scales 1.0 → 0.94 → 1.0 with a fast spring so every icon button (play,
 * pause, replay, fullscreen, like, comment, share, volume, orientation)
 * feels identically responsive.
 */
import React from 'react';
import { Platform, Pressable, StyleProp, ViewStyle, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MOTION } from '@/constants/motion';

interface PressScaleProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function PressScale({ children, style, onPressIn, onPressOut, ...rest }: PressScaleProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={[
          style,
          // No browser focus ring around video-control buttons on web.
          Platform.OS === 'web' ? ({ outlineStyle: 'none' as never, outlineWidth: 0 } as object) : null,
        ]}
        onPressIn={(e) => {
          scale.value = withSpring(MOTION.PRESS_SCALE, { damping: 14, stiffness: 400 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 10, stiffness: 260 });
          onPressOut?.(e);
        }}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
