/**
 * MsVideoPreview — silent muted 3-second looping preview for feed cards.
 *
 * Fills its parent container (use inside a sized View or absoluteFill).
 * No controls, no play button, no UI chrome.
 * Parent handles all touch events.
 *
 * Props:
 *   uri       — video URL to preview
 *   posterUri — thumbnail shown while loading; fades out on first play
 *   active    — play when true, pause when false (viewability-driven)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { MsMediaLoader } from '@/components/MsMediaLoader';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Seek back to 0 once the preview reaches this position (ms). */
const PREVIEW_LOOP_MS = 3000;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MsVideoPreviewProps {
  uri: string;
  posterUri?: string | null;
  /** Play when true, pause when false. Default true. */
  active?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsVideoPreview({
  uri,
  posterUri,
  active = true,
}: MsVideoPreviewProps) {
  const videoRef      = useRef<Video>(null);
  const hasStartedRef = useRef(false);
  const activeRef     = useRef(active);          // stable ref used inside callbacks
  const [posterVisible, setPosterVisible] = useState(true);

  // Animated poster opacity for smooth crossfade
  const posterOpacity = useSharedValue(1);
  const posterStyle   = useAnimatedStyle(() => ({ opacity: posterOpacity.value }));

  // ── Keep activeRef current ────────────────────────────────────────────────
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // ── Drive playback from active prop ──────────────────────────────────────
  useEffect(() => {
    if (active) {
      videoRef.current?.playAsync().catch(() => {});
    } else {
      videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [active]);

  // ── Reset on source change ────────────────────────────────────────────────
  useEffect(() => {
    hasStartedRef.current = false;
    setPosterVisible(true);
    posterOpacity.value = 1;
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback status ───────────────────────────────────────────────────────
  const onStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    // Crossfade poster out the moment the video starts playing
    if (status.isPlaying && !hasStartedRef.current) {
      hasStartedRef.current = true;
      posterOpacity.value = withTiming(0, { duration: 400 });
      setTimeout(() => setPosterVisible(false), 460);
    }

    // Manual 3-second loop — seek to 0 and continue playing
    const pos = status.positionMillis ?? 0;
    if (pos >= PREVIEW_LOOP_MS) {
      videoRef.current?.setPositionAsync(0).catch(() => {});
      if (activeRef.current) {
        videoRef.current?.playAsync().catch(() => {});
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Muted video — auto-plays when active, no native controls */}
      <Video
        ref={videoRef}
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay={active}
        isMuted
        isLooping={false}
        useNativeControls={false}
        onPlaybackStatusUpdate={onStatus}
      />

      {/* Poster — visible until video begins; then crossfades out */}
      {posterVisible ? (
        <Animated.View style={[StyleSheet.absoluteFill, posterStyle]} pointerEvents="none">
          {posterUri ? (
            <MsMediaLoader
              uri={posterUri}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibleLabel="Video preview thumbnail"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.posterFallback]} />
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  posterFallback: {
    backgroundColor: '#1A1A1F',
  },
});
