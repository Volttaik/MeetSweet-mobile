/**
 * MsVideoPlayer — unified video player for MeetSweet.
 *
 * Single component used across ALL video contexts:
 *   mode='standard'  → feed, explore, profile, paid content, DMs, video detail
 *   mode='shorts'    → Shorts feed (immersive, no seek bar, no fullscreen button)
 *
 * Expo's Video engine handles all rendering, buffering and decoding.
 * Only the UI/control layer is custom.
 *
 * Standard features:
 *   • Auto-hiding controls overlay (2.5 s after last interaction)
 *   • Centre play/pause icon
 *   • Progress/seek bar with drag and tap support
 *   • Current time + total duration display
 *   • Fullscreen via built-in Modal (position preserved on open and close)
 *   • Double-tap LEFT = −10 s, double-tap RIGHT = +10 s (YouTube-style)
 *   • Animated seek feedback overlays
 *   • Initial buffering spinner
 *   • Poster/thumbnail behind video
 *   • Premium gate at 3 s
 *
 * Shorts features (mode='shorts'):
 *   • Centre play/pause icon (auto-hides when playing)
 *   • Always-visible thin progress strip at the bottom
 *   • No seek bar, no fullscreen button
 *   • Driven by `active` prop
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import {
  ArrowCounterClockwise,
  ArrowsIn,
  ArrowsOut,
  Lock,
  Pause,
  Play,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoPlayerMode = 'standard' | 'shorts';

export interface MsVideoPlayerProps {
  /** Unique key — player state resets when this changes. */
  videoId: string;
  uri: string | null;
  posterUri?: string | null;
  /** Auto-play on mount (standard mode). Default false. */
  autoPlay?: boolean;
  /** Loop the video. Default false (always true for shorts). */
  isLooping?: boolean;
  isPremium?: boolean;
  onPremiumRequired?: () => void;
  /** Player configuration. Default 'standard'. */
  mode?: VideoPlayerMode;
  // ── Layout ──────────────────────────────────────────────────────────────────
  /** Fill parent container (flex:1) instead of sizing by aspect ratio. */
  fillContainer?: boolean;
  /** Prevents layout flash by providing the known aspect ratio up-front. */
  initialAspectRatio?: number;
  /** Shorts: sets the exact page height. Defaults to screen height. */
  pageHeight?: number;
  // ── Shorts lifecycle ────────────────────────────────────────────────────────
  /** Shorts: drives play/pause — plays when true, pauses when false. */
  active?: boolean;
  /** Shorts: called with seconds watched when the item goes inactive. */
  onViewProgress?: (seconds: number) => void;
  onError?: () => void;
  /**
   * When fillContainer=true (e.g. inside a fullscreen Modal), provide this to
   * render a close/back button in the controls overlay.
   */
  onClose?: () => void;
}

// ─── Constants & helpers ──────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DOUBLE_TAP_MS   = 260;
const SEEK_SECONDS    = 10;
const CONTROLS_HIDE_MS = 2500;

