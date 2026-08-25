/**
 * MsVideoPreview — YouTube-style silent preview for feed video cards.
 *
 * Engine: `react-native-video` — muted preview playback driven by the
 * FlatList viewability prop (`active`).
 *
 * Behaviour:
 *   • Default state: shows only the thumbnail/poster. No video is loaded.
 *   • After PREVIEW_DELAY_MS (10 s) of continuous visibility:
 *       - Mounts the <Video> and begins muted playback from the beginning.
 *       - No controls, no progress bar, no play button.
 *   • When the card leaves the viewport (active → false):
 *       - The 10-second timer is cancelled.
 *       - Playback is paused.
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
import Video from 'react-native-video';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MEDIA_BG } from '@/constants/theme';

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
  const activeRef    = useRef(active);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPlayedRef = useRef(false);

  // Only mount the <Video> element after the 10-second threshold.
  const [videoMounted,  setVideoMounted]  = useState(false);
  // Control poster layer visibility so it can be removed from layout when hidden.
  const [posterVisible, setPosterVisible] = useState(true);
  // Declarative play/pause — react-native-video's `paused` prop.
  const [paused,        setPaused]        = useState(true);

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
    setPaused(true);
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
          // Threshold reached: mount the video and start muted playback.
          hasPlayedRef.current = false;
          setVideoMounted(true);
          setPaused(false);
        }
      }, PREVIEW_DELAY_MS);
    } else {
      // Card left viewport — cancel timer, pause, release resources.
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setPaused(true);
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

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // ── Playback events ───────────────────────────────────────────────────────
  // First progress tick = playback actually started — crossfade the poster out.
  const onProgress = useCallback(() => {
    if (!hasPlayedRef.current) {
      hasPlayedRef.current = true;
      posterOpacity.value = withTiming(0, { duration: 400 });
      setTimeout(() => setPosterVisible(false), 460);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview finished — restore poster and release the video element.
  const onEnd = useCallback(() => {
    posterOpacity.value = 1;
    setPosterVisible(true);
    setPaused(true);
    setVideoMounted(false);
    hasPlayedRef.current = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">

      {/* Video — conditionally mounted only after 10-second threshold */}
      {videoMounted ? (
        <Video
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          paused={paused}
          muted
          onProgress={onProgress}
          onEnd={onEnd}
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
    backgroundColor: MEDIA_BG,
  },
});
