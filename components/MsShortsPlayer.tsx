/**
 * MsShortsPlayer — optimised expo-av player for vertical Short feed.
 *
 * Improvements:
 * - Proper play/pause toggle on tap
 * - Premium 3-second preview: pause + fire onPremiumRequired after 3 s
 * - Cleans up playback on unmount / deactivation
 * - Exposes onPlaybackStatus for parent progress tracking
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { Pause, Play } from 'phosphor-react-native';
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
  const [paused,       setPaused]       = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const iconTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Play / pause lifecycle tied to active state
  useEffect(() => {
    if (!active) {
      ref.current?.pauseAsync().catch(() => {});
      if (startedAt.current) {
        onViewProgress?.((Date.now() - startedAt.current) / 1000);
      }
      startedAt.current = null;
      premiumFired.current = false;
      setPaused(false);
      return;
    }
    startedAt.current = Date.now();
    ref.current?.playAsync().catch(() => {});
    setPaused(false);
    return () => {
      if (startedAt.current) {
        onViewProgress?.((Date.now() - startedAt.current) / 1000);
      }
      ref.current?.pauseAsync().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Cleanup icon flash timer
  useEffect(() => () => { if (iconTimer.current) clearTimeout(iconTimer.current); }, []);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      // Premium gate: pause at 3 s
      if (item.isPremium && !premiumFired.current && status.positionMillis >= 3000) {
        premiumFired.current = true;
        ref.current?.pauseAsync().catch(() => {});
        setPaused(true);
        onPremiumRequired?.();
      }
    },
    [item.isPremium, onPremiumRequired],
  );

  const handleTap = useCallback(() => {
    if (!active) return;
    if (paused) {
      ref.current?.playAsync().catch(() => {});
      setPaused(false);
      flashIcon('play');
    } else {
      ref.current?.pauseAsync().catch(() => {});
      setPaused(true);
      flashIcon('pause');
    }
  }, [active, paused]);

  const flashIcon = (kind: 'play' | 'pause') => {
    setShowPlayIcon(true);
    if (iconTimer.current) clearTimeout(iconTimer.current);
    iconTimer.current = setTimeout(() => setShowPlayIcon(false), 700);
  };

  return (
    <View style={styles.root}>
      {/* Poster thumbnail shown while video loads */}
      {item.thumbnailUrl ? (
        <MsMediaLoader
          uri={item.thumbnailUrl}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel="Short thumbnail"
        />
      ) : null}

      {/* Video stream */}
      {item.videoUrl && !item.isPremium || (item.videoUrl && item.isPremium && active) ? (
        <Video
          ref={ref}
          source={{ uri: item.videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={active && !paused}
          isLooping
          useNativeControls={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={onError}
        />
      ) : null}

      {/* Tap area for play/pause */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

      {/* Brief play/pause icon flash on tap */}
      {showPlayIcon ? (
        <View style={styles.iconFlash} pointerEvents="none">
          {paused
            ? <Play size={46} color="rgba(255,255,255,0.88)" weight="fill" />
            : <Pause size={46} color="rgba(255,255,255,0.88)" weight="fill" />}
        </View>
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
  iconFlash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
