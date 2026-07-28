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
 * Glass tracker:
 *   A semi-transparent glassmorphism progress bar at the bottom of the screen.
 *   Supports horizontal scrubbing (drag) without interfering with vertical swipes.
 *   Only visible on Shorts — never on long-form or feed videos.
 *
 * Play/Pause icon contract:
 *   • Video is paused  → Play  icon shown (persistent, indicates "tap to resume")
 *   • Video is playing → Pause icon flashes briefly on tap, then fades
 *   • Video buffers    → spinner shown
 *
 * Premium gate: pause at 3 s, fire onPremiumRequired.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
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
  // Once playback has started we silence all subsequent buffering indicators.
  const hasEverPlayedRef = useRef(false);

  const [paused,         setPaused]         = useState(false);
  const [showIcon,       setShowIcon]       = useState(false);
  const [iconKind,       setIconKind]       = useState<'play' | 'pause'>('play');
  const [isBuffering,    setIsBuffering]    = useState(false);
  // True once the video has called onReadyForDisplay — skeleton shown until then
  const [videoReady,     setVideoReady]     = useState(false);

  // Progress tracking for the glass scrubber
  const [position,  setPosition]  = useState(0);
  const [duration,  setDuration]  = useState(0);
  // durationRef is kept in sync so the PanResponder (a stable useRef closure)
  // always reads the current duration without stale-closure issues.
  const durationRef      = useRef(0);
  const glassWidthRef    = useRef(1);
  const glassOriginXRef  = useRef(0);
  const isDraggingRef    = useRef(false);

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
      setShowIcon(false);
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
      hasEverPlayedRef.current = true;
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

      // Update scrubber position/duration (unless user is dragging)
      const dur = status.durationMillis ?? 0;
      durationRef.current = dur;          // keep ref in sync for PanResponder closures
      if (!isDraggingRef.current) {
        setPosition(status.positionMillis ?? 0);
        setDuration(dur);
      }

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

  // ── Play/Pause icon flash ────────────────────────────────────────────────
  //
  // When paused  → show Play  icon persistently (tap again to resume)
  // When playing → briefly show Pause icon then hide
  //

  const handleTap = useCallback(() => {
    if (!active) return;
    if (paused) {
      // Was paused → now playing
      ref.current?.playAsync().catch(() => {});
      setPaused(false);
      // Briefly flash Pause icon (confirming "now playing"), then hide
      setIconKind('pause');
      setShowIcon(true);
      if (iconTimer.current) clearTimeout(iconTimer.current);
      iconTimer.current = setTimeout(() => setShowIcon(false), 700);
    } else {
      // Was playing → now paused
      ref.current?.pauseAsync().catch(() => {});
      setPaused(true);
      // Show Play icon persistently (indicates "tap to resume")
      if (iconTimer.current) clearTimeout(iconTimer.current);
      setIconKind('play');
      setShowIcon(true);
      // No auto-hide — icon stays until user taps to resume
    }
  }, [active, paused]);

  // ── Glass scrubber PanResponder ──────────────────────────────────────────
  // Only claims HORIZONTAL gestures so vertical swipes still reach the FlatList.

  const glassPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        // Claim gesture only when horizontal movement dominates
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) + 5;
      },
      onPanResponderGrant: (evt) => {
        isDraggingRef.current  = true;
        glassOriginXRef.current =
          evt.nativeEvent.pageX - evt.nativeEvent.locationX;
        const x  = Math.max(0, Math.min(
          evt.nativeEvent.pageX - glassOriginXRef.current,
          glassWidthRef.current,
        ));
        const ms = (x / Math.max(1, glassWidthRef.current)) * Math.max(0, durationRef.current);
        setPosition(ms);
        ref.current?.setPositionAsync(ms).catch(() => {});
      },
      onPanResponderMove: (evt) => {
        const x  = Math.max(0, Math.min(
          evt.nativeEvent.pageX - glassOriginXRef.current,
          glassWidthRef.current,
        ));
        const ms = (x / Math.max(1, glassWidthRef.current)) * Math.max(0, durationRef.current);
        setPosition(ms);
        ref.current?.setPositionAsync(ms).catch(() => {});
      },
      onPanResponderRelease: (evt) => {
        isDraggingRef.current = false;
        const x  = Math.max(0, Math.min(
          evt.nativeEvent.pageX - glassOriginXRef.current,
          glassWidthRef.current,
        ));
        const ms = (x / Math.max(1, glassWidthRef.current)) * Math.max(0, durationRef.current);
        setPosition(ms);
        ref.current?.setPositionAsync(ms).catch(() => {});
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
      },
    })
  ).current; // eslint-disable-line react-hooks/exhaustive-deps

  const progressPct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

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

      {/* Buffering indicator — only during initial load, silent once playback has started */}
      {videoReady && isBuffering && active && !hasEverPlayedRef.current ? (
        <ActivityIndicator
          color="rgba(255,255,255,0.6)"
          size="small"
          style={styles.bufferingIndicator}
          pointerEvents="none"
        />
      ) : null}

      {/* Tap area for play/pause — intercepts only taps, not swipes */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

      {/* Play/pause icon overlay:
          - Paused  → Play  icon stays until tapped again
          - Playing → Pause icon flashes 700ms then hides              */}
      {showIcon ? (
        <View style={styles.iconFlash} pointerEvents="none">
          {iconKind === 'play'
            ? <Play  size={46} color="rgba(255,255,255,0.88)" weight="fill" />
            : <Pause size={46} color="rgba(255,255,255,0.88)" weight="fill" />}
        </View>
      ) : null}

      {/* ── Glass progress tracker — Shorts only ────────────────────────── */}
      {videoReady ? (
        <View style={styles.glassBarOuter} pointerEvents="box-none">
          <View style={styles.glassBarPill} pointerEvents="box-none">
            {/*
             * The pan handlers live on this hit-area view so that
             * locationX / pageX are already in track coordinates.
             * onLayout gives the exact track width — no inset math needed.
             */}
            <View
              style={styles.glassTrackHitArea}
              onLayout={(e) => {
                glassWidthRef.current = e.nativeEvent.layout.width;
              }}
              {...glassPan.panHandlers}
            >
              <View style={styles.glassTrack} pointerEvents="none">
                {/* Filled portion */}
                <View
                  style={[styles.glassTrackFill, { width: `${progressPct}%` as any }]}
                />
                {/* Thumb dot */}
                <View
                  style={[styles.glassThumb, { left: `${progressPct}%` as any }]}
                />
              </View>
            </View>
          </View>
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
    pointerEvents: 'none' as any,
  },

  // ── Glass progress tracker ─────────────────────────────────────────────
  glassBarOuter: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    zIndex: 5,
  },
  glassBarPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.20)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    // Backdrop blur is not supported natively in RN without a library,
    // so we achieve the glass look via rgba background + border.
  },
  // Tall touch target wrapping the visual track — pan handlers live here
  // so locationX / pageX are already in track-relative coordinates.
  glassTrackHitArea: {
    width: '100%',
    height: 28,
    justifyContent: 'center',
  },
  glassTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    overflow: 'visible',
    justifyContent: 'center',
  },
  glassTrackFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.80)',
  },
  glassThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginLeft: -6,
    top: -4.5,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 3,
  },
});
