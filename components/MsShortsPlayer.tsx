/**
 * MsShortsPlayer — immersive short-form video player.
 *
 * No native controls bar. Custom tap-to-play/pause overlay with smooth fade
 * animations. Slim accent-colour progress bar at the bottom edge.
 *
 * Playback contract:
 *   shouldPlay={active && !premiumGated}  ← scroll-driven auto-play/pause
 *   imperativeplay/pauseAsync              ← user-tap driven
 * These are compatible because React Native only sends a prop update to the
 * native layer when the value changes; imperative calls mid-play do not
 * conflict as long as we do NOT also imperatively call play/pause from
 * effects that fire in response to the same state change as shouldPlay.
 *
 * Premium gate: pause at 3 s, fire onPremiumRequired, block any resumption.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
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
  onViewProgress?: (seconds: number) => void;
  onPremiumRequired?: () => void;
  onError?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsShortsPlayer({
  item,
  active,
  onViewProgress,
  onPremiumRequired,
  onError,
}: Props) {
  const videoRef       = useRef<Video>(null);
  const startedAt      = useRef<number | null>(null);
  const premiumFired   = useRef(false);
  const premiumGatedRef = useRef(false);
  /**
   * True during and briefly after a user tap so the isPlaying effect does not
   * overwrite the tap animation while it is still running.
   */
  const isTapping = useRef(false);

  const [premiumGated, setPremiumGated] = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [progress,     setProgress]     = useState(0);
  /**
   * Which icon to render inside the circle.
   * 'play' = persistent paused indicator OR "you just hit play" flash.
   * 'pause' = "you just hit pause" flash (switches back to 'play' as icon fades).
   */
  const [iconKind, setIconKind] = useState<'play' | 'pause'>('play');

  // Drives the centre-icon circle opacity (0 = hidden, 0.8 = resting-paused, 1 = flash)
  const iconOpacity = useSharedValue(0);
  const iconStyle   = useAnimatedStyle(() => ({ opacity: iconOpacity.value }));

  // ── Reset when item changes ────────────────────────────────────────────────
  useEffect(() => {
    premiumFired.current    = false;
    premiumGatedRef.current = false;
    isTapping.current       = false;
    setPremiumGated(false);
    setProgress(0);
    setIsPlaying(false);
    setIconKind('play');
    iconOpacity.value = 0;
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync icon with play-state changes driven by shouldPlay (scroll) ────────
  useEffect(() => {
    if (isTapping.current) return; // tap animation owns the opacity right now
    if (!active) {
      // Off-screen Short: hide icon immediately
      iconOpacity.value = 0;
      return;
    }
    iconOpacity.value = withTiming(isPlaying ? 0 : 0.8, {
      duration: 280,
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

    const wasPlaying  = isPlaying;
    const targetBase  = wasPlaying ? 0.8 : 0; // settled opacity after action

    isTapping.current = true;
    setTimeout(() => { isTapping.current = false; }, 800);

    if (wasPlaying) {
      // ── Pausing ────────────────────────────────────────────────────────────
      // Show Pause icon briefly, then switch to Play icon at resting opacity.
      setIconKind('pause');
      iconOpacity.value = withSequence(
        withTiming(1.0, { duration: 90,  easing: Easing.out(Easing.ease) }),
        withDelay(280, withTiming(targetBase, { duration: 320, easing: Easing.in(Easing.ease) })),
      );
      // Switch to Play icon while the opacity is settling so the resting state
      // shows the correct "tap to resume" affordance.
      setTimeout(() => setIconKind('play'), 360);
      videoRef.current?.pauseAsync().catch(() => {});
    } else {
      // ── Playing ────────────────────────────────────────────────────────────
      // Show Play icon briefly then fade to hidden.
      setIconKind('play');
      iconOpacity.value = withSequence(
        withTiming(1.0, { duration: 90,  easing: Easing.out(Easing.ease) }),
        withDelay(280, withTiming(targetBase, { duration: 320, easing: Easing.in(Easing.ease) })),
      );
      videoRef.current?.playAsync().catch(() => {});
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback status ────────────────────────────────────────────────────────
  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      setIsPlaying(status.isPlaying ?? false);

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

      // Re-enforce gate: native resumption attempted while gated
      if (premiumGatedRef.current && status.isPlaying) {
        videoRef.current?.pauseAsync().catch(() => {});
      }
    },
    [item.isPremium, onPremiumRequired],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Poster thumbnail — behind video */}
      {item.thumbnailUrl ? (
        <MsMediaLoader
          uri={item.thumbnailUrl}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel="Short thumbnail"
        />
      ) : null}

      {/* Video — no native controls, no dark system bar */}
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

      {/* Full-area tap target — sits behind the centre icon */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      />

      {/* Centre play/pause icon — fades in/out on tap and state change */}
      <Animated.View style={[styles.iconWrap, iconStyle]} pointerEvents="none">
        <View style={styles.iconCircle}>
          {iconKind === 'pause'
            ? <Pause size={30} color="#fff" weight="fill" />
            : <Play  size={30} color="#fff" weight="fill" />
          }
        </View>
      </Animated.View>

      {/* Slim progress bar — bottom edge, no dark track, accent fill */}
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
    height: SCREEN_HEIGHT,
    backgroundColor: '#050506',
  },

  // Centre icon
  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Progress bar — 3 px, no background slab behind it
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
