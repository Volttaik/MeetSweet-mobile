/**
 * MsShortsPlayer — optimised expo-av player for the vertical Short feed.
 *
 * Loading experience:
 *   While the video hasn't signalled onReadyForDisplay, a skeleton overlay
 *   covers the poster thumbnail so there are no black or white flashes.
 *   A centred spinner shows activity. Once the video is ready, the skeleton
 *   fades out and playback begins seamlessly.
 *
 * Gestures (only these three — nothing else):
 *   • Swipe up / down  — handled by the parent FlatList (pagingEnabled)
 *   • Tap              — pause / resume with a brief icon flash
 *
 * Premium gate: pause at 3 s, fire onPremiumRequired.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { Pause, Play } from 'phosphor-react-native';
import type { Short } from '@/services/content';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';

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
  const ref              = useRef<Video>(null);
  const startedAt        = useRef<number | null>(null);
  const premiumFired     = useRef(false);
  const iconTimer        = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [paused,         setPaused]         = useState(false);
  const [showPlayIcon,   setShowPlayIcon]   = useState(false);
  const [iconKind,       setIconKind]       = useState<'play' | 'pause'>('play');
  const [isBuffering,    setIsBuffering]    = useState(false);
  // True once the video has called onReadyForDisplay — skeleton shown until then
  const [videoReady,     setVideoReady]     = useState(false);

  // Skeleton pulse animation
  const skeletonOpacity = useRef(new Animated.Value(1)).current;
  const skeletonAnim    = useRef<Animated.CompositeAnimation | null>(null);

  // Start/stop pulsing skeleton when not ready
  useEffect(() => {
    if (!videoReady && active) {
      skeletonOpacity.setValue(1);
      skeletonAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(skeletonOpacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
          Animated.timing(skeletonOpacity, { toValue: 1,    duration: 700, useNativeDriver: true }),
        ]),
      );
      skeletonAnim.current.start();
    } else {
      skeletonAnim.current?.stop();
      skeletonOpacity.setValue(0);
    }
    return () => { skeletonAnim.current?.stop(); };
  }, [videoReady, active, skeletonOpacity]);

  // Reset ready state when switching items (active → inactive)
  useEffect(() => {
    if (!active) {
      // Pause + report progress
      ref.current?.pauseAsync().catch(() => {});
      if (startedAt.current) {
        onViewProgress?.((Date.now() - startedAt.current) / 1000);
      }
      startedAt.current = null;
      premiumFired.current = false;
      setPaused(false);
      // Keep videoReady true if the component stays mounted (windowSize)
      return;
    }
    // Became active — seek to start, begin play
    startedAt.current = Date.now();
    // If it was already ready, play immediately; otherwise wait for onReadyForDisplay
    if (videoReady) {
      ref.current?.playAsync().catch(() => {});
    }
    setPaused(false);
    return () => {
      if (startedAt.current) {
        onViewProgress?.((Date.now() - startedAt.current) / 1000);
      }
      ref.current?.pauseAsync().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Clean up icon flash timer
  useEffect(() => () => { if (iconTimer.current) clearTimeout(iconTimer.current); }, []);

  const onReadyForDisplay = useCallback(() => {
    setVideoReady(true);
    setIsBuffering(false);
    // If currently active, start playing now
    if (active && !paused) {
      ref.current?.playAsync().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused]);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        setIsBuffering(true);
        return;
      }
      setIsBuffering(status.isBuffering ?? false);
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

  const flashIcon = useCallback((kind: 'play' | 'pause') => {
    setIconKind(kind);
    setShowPlayIcon(true);
    if (iconTimer.current) clearTimeout(iconTimer.current);
    iconTimer.current = setTimeout(() => setShowPlayIcon(false), 700);
  }, []);

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
  }, [active, paused, flashIcon]);

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

      {/* Video stream — mount when active or when content is free */}
      {(item.videoUrl && !item.isPremium) || (item.videoUrl && item.isPremium && active) ? (
        <Video
          ref={ref}
          source={{ uri: item.videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={active && !paused && videoReady}
          isLooping
          useNativeControls={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onReadyForDisplay={onReadyForDisplay}
          onError={onError}
        />
      ) : null}

      {/* Skeleton overlay — fades out once video is ready */}
      {!videoReady && active ? (
        <Animated.View
          style={[styles.skeleton, { opacity: skeletonOpacity }]}
          pointerEvents="none"
        >
          {/* Gradient-ish dark overlay that pulses */}
          <View style={styles.skeletonInner} />
          {/* Centred loading spinner */}
          <ActivityIndicator
            color="rgba(255,255,255,0.7)"
            size="large"
            style={styles.skeletonSpinner}
          />
        </Animated.View>
      ) : null}

      {/* Buffering indicator (shown after video is ready but still buffering) */}
      {videoReady && isBuffering && active ? (
        <ActivityIndicator
          color="rgba(255,255,255,0.6)"
          size="small"
          style={styles.bufferingIndicator}
          pointerEvents="none"
        />
      ) : null}

      {/* Tap area for play/pause — intercepts only taps, not swipes */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

      {/* Brief play/pause icon flash on tap */}
      {showPlayIcon ? (
        <View style={styles.iconFlash} pointerEvents="none">
          {iconKind === 'play'
            ? <Play  size={46} color="rgba(255,255,255,0.88)" weight="fill" />
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
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  skeletonInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,10,18,0.72)',
  },
  skeletonSpinner: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -18,
  },
  bufferingIndicator: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    zIndex: 3,
  },
  iconFlash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
});
