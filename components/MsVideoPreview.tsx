/**
 * MsVideoPreview — silent muted looping preview for feed cards.
 *
 * Behaviour:
 *   • Auto-plays muted when active=true.
 *   • Loops the first ~3 seconds up to MAX_LOOPS times (≈9 s total).
 *   • After the final loop: stops, fades the poster back in.
 *   • If the card leaves the viewport (active→false) and returns (active→true)
 *     while stopped, the preview restarts immediately.
 *   • If the card stays in the viewport after stopping, a 10-minute idle timer
 *     restarts the preview automatically.
 *   • No controls, no play button — parent handles all touch events.
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
/** Number of loops before the preview stops. */
const MAX_LOOPS = 3;
/** After stopping, restart automatically if still in viewport (ms). */
const IDLE_RESTART_MS = 10 * 60 * 1000; // 10 minutes

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
  const activeRef     = useRef(active);
  const hasStartedRef = useRef(false);
  const loopCountRef  = useRef(0);
  const stoppedRef    = useRef(false);
  const seekingRef    = useRef(false);
  const prevActiveRef = useRef(active);
  const idleTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [posterVisible, setPosterVisible] = useState(true);

  // Animated poster opacity for smooth crossfade
  const posterOpacity = useSharedValue(1);
  const posterStyle   = useAnimatedStyle(() => ({ opacity: posterOpacity.value }));

  // ── Keep activeRef current ────────────────────────────────────────────────
  useEffect(() => { activeRef.current = active; }, [active]);

  // ── Reset and start a fresh preview cycle ─────────────────────────────────
  const resetAndPlay = useCallback(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    loopCountRef.current  = 0;
    stoppedRef.current    = false;
    hasStartedRef.current = false;
    seekingRef.current    = false;
    posterOpacity.value   = withTiming(1, { duration: 200 });
    setPosterVisible(true);
    videoRef.current?.setPositionAsync(0)
      .catch(() => {})
      .then(() => { if (activeRef.current) videoRef.current?.playAsync().catch(() => {}); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drive playback + handle re-entry from off-screen ─────────────────────
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;

    if (active) {
      if (!wasActive && stoppedRef.current) {
        // Card came back into viewport while preview was done — restart
        resetAndPlay();
      } else if (!stoppedRef.current) {
        videoRef.current?.playAsync().catch(() => {});
      }
      // If active=true and stopped=true (still in viewport), idle timer handles restart
    } else {
      videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [active, resetAndPlay]);

  // ── Reset on source change ────────────────────────────────────────────────
  useEffect(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    loopCountRef.current  = 0;
    stoppedRef.current    = false;
    hasStartedRef.current = false;
    seekingRef.current    = false;
    setPosterVisible(true);
    posterOpacity.value   = 1;
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, []);

  // ── Playback status ───────────────────────────────────────────────────────
  const onStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    // Crossfade poster out the moment the video starts playing
    if (status.isPlaying && !hasStartedRef.current) {
      hasStartedRef.current = true;
      posterOpacity.value = withTiming(0, { duration: 400 });
      setTimeout(() => setPosterVisible(false), 460);
    }

    // Loop counting — seekingRef guards against multiple firings before seek completes
    const pos = status.positionMillis ?? 0;
    if (pos >= PREVIEW_LOOP_MS && !seekingRef.current && !stoppedRef.current) {
      seekingRef.current = true;
      loopCountRef.current += 1;

      if (loopCountRef.current >= MAX_LOOPS) {
        // All loops done — stop and restore poster
        stoppedRef.current = true;
        videoRef.current?.pauseAsync().catch(() => {});
        videoRef.current?.setPositionAsync(0).catch(() => {});
        setPosterVisible(true);
        posterOpacity.value = withTiming(1, { duration: 500 });

        // Restart after long idle if card is still in viewport
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          if (activeRef.current) resetAndPlay();
        }, IDLE_RESTART_MS);
      } else {
        // Loop again — seek back to start
        videoRef.current?.setPositionAsync(0)
          .catch(() => {})
          .finally(() => { seekingRef.current = false; });
        if (activeRef.current) {
          videoRef.current?.playAsync().catch(() => {});
        }
      }
    }
  }, [resetAndPlay]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Muted video — driven imperatively; shouldPlay=false to avoid stale-prop issues */}
      <Video
        ref={videoRef}
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isMuted
        isLooping={false}
        useNativeControls={false}
        onPlaybackStatusUpdate={onStatus}
      />

      {/* Poster — visible until video begins; crossfades out; fades back in after preview stops */}
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
