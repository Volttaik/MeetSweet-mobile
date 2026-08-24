/**
 * MsPressable — spring micro-interaction wrapper.
 * Wraps any child with a scale-down + spring bounce press feedback.
 * Use anywhere you want premium interactive feel.
 *
 * The press animation runs as a Reanimated worklet on the UI thread (no
 * JS-thread Animated orchestration), and an optional native haptic can fire
 * on press-in.
 */
import React from 'react';
import {
  Pressable,
  StyleProp,
  ViewStyle,
  type AccessibilityRole,
  type GestureResponderEvent,
  type Insets,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface Props {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  /** Called on press-in in addition to the scale/opacity feedback. */
  onPressIn?: (event: GestureResponderEvent) => void;
  /** Called on press-out in addition to the scale/opacity feedback. */
  onPressOut?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  /** Scale when pressed (default 0.93) */
  scale?: number;
  /** Opacity when pressed (default 0.82) */
  pressOpacity?: number;
  disabled?: boolean;
  /** Fire a light selection haptic on press-in. */
  haptic?: boolean;
  /** Long-press delay in ms (default 350). */
  delayLongPress?: number;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: { disabled?: boolean };
  hitSlop?: Insets | number;
}

export function MsPressable({
  children,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  style,
  scale = 0.93,
  pressOpacity = 0.82,
  disabled = false,
  haptic = false,
  delayLongPress = 350,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  hitSlop,
}: Props) {
  const scaleAnim   = useSharedValue(1);
  const opacityAnim = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
    opacity: opacityAnim.value,
  }));

  const handlePressIn = (event: GestureResponderEvent) => {
    scaleAnim.value = withSpring(scale, { damping: 15, stiffness: 320, mass: 0.6 });
    opacityAnim.value = withTiming(pressOpacity, { duration: 70 });
    if (haptic) Haptics.selectionAsync().catch(() => {});
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    scaleAnim.value = withSpring(1, { damping: 12, stiffness: 240, mass: 0.6 });
    opacityAnim.value = withTiming(1, { duration: 100 });
    onPressOut?.(event);
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      delayLongPress={delayLongPress}
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      hitSlop={hitSlop}
    >
      <Reanimated.View style={animatedStyle}>
        {children}
      </Reanimated.View>
    </Pressable>
  );
}
