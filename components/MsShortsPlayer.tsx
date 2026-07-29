/**
 * MsShortsPlayer — Expo native video player for the vertical Shorts feed.
 *
 * Custom gestures, progress bar and spinner removed.
 * Native controls handle play/pause, seeking and loading reliably.
 * The parent FlatList (pagingEnabled) manages vertical swipe between Shorts.
 *
 * Premium gate: pause at 3 s and fire onPremiumRequired (same as the original).
 * Re-enforcement: any resumption detected via onPlaybackStatusUpdate while gated
 * is immediately paused again so native controls cannot bypass the paywall.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import type { Short } from '@/services/content';
import { MsMediaLoader } from '@/components/MsMediaLoader';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  item: Short;
  active: boolean;
  onViewProgress?: (seconds: number) => void;
  onPremiumRequired?: () => void;
  onError?: () => void;
}

export function MsShortsPlayer({
  item,
  active,
  onViewProgress,
  onPremiumRequired,
  onError,
}: Props) {
  const ref            = useRef<Video>(null);
  const startedAt      = useRef<number | null>(null);
  const premiumFired   = useRef(false);

  // Stable ref kept in sync with premiumGated state — avoids stale closures in onStatus.
  const premiumGatedRef = useRef(false);
  const [premiumGated, setPremiumGated] = useState(false);

  // Reset gate when a new item becomes active.
  useEffect(() => {
    premiumFired.current    = false;
    premiumGatedRef.current = false;
    setPremiumGated(false);
  }, [item.id]);

  // Track view duration. Playback start/stop is controlled entirely by
  // shouldPlay={active && !premiumGated} — no imperative play/pause here so
  // there is no race condition between the prop and the native player state.
  useEffect(() => {
    if (!active) {
      if (startedAt.current !== null) {
        onViewProgress?.((Date.now() - startedAt.current) / 1000);
        startedAt.current = null;
      }
      return;
    }

    // Became active — record start time.
    startedAt.current = Date.now();

    return () => {
      if (startedAt.current !== null) {
        onViewProgress?.((Date.now() - startedAt.current) / 1000);
        startedAt.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Premium gate: pause at 3 s and fire the callback.
  // Re-enforcement: if native controls resume while gated, pause again immediately.
  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      if (item.isPremium && !premiumFired.current && (status.positionMillis ?? 0) >= 3000) {
        premiumFired.current    = true;
        premiumGatedRef.current = true;
        ref.current?.pauseAsync().catch(() => {});
        setPremiumGated(true);
        onPremiumRequired?.();
        return;
      }

      // Re-enforce: native controls must not be able to resume gated content.
      if (premiumGatedRef.current && status.isPlaying) {
        ref.current?.pauseAsync().catch(() => {});
      }
    },
    [item.isPremium, onPremiumRequired],
  );

  return (
    <View style={styles.root}>
      {/* Poster thumbnail — always rendered below the video */}
      {item.thumbnailUrl ? (
        <MsMediaLoader
          uri={item.thumbnailUrl}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel="Short thumbnail"
        />
      ) : null}

      {/* Native video player */}
      {item.videoUrl ? (
        <Video
          ref={ref}
          source={{ uri: item.videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={active && !premiumGated}
          isLooping
          useNativeControls
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={onError}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#050506',
  },
});
