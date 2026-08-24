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
  StyleSheet,
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

  // The caller's LAYOUT properties must reach the children, which live inside
  // the animated wrapper — not just on the outer Pressable. The wrapper is a
  // plain View with default column layout and inherits nothing, so converting
  // a multi-child flex row (chat list rows, settings rows, action rows,
  // headers, explore cards) into MsPressable collapsed its children into a
  // vertical stack — the global "everything is misaligned" regression.
  //
  // Fix: apply the caller's style to the wrapper too, minus the properties
  // that must not double up (padding/margin/opacity stay on the outer
  // Pressable only), and force the wrapper to fill the Pressable's box so
  // flex:1 children and justifyContent:space-between resolve correctly.
  const flatStyle = StyleSheet.flatten(style) as ViewStyle | undefined;
  const wrapperLayout: ViewStyle | undefined = flatStyle
    ? (() => {
        const copy: Record<string, unknown> = { ...flatStyle };
        // Padding/margin stay on the outer Pressable — doubling them would
        // inset the content twice. Opacity is animated on this wrapper.
        delete copy.padding;        delete copy.paddingTop;    delete copy.paddingRight;
        delete copy.paddingBottom;  delete copy.paddingLeft;   delete copy.paddingHorizontal;
        delete copy.paddingVertical;
        delete copy.margin;         delete copy.marginTop;     delete copy.marginRight;
        delete copy.marginBottom;   delete copy.marginLeft;    delete copy.marginHorizontal;
        delete copy.marginVertical;
        delete copy.opacity;
        return copy as ViewStyle;
      })()
    : undefined;

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
      <Reanimated.View
        style={[
          wrapperLayout,
          { flex: 1, alignSelf: 'stretch' },
          animatedStyle,
        ]}
      >
        {children}
      </Reanimated.View>
    </Pressable>
  );
}
