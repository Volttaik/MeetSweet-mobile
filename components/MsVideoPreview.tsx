/**
 * MsVideoPreview — YouTube-style silent preview for feed video cards.
 *
 * Behaviour:
 *   • Default state: shows only the thumbnail/poster. No video is loaded.
 *   • After PREVIEW_DELAY_MS (10 s) of continuous visibility:
 *       - Mounts the <Video> and begins muted playback from the beginning.
 *       - No controls, no progress bar, no play button.
 *   • When the card leaves the viewport (active → false):
 *       - The 10-second timer is cancelled.
 *       - Playback is stopped.
 *       - The <Video> element is unmounted (releases buffer/decoder resources).
 *       - The poster is restored immediately.
 *   • When the card re-enters the viewport (active → true):
 *       - Restarts the 10-second timer from scratch.
 *       - Does NOT resume mid-preview.
 *   • Playback is NOT looped. When the video finishes playing:
 *       - Poster is restored.
 *       - <Video> is unmounted.
 *   • No controls are rendered at any point.
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

/** Continuous visibility required before muted preview begins (ms). */
const PREVIEW_DELAY_MS = 10_000;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MsVideoPreviewProps {
  uri: string;
  posterUri?: string | null;
  /**
   * Driven by FlatList viewability — true when card is on screen.
   * Defaults to true for non-list usage; feed usage should always pass this.
   */
  active?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsVideoPreview({
  uri,
  posterUri,
  active = true,
}: MsVideoPreviewProps) {
  const videoRef     = useRef<Video>(null);
  const activeRef    = useRef(active);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPlayedRef = useRef(false);

  // Only mount the <Video> element after the 10-second threshold.
  const [videoMounted,  setVideoMounted]  = useState(false);
  // Control poster layer visibility so it can be removed from layout when hidden.
  const [posterVisible, setPosterVisible] = useState(true);

  // Animated opacity drives a smooth crossfade between poster and video.
  const posterOpacity = useSharedValue(1);
  const posterStyle   = useAnimatedStyle(() => ({ opacity: posterOpacity.value }));

  // ── Keep activeRef current ────────────────────────────────────────────────
  useEffect(() => { activeRef.current = active; }, [active]);

  // ── Reset state when the video source changes ─────────────────────────────
  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setVideoMounted(false);
    setPosterVisible(true);
    posterOpacity.value = 1;
    hasPlayedRef.current = false;
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core: drive playback based on viewport visibility ────────────────────
  useEffect(() => {
    if (active) {
      // Card entered viewport — start/restart the 10-second delay timer.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (activeRef.current) {
          // Threshold reached: mount the video and let the effect below start it.
          hasPlayedRef.current = false;
          setVideoMounted(true);
        }
      }, PREVIEW_DELAY_MS);
    } else {
      // Card left viewport — cancel timer, stop playback, release resources.
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      videoRef.current?.pauseAsync().catch(() => {});
      setVideoMounted(false);
      // Restore poster immediately (no animation when going off-screen).
      posterOpacity.value = 1;
      setPosterVisible(true);
      hasPlayedRef.current = false;
    }
    // Cleanup timer if the effect re-runs before the timeout fires.
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start playback once the Video element has mounted ────────────────────
  useEffect(() => {
    if (!videoMounted) return;
    // Brief settle to let expo-av initialise the Video ref after mount.
    const t = setTimeout(() => {
      if (activeRef.current) videoRef.current?.playAsync().catch(() => {});
    }, 80);
    return () => clearTimeout(t);
  }, [videoMounted]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // ── Playback status ───────────────────────────────────────────────────────
  const onStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    // Crossfade poster out when the video starts playing for the first time.
    if (status.isPlaying && !hasPlayedRef.current) {
      hasPlayedRef.current = true;
      posterOpacity.value = withTiming(0, { duration: 400 });
      setTimeout(() => setPosterVisible(false), 460);
    }

    // Preview finished — restore poster and release the video element.
    if (status.didJustFinish) {
      posterOpacity.value = 1;
      setPosterVisible(true);
      setVideoMounted(false);
      hasPlayedRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={StyleSheet.absoluteFill}>

      {/* Video — conditionally mounted only after 10-second threshold */}
      {videoMounted ? (
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
      ) : null}

      {/* Poster — shown until video begins; crossfades out; restored when done */}
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
