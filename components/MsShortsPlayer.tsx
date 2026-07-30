/**
 * MsShortsPlayer — immersive short-form video player.
 *
 * Icon contract (simple, always in sync):
 *   isPlaying=true  → Pause icon, dim opacity (tap to pause)
 *   isPlaying=false → Play  icon, clear opacity (tap to resume)
 *   Both are driven directly from the native status callback — no deferred
 *   swaps, no isTapping guards, no iconKind state.
 *
 * Premium gate: pause at 3 s, fire onPremiumRequired, block any resumption.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { Pause, Play } from 'phosphor-react-native';
import type { Short } from '@/services/content';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item: Short;
  /** Whether this Short is the currently visible item in the feed. */
  active: boolean;
  /**
   * Actual page height measured by the parent container.
   * Falls back to Dimensions SCREEN_HEIGHT if not provided.
   */
  pageHeight?: number;
  onViewProgress?: (seconds: number) => void;
  onPremiumRequired?: () => void;
  onError?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsShortsPlayer({
  item,
  active,
  pageHeight,
  onViewProgress,
  onPremiumRequired,
  onError,
}: Props) {
  // Use the measured container height — never the raw SCREEN_HEIGHT which
  // includes the tab bar and causes the dark gap at the bottom.
  const ph = pageHeight ?? SCREEN_HEIGHT;

  const videoRef        = useRef<Video>(null);
  const startedAt       = useRef<number | null>(null);
  const premiumFired    = useRef(false);
  const premiumGatedRef = useRef(false);
  /**
   * Ref mirror of isPlaying — handleTap reads this to avoid stale closures.
   * Updated in onPlaybackStatusUpdate alongside setIsPlaying.
   */
  const isPlayingRef = useRef(false);

  const [premiumGated, setPremiumGated] = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [progress,     setProgress]     = useState(0);

  // ── Animated values ────────────────────────────────────────────────────────
  // iconOpacity: fades between dim (playing) and bright (paused)
  // iconScale:   brief scale-up pulse on tap for tactile feedback
  const iconOpacity = useSharedValue(0);
  const iconScale   = useSharedValue(1);
  const iconStyle   = useAnimatedStyle(() => ({
    opacity:   iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  // ── Reset when item changes ────────────────────────────────────────────────
  useEffect(() => {
    premiumFired.current    = false;
    premiumGatedRef.current = false;
    isPlayingRef.current    = false;
    setPremiumGated(false);
    setProgress(0);
    setIsPlaying(false);
    iconOpacity.value = 0;
    iconScale.value   = 1;
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync icon directly with actual playback state ─────────────────────────
  // No isTapping guards, no iconKind swaps — opacity is always driven by
  // isPlaying so the icon can never drift out of sync with reality.
  useEffect(() => {
    if (!active) {
      iconOpacity.value = withTiming(0, { duration: 200 });
      return;
    }
    // Playing → hidden; Paused → bright play icon
    iconOpacity.value = withTiming(isPlaying ? 0 : 0.85, {
      duration: 250,
      easing: Easing.inOut(Easing.ease),
    });
  }, [isPlaying, active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── View-progress tracking ─────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      if (startedAt.current !== null) {
        onViewProgress?.((Date.now() - startedAt.current) / 1000);
        startedAt.current = null;
      }
      return;
    }
    startedAt.current = Date.now();
    return () => {
      if (startedAt.current !== null) {
        onViewProgress?.((Date.now() - startedAt.current) / 1000);
        startedAt.current = null;
      }
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tap handler ───────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (premiumGatedRef.current) return;

    // Scale pulse — tactile feedback independent of icon state
    iconScale.value = withSequence(
      withTiming(1.18, { duration: 80,  easing: Easing.out(Easing.ease) }),
      withTiming(1.0,  { duration: 180, easing: Easing.in(Easing.ease) }),
    );

    // Read from ref — always the latest native state, never a stale closure
    if (isPlayingRef.current) {
      videoRef.current?.pauseAsync().catch(() => {});
    } else {
      videoRef.current?.playAsync().catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback status ────────────────────────────────────────────────────────
  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      const playing = status.isPlaying ?? false;
      isPlayingRef.current = playing;
      setIsPlaying(playing);

      const dur = status.durationMillis ?? 0;
      if (dur > 0) {
        setProgress((status.positionMillis ?? 0) / dur);
      }

      // Premium gate: pause at 3 s
      if (item.isPremium && !premiumFired.current && (status.positionMillis ?? 0) >= 3000) {
        premiumFired.current    = true;
        premiumGatedRef.current = true;
        videoRef.current?.pauseAsync().catch(() => {});
        setPremiumGated(true);
        onPremiumRequired?.();
        return;
      }

      // Re-enforce gate if native resumed while gated
      if (premiumGatedRef.current && status.isPlaying) {
        videoRef.current?.pauseAsync().catch(() => {});
      }
    },
    [item.isPremium, onPremiumRequired],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Use ph (measured container height) — not SCREEN_HEIGHT — to eliminate
    // the dark gap caused by the tab bar eating into available space.
    <View style={[styles.root, { height: ph }]}>
      {/* Poster thumbnail — behind video */}
      {item.thumbnailUrl ? (
        <MsMediaLoader
          uri={item.thumbnailUrl}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel="Short thumbnail"
        />
      ) : null}

      {/* Video */}
      {item.videoUrl ? (
        <Video
          ref={videoRef}
          source={{ uri: item.videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={active && !premiumGated}
          isLooping
          useNativeControls={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={onError}
        />
      ) : null}

      {/* Full-area tap target */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      />

      {/* Centre play/pause icon — always correct, driven by isPlaying */}
      <Animated.View style={[styles.iconWrap, iconStyle]} pointerEvents="none">
        <View style={styles.iconCircle}>
          {isPlaying
            ? <Pause size={22} color="#fff" weight="fill" />
            : <Play  size={22} color="#fff" weight="fill" />
          }
        </View>
      </Animated.View>

      {/* Slim progress bar */}
      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: SCREEN_WIDTH * progress }]} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    width: SCREEN_WIDTH,
    // height is applied via inline style using ph (measured container height)
    backgroundColor: '#050506',
  },

  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressTrack: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    zIndex: 6,
  },
  progressFill: {
    height: 3,
    backgroundColor: T.ACCENT,
  },
});
