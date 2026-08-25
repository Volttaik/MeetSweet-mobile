/**
 * Shared "flying heart" burst used by the Shorts like gesture (and the video
 * like button) — one polished, brand-native heart animation for every like
 * across the video experience.
 *
 * The heart is a custom SVG glyph filled with the MeetSweet brand gradient
 * (the same colors / stops / direction as every other brand surface), so it
 * looks like a deliberate platform interaction rather than an emoji dropped
 * on screen. It is larger than the old emoji, floats up along a slightly
 * varied trajectory per instance, pops in then settles, and fades out — all
 * driven on the UI thread via reanimated shared values so it stays smooth
 * while video plays and cleans itself up after completion.
 */
import React, { useCallback, useEffect, useRef, useState, useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AppGradients } from '@/constants/theme';

export interface HeartInstance {
  id: number;
  x: number;
  y: number;
}

// Heart glyph — smooth Bézier "favorite" shape (viewBox 0 0 24 24).
const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

const HEART_SIZE     = 66; // pt — substantially larger than the old emoji
const GRAD_COLORS = AppGradients.brand;
const GRAD_LOCS   = AppGradients.brandLocs;
// Whisper-thin light edge keeps the gradient silhouette crisp against dark
// video while staying subtle enough for bright backgrounds (same treatment as
// every other gradient glyph in the app).
const HEART_EDGE      = 'rgba(255,255,255,0.42)';
const HEART_EDGE_WIDTH = 0.6; // viewBox units ≈ hairline at this scale

/** Spawns a bounded handful of stacked hearts with random drift + rotation. */
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
    // Slight random offset so stacked hearts from rapid double-taps overlap
    // naturally instead of sitting perfectly on top of one another.
    const jitter = (Math.random() - 0.5) * 40;
    setHearts(prev => [...prev.slice(-4), { id, x: x + jitter, y }]);
    setTimeout(() => setHearts(prev => prev.filter(h => h.id !== id)), 1500);
  }, []);

  return { hearts, spawnHeart };
}

/**
 * A single animated gradient heart. Every instance seeds its own random arc,
 * so repeated bursts never look mechanically identical.
 */
export function FlyingHeart({ x, y }: { x: number; y: number }) {
  // Unique gradient id (never collide, incl. web).
  const gradIdRef = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Per-instance variety: horizontal drift + tilt + a touch of size variance.
  const drift     = useRef((Math.random() - 0.5) * 56).current;   // -28..28 px sideways
  const rise      = useRef(120 + Math.random() * 46).current;     // 120..166 px upward
  const tiltDeg   = useRef(-14 + Math.random() * 28).current;     // -14..14 deg
  const sizeScale = useRef(0.92 + Math.random() * 0.16).current;  // 0.92..1.08

  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Horizontal drift maps linearly to the vertical rise: out + in cubic gives a
  // gentle sideways arc rather than a straight vertical float.
  const translateX = useSharedValue(0);
  const scale      = useSharedValue(0.2);
  // Slight counter-rotation as the heart settles keeps it lively on the way up.
  const rotate     = useSharedValue(tiltDeg);

  useEffect(() => {
    // 1) Pop in: starts large, then settles as it begins to rise.
    scale.value = withSequence(
      withSpring(1.18 * sizeScale, { damping: 7, stiffness: 260 }),
      withSpring(0.94 * sizeScale, { damping: 8, stiffness: 120 }),
    );
    // 2) Float upward with a horizontally-arched drift.
    translateY.value = withTiming(-rise, {
      duration: 1080,
      easing: Easing.out(Easing.cubic),
    });
    translateX.value = withTiming(drift, {
      duration: 1080,
      easing: Easing.inOut(Easing.cubic),
    });
    rotate.value = withTiming(tiltDeg * 0.6, {
      duration: 1080,
      easing: Easing.out(Easing.quad),
    });
    // 3) Fade in fast, hold, then fade out as it travels up.
    opacity.value = withSequence(
      withTiming(1,    { duration: 140, easing: Easing.out(Easing.ease) }),
      withTiming(1,    { duration: 520 }),
      withTiming(0,    { duration: 420, easing: Easing.in(Easing.ease) }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.wrap,
        { left: x - HEART_SIZE / 2, top: y - HEART_SIZE / 2, width: HEART_SIZE, height: HEART_SIZE },
        style,
      ]}
      pointerEvents="none"
    >
      <Svg width={HEART_SIZE} height={HEART_SIZE} viewBox="0 0 24 24">
        <Defs>
          {/* Same brand mesh & direction used across every brand surface. */}
          <LinearGradient id={gradIdRef} x1="1" y1="0" x2="0" y2="1">
            {GRAD_COLORS.map((c, i) => (
              <Stop key={i} offset={GRAD_LOCS[i]} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        {/**
         * Painted twice: a slightly larger dark under-shape gives a crisp,
         * readable silhouette when hearts stack tightly, then the gradient
         * heart on top keeps the vibrant brand fill as the primary identity.
         */}
        <Path
          d={HEART_PATH}
          fill="rgba(0,0,0,0.28)"
          transform={`translate(0 0.4)`}
        />
        <Path
          d={HEART_PATH}
          fill={`url(#${gradIdRef})`}
          stroke={HEART_EDGE}
          strokeWidth={HEART_EDGE_WIDTH}
        />
      </Svg>
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
});