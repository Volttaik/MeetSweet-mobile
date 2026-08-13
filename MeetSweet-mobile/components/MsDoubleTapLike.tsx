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
  const heartRotate  = useRef(new Animated.Value(0)).current;

  const burstHeart = () => {
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    heartRotate.setValue(Math.random() > 0.5 ? 1 : -1);

    Animated.parallel([
      Animated.sequence([
        Animated.spring(heartScale, {
          toValue: 1.15,
          damping: 7,
          stiffness: 280,
          mass: 0.7,
          useNativeDriver: true,
        }),
        Animated.spring(heartScale, {
          toValue: 0.9,
          damping: 12,
          stiffness: 300,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(heartRotate, {
        toValue: 0,
        damping: 10,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(380),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 220,
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

  const spin = heartRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-12deg', '0deg', '12deg'],
  });

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
      {/* Heart burst overlay with rotation & rose glow */}
      <Animated.View
        style={[
          styles.heartOverlay,
          {
            opacity: heartOpacity,
            transform: [{ scale: heartScale }, { rotate: spin }],
          },
        ]}
        pointerEvents="none"
      >
        <View style={styles.heartGlow}>
          <Heart size={92} color="#F43F5E" weight="fill" />
        </View>
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
    zIndex: 99,
  },
  heartGlow: {
    shadowColor: '#F43F5E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 10,
  },
});
