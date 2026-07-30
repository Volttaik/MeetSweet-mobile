/**
 * Shared "flying heart" burst used by MsVideoPlayer, the video watch screen,
 * and Shorts like buttons — one consistent animation for every like gesture
 * in the video experience.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export interface HeartInstance {
  id: number;
  x: number;
  y: number;
}

/** Spawns up to a handful of stacked hearts with random drift + rotation. */
export function useHeartBurst() {
  const idRef = useRef(0);
  const lastRef = useRef(0);
  const [hearts, setHearts] = useState<HeartInstance[]>([]);

  const spawnHeart = useCallback((x: number, y: number, opts?: { throttleMs?: number }) => {
    const now = Date.now();
    const throttle = opts?.throttleMs ?? 0;
    if (throttle && now - lastRef.current < throttle) return;
    lastRef.current = now;
    const id = ++idRef.current;
    const jitter = (Math.random() - 0.5) * 36;
    setHearts(prev => [...prev.slice(-5), { id, x: x + jitter, y }]);
    setTimeout(() => setHearts(prev => prev.filter(h => h.id !== id)), 1400);
  }, []);

  return { hearts, spawnHeart };
}

export function FlyingHeart({ x, y }: { x: number; y: number }) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale      = useSharedValue(0.3);
  const rotate     = useSharedValue(0);

  useEffect(() => {
    // Random tilt so stacked hearts never look identical.
    rotate.value = (Math.random() - 0.5) * 28;
    scale.value   = withSpring(1.15, { damping: 6, stiffness: 220 });
    opacity.value = withSequence(
      withTiming(1,    { duration: 160, easing: Easing.out(Easing.ease) }),
      withTiming(0.95, { duration: 500 }),
      withTiming(0,    { duration: 380, easing: Easing.in(Easing.ease) }),
    );
    translateY.value = withTiming(-110, {
      duration: 1050,
      easing: Easing.out(Easing.quad),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.wrap, { left: x - 18, top: y - 18 }, style]} pointerEvents="none">
      <Text style={styles.icon}>♥</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 36,
    color: '#FF4D6D',
  },
});