function fmtTime(ms: number): string {
  const s  = Math.max(0, Math.floor(ms / 1000));
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
  return `${m}:${String(sc).padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsVideoPlayer({
  videoId,
  uri,
  posterUri,
  autoPlay      = false,
  isLooping     = false,
  isPremium     = false,
  onPremiumRequired,
  mode          = 'standard',
  fillContainer = false,
  initialAspectRatio,
  pageHeight,
  active,
  onViewProgress,
  onError,
  onClose,
}: MsVideoPlayerProps) {

  const isShorts = mode === 'shorts';
  const ph       = pageHeight ?? SCREEN_HEIGHT;

  // ── Refs (playback & gesture) ─────────────────────────────────────────────
  const videoRef        = useRef<Video>(null);
  const hasPlayedRef    = useRef(false);
  const premiumFiredRef = useRef(false);
  const premiumGateRef  = useRef(false);
  const isPlayingRef    = useRef(false);
  const positionRef     = useRef(0);
  const durationRef     = useRef(0);
  const seekWidthRef    = useRef(0);
  const lastTapRef      = useRef({ time: 0, x: 0 });
  const tapTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef    = useRef<number | null>(null);

  // Fullscreen refs
  const fsVideoRef     = useRef<Video>(null);
  const fsPositionRef  = useRef(0);
  const fsDurationRef  = useRef(0);
  const fsWidthRef     = useRef(0);
  const fsTapTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsPlayingRef   = useRef(false);

  // ── State ─────────────────────────────────────────────────────────────────
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [isBuffering,   setIsBuffering]   = useState(true);
  const [premiumGated,  setPremiumGated]  = useState(false);
  const [error,         setError]         = useState(false);
  const [progress,      setProgress]      = useState(0);
  const [durationMs,    setDurationMs]    = useState(0);
  const [positionMs,    setPositionMs]    = useState(0);
  const [aspectRatio,   setAspectRatio]   = useState(initialAspectRatio ?? 16 / 9);
  const [fsVisible,     setFsVisible]     = useState(false);

  // Fullscreen player state
  const [fsPlaying,     setFsPlaying]     = useState(false);
  const [fsProgress,    setFsProgress]    = useState(0);
  const [fsDurationMs,  setFsDurationMs]  = useState(0);
  const [fsPositionMs,  setFsPositionMs]  = useState(0);
  const [fsBuffering,   setFsBuffering]   = useState(true);
  const fsHasPlayedRef = useRef(false);

  // ── Animated values ───────────────────────────────────────────────────────
  // Controls overlay (auto-hiding)
  const ctrlOpacity = useSharedValue(1);
  const ctrlStyle   = useAnimatedStyle(() => ({ opacity: ctrlOpacity.value }));
  // Fullscreen controls overlay
  const fsCtrlOpacity = useSharedValue(1);
  const fsCtrlStyle   = useAnimatedStyle(() => ({ opacity: fsCtrlOpacity.value }));

  // Centre icon (shorts: per-playing state; standard: part of auto-hide overlay)
  const iconScale   = useSharedValue(1);
  // Shorts-only icon opacity
  const shortsIconOpacity = useSharedValue(0);
  const shortsIconStyle   = useAnimatedStyle(() => ({
    opacity: shortsIconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));
  // Standard icon (opacity via parent ctrlStyle, only scale here)
  const stdIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  // Seek flash (standard only)
  const seekLeftOpacity  = useSharedValue(0);
  const seekRightOpacity = useSharedValue(0);
  const seekLeftStyle    = useAnimatedStyle(() => ({ opacity: seekLeftOpacity.value }));
  const seekRightStyle   = useAnimatedStyle(() => ({ opacity: seekRightOpacity.value }));

  // ── Reset on source change ────────────────────────────────────────────────
  useEffect(() => {
    hasPlayedRef.current  = false;
    premiumFiredRef.current = false;
    premiumGateRef.current  = false;
    isPlayingRef.current    = false;
    positionRef.current     = 0;
    durationRef.current     = 0;
    setPremiumGated(false);
    setError(false);
    setProgress(0);
    setDurationMs(0);
    setPositionMs(0);
    setIsPlaying(false);
    setIsBuffering(true);
    ctrlOpacity.value = 1;
    iconScale.value   = 1;
    shortsIconOpacity.value = 0;
    if (initialAspectRatio) setAspectRatio(initialAspectRatio);
  }, [videoId, uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shorts: respond to active prop ────────────────────────────────────────
  useEffect(() => {
    if (!isShorts) return;
    if (active && !premiumGateRef.current) {
      videoRef.current?.playAsync().catch(() => {});
    } else {
      videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [active, isShorts]);

  // ── Shorts: view-progress tracking ────────────────────────────────────────
  useEffect(() => {
    if (!isShorts || !onViewProgress) return;
    if (!active) {
      if (startedAtRef.current !== null) {
        onViewProgress((Date.now() - startedAtRef.current) / 1000);
        startedAtRef.current = null;
      }
      return;
    }
    startedAtRef.current = Date.now();
    return () => {
      if (startedAtRef.current !== null) {
        onViewProgress((Date.now() - startedAtRef.current) / 1000);
        startedAtRef.current = null;
      }
    };
  }, [active, isShorts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-play (standard) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!autoPlay || isShorts || !uri) return;
    const t = setTimeout(() => videoRef.current?.playAsync().catch(() => {}), 100);
    return () => clearTimeout(t);
  }, [videoId, uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls auto-hide helpers ────────────────────────────────────────────
  const scheduleHide = useCallback((opacity: Animated.SharedValue<number>, timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 350 });
    }, CONTROLS_HIDE_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showControls = useCallback(() => {
    ctrlOpacity.value = withTiming(1, { duration: 180 });
    scheduleHide(ctrlOpacity, hideTimerRef);
  }, [scheduleHide]); // eslint-disable-line react-hooks/exhaustive-deps

  const showFsControls = useCallback(() => {
    fsCtrlOpacity.value = withTiming(1, { duration: 180 });
    scheduleHide(fsCtrlOpacity, fsHideTimerRef);
  }, [scheduleHide]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise controls auto-hide on mount
  useEffect(() => {
    scheduleHide(ctrlOpacity, hideTimerRef);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tap icon pulse animation ───────────────────────────────────────────────
  const pulseIcon = useCallback(() => {
    iconScale.value = withSequence(
      withTiming(1.18, { duration: 80,  easing: Easing.out(Easing.ease) }),
      withTiming(1.0,  { duration: 180, easing: Easing.in(Easing.ease) }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Seek helpers ──────────────────────────────────────────────────────────
  const flashLeft = useCallback(() => {
    seekLeftOpacity.value = withSequence(
      withTiming(1, { duration: 150 }),
      withTiming(1, { duration: 450 }),
      withTiming(0, { duration: 300 }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flashRight = useCallback(() => {
    seekRightOpacity.value = withSequence(
      withTiming(1, { duration: 150 }),
      withTiming(1, { duration: 450 }),
      withTiming(0, { duration: 300 }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seekBy = useCallback((deltaS: number, ref: React.RefObject<Video>) => {
    const target = Math.max(0, Math.min(durationRef.current, positionRef.current + deltaS * 1000));
    ref.current?.setPositionAsync(target).catch(() => {});
    positionRef.current = target;
    if (durationRef.current > 0) setProgress(target / durationRef.current);
    setPositionMs(target);
  }, []);

  // ── Shorts tap ────────────────────────────────────────────────────────────
  const handleShortsTap = useCallback(() => {
    if (premiumGateRef.current) return;
    pulseIcon();
    if (isPlayingRef.current) {
      videoRef.current?.pauseAsync().catch(() => {});
    } else {
      videoRef.current?.playAsync().catch(() => {});
    }
  }, [pulseIcon]);

  // ── Standard tap (single / double) ───────────────────────────────────────
  const handleStandardPress = useCallback((tapX: number) => {
    if (premiumGateRef.current) return;
    const now  = Date.now();
    const last = lastTapRef.current;
    const W    = SCREEN_WIDTH;

    if (now - last.time < DOUBLE_TAP_MS) {
      // Double tap
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = { time: 0, x: 0 };
      if (tapX < W / 2) { seekBy(-SEEK_SECONDS, videoRef); flashLeft(); }
      else               { seekBy( SEEK_SECONDS, videoRef); flashRight(); }
      showControls();
      return;
    }

    lastTapRef.current = { time: now, x: tapX };
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      pulseIcon();
      if (isPlayingRef.current) {
        videoRef.current?.pauseAsync().catch(() => {});
        // Keep controls visible while paused
        ctrlOpacity.value = withTiming(1, { duration: 180 });
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      } else {
        videoRef.current?.playAsync().catch(() => {});
        showControls();
      }
    }, DOUBLE_TAP_MS);
  }, [seekBy, flashLeft, flashRight, showControls, pulseIcon]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Standard fullscreen tap ────────────────────────────────────────────────
  const handleFsPress = useCallback((tapX: number) => {
    const now  = Date.now();
    const last = lastTapRef.current;
    const W    = SCREEN_WIDTH;

    if (now - last.time < DOUBLE_TAP_MS) {
      if (fsTapTimerRef.current) { clearTimeout(fsTapTimerRef.current); fsTapTimerRef.current = null; }
      lastTapRef.current = { time: 0, x: 0 };
      const target = tapX < W / 2
        ? Math.max(0, fsPositionRef.current - SEEK_SECONDS * 1000)
        : Math.min(fsDurationRef.current, fsPositionRef.current + SEEK_SECONDS * 1000);
      fsVideoRef.current?.setPositionAsync(target).catch(() => {});
      fsPositionRef.current = target;
      if (fsDurationRef.current > 0) setFsProgress(target / fsDurationRef.current);
      setFsPositionMs(target);
      showFsControls();
      return;
    }

    lastTapRef.current = { time: now, x: tapX };
    fsTapTimerRef.current = setTimeout(() => {
      fsTapTimerRef.current = null;
      if (fsPlayingRef.current) {
        fsVideoRef.current?.pauseAsync().catch(() => {});
        fsCtrlOpacity.value = withTiming(1, { duration: 180 });
        if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
      } else {
        fsVideoRef.current?.playAsync().catch(() => {});
        showFsControls();
      }
    }, DOUBLE_TAP_MS);
  }, [showFsControls]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback status (inline) ───────────────────────────────────────────────
  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      const playing = status.isPlaying ?? false;
      isPlayingRef.current = playing;
      setIsPlaying(playing);

      // Shorts: manage icon visibility
      if (isShorts && hasPlayedRef.current) {
        shortsIconOpacity.value = withTiming(playing ? 0 : 0.85, { duration: 250 });
      }

      // Buffering contract
      if (playing && !hasPlayedRef.current) {
        hasPlayedRef.current = true;
        setIsBuffering(false);
        if (isShorts) shortsIconOpacity.value = withTiming(0, { duration: 250 });
      } else if (!hasPlayedRef.current) {
        setIsBuffering(status.isBuffering ?? true);
      }

      // Track position / duration
      const dur = status.durationMillis ?? 0;
      const pos = status.positionMillis ?? 0;
      positionRef.current = pos;
      durationRef.current = dur;
      if (dur > 0) { setProgress(pos / dur); setDurationMs(dur); }
      setPositionMs(pos);

      // Premium gate
      if (isPremium && !premiumFiredRef.current && pos >= 3000) {
        premiumFiredRef.current = true;
        premiumGateRef.current  = true;
        videoRef.current?.pauseAsync().catch(() => {});
        setPremiumGated(true);
        onPremiumRequired?.();
        return;
      }
      if (premiumGateRef.current && playing) {
        videoRef.current?.pauseAsync().catch(() => {});
      }
    },
    [isPremium, isShorts, onPremiumRequired], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Playback status (fullscreen) ───────────────────────────────────────────
  const onFsStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const playing = status.isPlaying ?? false;
    fsPlayingRef.current = playing;
    setFsPlaying(playing);
    if (playing && !fsHasPlayedRef.current) {
      fsHasPlayedRef.current = true;
      setFsBuffering(false);
    } else if (!fsHasPlayedRef.current) {
      setFsBuffering(status.isBuffering ?? true);
    }
    const dur = status.durationMillis ?? 0;
    const pos = status.positionMillis ?? 0;
    fsPositionRef.current = pos;
    fsDurationRef.current = dur;
    if (dur > 0) { setFsProgress(pos / dur); setFsDurationMs(dur); }
    setFsPositionMs(pos);
  }, []);

  // ── Aspect ratio from video ────────────────────────────────────────────────
  const onReadyForDisplay = useCallback(
    (e: { naturalSize?: { width: number; height: number } }) => {
      const w = e.naturalSize?.width;
      const h = e.naturalSize?.height;
      if (w && h && h > 0 && !initialAspectRatio) setAspectRatio(w / h);
    },
    [initialAspectRatio],
  );

  // ── Seek bar PanResponder (inline, standard only) ─────────────────────────
  const seekPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder:  () => true,
        onPanResponderGrant: (e) => {
          showControls();
          const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / seekWidthRef.current));
          const t = r * durationRef.current;
          videoRef.current?.setPositionAsync(t).catch(() => {});
          positionRef.current = t;
          setProgress(r); setPositionMs(t);
        },
        onPanResponderMove: (e) => {
          showControls();
          const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / seekWidthRef.current));
          setProgress(r);
        },
        onPanResponderRelease: (e) => {
          const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / seekWidthRef.current));
          const t = r * durationRef.current;
          videoRef.current?.setPositionAsync(t).catch(() => {});
          positionRef.current = t;
          setProgress(r); setPositionMs(t);
        },
      }),
    [showControls],
  );

  // Fullscreen seek bar PanResponder (uses refs only → stable)
  const fsSeekPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder:  () => true,
        onPanResponderGrant: (e) => {
          showFsControls();
          const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / fsWidthRef.current));
          const t = r * fsDurationRef.current;
          fsVideoRef.current?.setPositionAsync(t).catch(() => {});
          fsPositionRef.current = t;
          setFsProgress(r); setFsPositionMs(t);
        },
        onPanResponderMove: (e) => {
          showFsControls();
          const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / fsWidthRef.current));
          setFsProgress(r);
        },
        onPanResponderRelease: (e) => {
          const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / fsWidthRef.current));
          const t = r * fsDurationRef.current;
          fsVideoRef.current?.setPositionAsync(t).catch(() => {});
          fsPositionRef.current = t;
          setFsProgress(r); setFsPositionMs(t);
        },
      }),
    [showFsControls],
  );

  // ── Fullscreen open / close ───────────────────────────────────────────────
  const openFullscreen = useCallback(() => {
    videoRef.current?.pauseAsync().catch(() => {});
    fsHasPlayedRef.current = false;
    setFsBuffering(true);
    setFsProgress(progress);
    setFsDurationMs(durationMs);
    setFsPositionMs(positionMs);
    setFsVisible(true);
  }, [progress, durationMs, positionMs]);

  const closeFullscreen = useCallback(() => {
    fsVideoRef.current?.pauseAsync().catch(() => {});
    setFsVisible(false);
    const pos = fsPositionRef.current;
    setTimeout(() => {
      videoRef.current?.setPositionAsync(pos).catch(() => {});
      videoRef.current?.playAsync().catch(() => {});
      showControls();
    }, 100);
  }, [showControls]);

  // ── Container sizing ──────────────────────────────────────────────────────
  const outerStyle = useMemo(() => {
    if (isShorts)        return [styles.root, { height: ph }];
    if (fillContainer)   return [styles.player, styles.playerFill];
    return [styles.player, { aspectRatio }];
  }, [isShorts, fillContainer, aspectRatio, ph]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── Render ────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={outerStyle}>

      {/* ── Poster ── */}
      {posterUri ? (
        <MsMediaLoader
          uri={posterUri}
          style={StyleSheet.absoluteFill}
          resizeMode={isShorts ? 'cover' : 'cover'}
          accessibleLabel="Video thumbnail"
        />
      ) : null}

      {/* ── Video ── */}
      {uri && !error ? (
        <Video
          ref={videoRef}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={isShorts ? ResizeMode.COVER : ResizeMode.CONTAIN}
          shouldPlay={false}
          isLooping={isShorts ? true : isLooping}
          useNativeControls={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onReadyForDisplay={onReadyForDisplay}
          onError={() => { setError(true); setIsBuffering(false); onError?.(); }}
        />
      ) : null}

      {/* ── Error state ── */}
      {(!uri || error) && !isShorts ? (
        <View style={styles.errorCenter}>
          <Text style={styles.errorTitle}>{error ? 'Video could not load' : 'Video unavailable'}</Text>
          {error ? (
            <Pressable
              style={styles.retryBtn}
              onPress={() => { setError(false); hasPlayedRef.current = false; premiumFiredRef.current = false; premiumGateRef.current = false; setPremiumGated(false); setIsBuffering(true); }}
              accessibilityLabel="Retry"
            >
              <ArrowCounterClockwise size={15} color={T.ACCENT} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ── Initial buffering overlay ── */}
      {isBuffering && !error ? (
        <View style={styles.bufferOverlay} pointerEvents="box-only">
          <ActivityIndicator size="large" color="rgba(255,255,255,0.92)" />
        </View>
      ) : null}

      {/* ── Gesture layer ── */}
      {!isBuffering && !premiumGated ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={(e) => isShorts ? handleShortsTap() : handleStandardPress(e.nativeEvent.locationX)}
          onPressIn={!isShorts ? showControls : undefined}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        />
      ) : null}

      {/* ── Controls overlay (auto-hiding) ── */}
      <Animated.View style={[StyleSheet.absoluteFill, ctrlStyle]} pointerEvents="box-none">

        {/* Shorts: centre play/pause icon with separate opacity */}
        {isShorts ? (
          <Animated.View style={[styles.iconWrap, shortsIconStyle]} pointerEvents="none">
            <View style={styles.iconCircle}>
              {isPlaying
                ? <Pause size={20} color="#fff" weight="fill" />
                : <Play  size={20} color="#fff" weight="fill" />}
            </View>
          </Animated.View>
        ) : null}

        {/* Standard: centre play/pause icon (inherits ctrlStyle opacity) */}
        {!isShorts ? (
          <Animated.View style={[styles.iconWrap, stdIconStyle]} pointerEvents="none">
            <View style={styles.iconCircle}>
              {isPlaying
                ? <Pause size={24} color="#fff" weight="fill" />
                : <Play  size={24} color="#fff" weight="fill" />}
            </View>
          </Animated.View>
        ) : null}

        {/* Standard: fill-container close button */}
        {!isShorts && fillContainer && onClose ? (
          <View style={styles.fillCloseBar} pointerEvents="box-none">
            <Pressable style={styles.fillCloseBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Close video">
              <ArrowsIn size={19} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </View>
        ) : null}

        {/* Standard: bottom control bar */}
        {!isShorts ? (
          <View style={styles.bottomBarWrap} pointerEvents="box-none">
            <SeekBar
              progress={progress}
              positionMs={positionMs}
              durationMs={durationMs}
              panResponder={seekPanResponder}
              onWidthMeasured={(w) => { seekWidthRef.current = w; }}
              onFullscreen={openFullscreen}
              showFullscreen={!fillContainer}
            />
          </View>
        ) : null}
      </Animated.View>

      {/* ── Shorts: always-visible progress strip ── */}
      {isShorts ? (
        <View style={styles.shortsTrack} pointerEvents="none">
          <View style={[styles.shortsFill, { width: `${Math.min(100, progress * 100)}%` as any }]} />
        </View>
      ) : null}

      {/* ── Standard: seek flash overlays ── */}
      {!isShorts ? (
        <>
          <Animated.View style={[styles.seekFlashL, seekLeftStyle]} pointerEvents="none">
            <View style={styles.seekBubble}>
              <Text style={styles.seekArrow}>«</Text>
              <Text style={styles.seekSec}>{SEEK_SECONDS}s</Text>
            </View>
          </Animated.View>
          <Animated.View style={[styles.seekFlashR, seekRightStyle]} pointerEvents="none">
            <View style={styles.seekBubble}>
              <Text style={styles.seekSec}>{SEEK_SECONDS}s</Text>
              <Text style={styles.seekArrow}>»</Text>
            </View>
          </Animated.View>
        </>
      ) : null}

      {/* ── Premium gate ── */}
      {premiumGated ? (
        <View style={styles.premiumOverlay}>
          <View style={styles.premiumCircle}>
            <Lock size={22} color={T.ACCENT} />
          </View>
          <Text style={styles.premiumTitle}>Premium content</Text>
          <Text style={styles.premiumSub}>Subscribe to keep watching</Text>
        </View>
      ) : null}

      {/* ── Fullscreen Modal (standard only) ── */}
      {!isShorts ? (
        <FullscreenModal
          visible={fsVisible}
          uri={uri}
          posterUri={posterUri}
          isLooping={isLooping}
          startPositionMs={positionRef.current}
          videoRef={fsVideoRef}
          isPlaying={fsPlaying}
          isBuffering={fsBuffering}
          progress={fsProgress}
          positionMs={fsPositionMs}
          durationMs={fsDurationMs}
          onStatus={onFsStatus}
          onClose={closeFullscreen}
          onPress={handleFsPress}
          onPressIn={showFsControls}
          ctrlStyle={fsCtrlStyle}
          seekPanResponder={fsSeekPanResponder}
          onSeekBarWidth={(w) => { fsWidthRef.current = w; }}
        />
      ) : null}
    </View>
  );
}

// ─── SeekBar component ────────────────────────────────────────────────────────

interface SeekBarProps {
  progress: number;
  positionMs: number;
  durationMs: number;
  panResponder: ReturnType<typeof PanResponder.create>;
  onWidthMeasured: (w: number) => void;
  onFullscreen?: () => void;
  showFullscreen?: boolean;
  onExitFullscreen?: () => void;
}

function SeekBar({
  progress,
  positionMs,
  durationMs,
  panResponder,
  onWidthMeasured,
  onFullscreen,
  showFullscreen = false,
  onExitFullscreen,
}: SeekBarProps) {
  const pct = `${Math.min(100, Math.max(0, progress * 100))}%` as any;
  return (
    <View style={sb.bar}>
      <Text style={sb.time}>{fmtTime(positionMs)}</Text>
      <View
        style={sb.track}
        onLayout={(e) => onWidthMeasured(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={[sb.fill, { width: pct }]} />
        <View style={[sb.thumb, { left: pct }]} />
      </View>
      <Text style={sb.time}>{fmtTime(durationMs)}</Text>
      {showFullscreen && onFullscreen ? (
        <Pressable style={sb.fsBtn} onPress={onFullscreen} hitSlop={10} accessibilityLabel="Enter fullscreen">
          <ArrowsOut size={17} color="rgba(255,255,255,0.85)" />
        </Pressable>
      ) : null}
      {!showFullscreen && onExitFullscreen ? (
        <Pressable style={sb.fsBtn} onPress={onExitFullscreen} hitSlop={10} accessibilityLabel="Exit fullscreen">
          <ArrowsIn size={17} color="rgba(255,255,255,0.85)" />
        </Pressable>
      ) : null}
    </View>
  );
}

const sb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: T.RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  time: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: T.FONT.medium,
    fontSize: 11,
    minWidth: 34,
    textAlign: 'center',
  },
  track: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  fill: {
    height: 3,
    backgroundColor: T.ACCENT,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    marginTop: -5,
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  fsBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── FullscreenModal component ────────────────────────────────────────────────

interface FullscreenModalProps {
  visible: boolean;
  uri: string | null;
  posterUri?: string | null;
  isLooping: boolean;
  startPositionMs: number;
  videoRef: React.RefObject<Video>;
  isPlaying: boolean;
  isBuffering: boolean;
  progress: number;
  positionMs: number;
  durationMs: number;
  onStatus: (s: AVPlaybackStatus) => void;
  onClose: () => void;
  onPress: (x: number) => void;
  onPressIn: () => void;
  ctrlStyle: ReturnType<typeof useAnimatedStyle>;
  seekPanResponder: ReturnType<typeof PanResponder.create>;
  onSeekBarWidth: (w: number) => void;
}

function FullscreenModal({
  visible,
  uri,
  posterUri,
  isLooping,
  startPositionMs,
  videoRef,
  isPlaying,
  isBuffering,
  progress,
  positionMs,
  durationMs,
  onStatus,
  onClose,
  onPress,
  onPressIn,
  ctrlStyle,
  seekPanResponder,
  onSeekBarWidth,
}: FullscreenModalProps) {
  const insets = useSafeAreaInsets();

  // Seek and auto-play when modal opens
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      if (startPositionMs > 0) {
        videoRef.current?.setPositionAsync(startPositionMs).catch(() => {});
      }
      videoRef.current?.playAsync().catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={fs.root}>
        <StatusBar hidden />

        {/* Poster */}
        {posterUri ? (
          <MsMediaLoader
            uri={posterUri}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            accessibleLabel="Video thumbnail"
          />
        ) : null}

        {/* Video */}
        {uri ? (
          <Video
            ref={videoRef}
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            isLooping={isLooping}
            useNativeControls={false}
            onPlaybackStatusUpdate={onStatus}
          />
        ) : null}

        {/* Buffering */}
        {isBuffering ? (
          <View style={styles.bufferOverlay} pointerEvents="box-only">
            <ActivityIndicator size="large" color="rgba(255,255,255,0.92)" />
          </View>
        ) : null}

        {/* Gesture */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={(e) => onPress(e.nativeEvent.locationX)}
          onPressIn={onPressIn}
        />

        {/* Controls */}
        <Animated.View style={[StyleSheet.absoluteFill, ctrlStyle]} pointerEvents="box-none">
          {/* Top: close button */}
          <View
            style={[fs.topBar, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}
            pointerEvents="box-none"
          >
            <Pressable style={fs.closeBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Exit fullscreen">
              <ArrowsIn size={19} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </View>

          {/* Centre icon */}
          <View style={styles.iconWrap} pointerEvents="none">
            <View style={styles.iconCircle}>
              {isPlaying
                ? <Pause size={26} color="#fff" weight="fill" />
                : <Play  size={26} color="#fff" weight="fill" />}
            </View>
          </View>

          {/* Bottom bar */}
          <View
            style={[fs.bottomWrap, { paddingBottom: insets.bottom + 8 }]}
            pointerEvents="box-none"
          >
            <SeekBar
              progress={progress}
              positionMs={positionMs}
              durationMs={durationMs}
              panResponder={seekPanResponder}
              onWidthMeasured={onSeekBarWidth}
              onExitFullscreen={onClose}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const fs = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#000' },
  topBar:    { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, zIndex: 12 },
  closeBtn:  {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  bottomWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 14, zIndex: 12,
  },
});

// ─── Shared styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Outer containers
  root: {
    width: SCREEN_WIDTH,
    backgroundColor: '#050506',
    overflow: 'hidden',
  },
  player: {
    width: '100%',
    backgroundColor: '#050506',
    overflow: 'hidden',
    borderRadius: T.RADIUS.xl,
  },
  playerFill: {
    flex: 1,
    borderRadius: 0,
  },

  // Error
  errorCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 4,
  },
  errorTitle: { color: '#fff', fontFamily: T.FONT.medium, fontSize: 13 },
  retryBtn:   {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 4,
  },
  retryText:  { color: T.ACCENT, fontFamily: T.FONT.semibold, fontSize: 13 },

  // Buffering
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // Icon
  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 5,
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Bottom bar wrapper
  bottomBarWrap: {
    position: 'absolute',
    left: 10, right: 10, bottom: 10,
    zIndex: 10,
  },

  // Fill-container close button (shown when fillContainer=true and onClose provided)
  fillCloseBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingHorizontal: 16,
    zIndex: 12,
  },
  fillCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Shorts progress strip
  shortsTrack: {
    position: 'absolute', left: 0, bottom: 0, right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    zIndex: 6,
  },
  shortsFill: {
    height: 3,
    backgroundColor: T.ACCENT,
  },

  // Seek flash
  seekFlashL: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: '50%',
    justifyContent: 'center',
    zIndex: 9,
  },
  seekFlashR: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: '50%',
    justifyContent: 'center',
    zIndex: 9,
  },
  seekBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: T.RADIUS.full,
  },
  seekArrow: { color: '#fff', fontFamily: T.FONT.bold, fontSize: 15 },
  seekSec:   { color: '#fff', fontFamily: T.FONT.semibold, fontSize: 13 },

  // Premium gate
  premiumOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 11,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  premiumCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  premiumTitle: { color: '#fff', fontFamily: T.FONT.bold, fontSize: 16 },
  premiumSub:   { color: 'rgba(255,255,255,0.65)', fontFamily: T.FONT.regular, fontSize: 12 },
});
