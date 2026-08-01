/**
 * MsDoubleTapLike — double-tap to like with heart explosion animation.
 * Wrap any content that should support double-tap like.
 */
import React, { useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Heart } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';

interface MsDoubleTapLikeProps {
  children: React.ReactNode;
  onDoubleTap?: () => void;
  onSingleTap?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: any;
}

export function MsDoubleTapLike({
  children,
  onDoubleTap,
  onSingleTap,
  onLongPress,
  disabled = false,
  style,
}: MsDoubleTapLikeProps) {
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Heart animation refs
  const heartScale   = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  const burstHeart = () => {
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.sequence([
        Animated.spring(heartScale, {
          toValue: 1,
          damping: 8,
          stiffness: 260,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.spring(heartScale, {
          toValue: 0.85,
          damping: 14,
          stiffness: 300,
          mass: 1,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  const handlePress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      lastTapRef.current = 0;
      burstHeart();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onDoubleTap?.();
    } else {
      lastTapRef.current = now;
      tapTimerRef.current = setTimeout(() => {
        onSingleTap?.();
      }, 310);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        activeOpacity={0.98}
        onPress={handlePress}
        onLongPress={onLongPress}
        delayLongPress={420}
        disabled={disabled}
        style={StyleSheet.absoluteFill}
      />
      {children}
      {/* Heart burst overlay */}
      <Animated.View
        style={[styles.heartOverlay, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]}
        pointerEvents="none"
      >
        <Heart size={88} color="#EF4444" weight="fill" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
