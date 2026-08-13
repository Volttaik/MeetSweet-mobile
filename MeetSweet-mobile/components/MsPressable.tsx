/**
 * MsPressable — spring micro-interaction wrapper.
 * Wraps any child with a scale-down + spring bounce press feedback.
 * Use anywhere you want premium interactive feel.
 */
import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Scale when pressed (default 0.93) */
  scale?: number;
  /** Opacity when pressed (default 0.82) */
  pressOpacity?: number;
  disabled?: boolean;
}

export function MsPressable({
  children,
  onPress,
  onLongPress,
  style,
  scale = 0.93,
  pressOpacity = 0.82,
  disabled = false,
}: Props) {
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: scale,
        useNativeDriver: true,
        damping: 15,
        stiffness: 320,
        mass: 0.6,
      }),
      Animated.timing(opacityAnim, {
        toValue: pressOpacity,
        duration: 70,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 12,
        stiffness: 240,
        mass: 0.6,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={style}
    >
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
