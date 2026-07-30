/**
 * MsShortsPlayer — immersive short-form video player.
 *
 * Buffering contract:
 *   Until the video plays for the first time (hasPlayed ref), a full-screen
 *   buffering overlay blocks all interaction and shows a spinner + label.
 *   Once isPlaying flips true once, hasPlayed is set and the overlay is gone
 *   for the lifetime of this item — even if the video re-buffers later.
 *
 * Icon contract:
 *   isPlaying=true  → hidden (opacity 0)
 *   isPlaying=false → Play icon at 0.85 opacity
 *   Hidden while buffering overlay is active.
 *
 * Premium gate: pause at 3 s, fire onPremiumRequired, block any resumption.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { Play } from 'phosphor-react-native';
import type { Short } from '@/services/content';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item: Short;
  active: boolean;
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
  const ph = pageHeight ?? SCREEN_HEIGHT;

  const videoRef        = useRef<Video>(null);
  const startedAt       = useRef<number | null>(null);
  const premiumFired    = useRef(false);
  const premiumGatedRef = useRef(false);
  const isPlayingRef    = useRef(false);
  /** Once true, the buffering overlay is never shown again for this item. */
  const hasPlayed       = useRef(false);

  const [premiumGated, setPremiumGated] = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [isBuffering,  setIsBuffering]  = useState(true);
  const [progress,     setProgress]     = useState(0);

  // ── Animated values ────────────────────────────────────────────────────────
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
    hasPlayed.current       = false;
    setPremiumGated(false);
    setProgress(0);
    setIsPlaying(false);
    setIsBuffering(true);
    iconOpacity.value = 0;
    iconScale.value   = 1;
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync play/pause icon with playback state ───────────────────────────────
  useEffect(() => {
    // Hide icon while buffering overlay is showing or when off-screen
    if (!active || isBuffering) {
      iconOpacity.value = withTiming(0, { duration: 200 });
      return;
    }
    iconOpacity.value = withTiming(isPlaying ? 0 : 0.85, {
      duration: 250,
      easing: Easing.inOut(Easing.ease),
    });
  }, [isPlaying, active, isBuffering]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Scale pulse for tactile feedback
    iconScale.value = withSequence(
      withTiming(1.18, { duration: 80,  easing: Easing.out(Easing.ease) }),
      withTiming(1.0,  { duration: 180, easing: Easing.in(Easing.ease) }),
    );
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

      // Once played, clear buffering overlay permanently for this item
      if (playing && !hasPlayed.current) {
        hasPlayed.current = true;
        setIsBuffering(false);
      } else if (!hasPlayed.current) {
        // Still waiting for first play — reflect current buffering state
        setIsBuffering(status.isBuffering ?? true);
      }
      // After hasPlayed=true: never update isBuffering — overlay stays gone

      const dur = status.durationMillis ?? 0;
      if (dur > 0) setProgress((status.positionMillis ?? 0) / dur);

      // Premium gate: pause at 3 s
      if (item.isPremium && !premiumFired.current && (status.positionMillis ?? 0) >= 3000) {
        premiumFired.current    = true;
        premiumGatedRef.current = true;
        videoRef.current?.pauseAsync().catch(() => {});
        setPremiumGated(true);
        onPremiumRequired?.();
        return;
      }
      if (premiumGatedRef.current && status.isPlaying) {
        videoRef.current?.pauseAsync().catch(() => {});
      }
    },
    [item.isPremium, onPremiumRequired],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { height: ph }]}>
      {/* Poster thumbnail */}
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

      {/* Tap target — disabled while buffering */}
      {!isBuffering ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleTap}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        />
      ) : null}

      {/* Buffering overlay — blocks all interaction, shows spinner */}
      {isBuffering ? (
        <View style={styles.bufferOverlay} pointerEvents="box-only">
          <ActivityIndicator size="large" color="rgba(255,255,255,0.9)" />
          <Text style={styles.bufferText}>Buffering…</Text>
        </View>
      ) : null}

      {/* Centre play/pause icon — hidden while buffering */}
      <Animated.View style={[styles.iconWrap, iconStyle]} pointerEvents="none">
        <View style={styles.iconCircle}>
          <Play size={22} color="#fff" weight="fill" />
        </View>
      </Animated.View>

      {/* Progress bar */}
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
    backgroundColor: '#050506',
  },

  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bufferText: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: T.FONT.medium,
    fontSize: 13,
    letterSpacing: 0.2,
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
