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
 *   • Centre play/pause/restart icon
 *   • Progress/seek bar with drag and tap support
 *   • Current time + total duration display
 *   • Fullscreen via built-in Modal (position preserved on open and close)
 *   • Double-tap LEFT = −10 s, double-tap RIGHT = +10 s (YouTube-style)
 *   • Animated seek feedback overlays (slide outward + fade)
 *   • Flying hearts on double-tap
 *   • Initial buffering spinner (fades in/out)
 *   • Poster/thumbnail → video crossfade
 *   • Premium gate at 3 s
 *   • Orientation picker inside fullscreen
 *
 * Shorts features (mode='shorts'):
 *   • Centre play/pause icon (auto-hides when playing)
 *   • Always-visible thin progress strip at the bottom
 *   • No seek bar, no fullscreen button
 *   • Driven by `active` prop
 *   • Double-tap to spawn flying heart
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  ArrowsIn,
  ArrowsOut,
  Lock,
  Pause,
  Play,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsShimmer } from '@/components/MsShimmer';
import { T } from '@/constants/theme';
import { MOTION } from '@/constants/motion';
import { PressScale } from '@/components/motion/PressScale';
import { FlyingHeart, useHeartBurst } from '@/components/motion/FlyingHeart';

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
  /**
   * Lifecycle gate.
   *
   * Shorts  — plays when true, pauses when false (existing behaviour).
   * Standard — pauses immediately when false (e.g. screen loses focus).
   *            Does NOT auto-play when restored to true; the user must press
   *            Play.  Pass `active={screenFocused}` from the host screen to
   *            prevent background audio/video.
   */
  active?: boolean;
  /** Shorts: called with seconds watched when the item goes inactive. */
  onViewProgress?: (seconds: number) => void;
  /** Shorts: fired when user double-taps the video (allows parent to toggle like). */
  onDoubleTap?: () => void;
  onError?: () => void;
  /**
   * When fillContainer=true (e.g. inside a fullscreen Modal), provide this to
   * render a close/back button in the controls overlay.
   */
  onClose?: () => void;
}

// ─── Constants & helpers ──────────────────────────────────────────────────────

const DOUBLE_TAP_MS    = 260;
const SEEK_SECONDS     = 10;
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
  onDoubleTap,
  onError,
  onClose,
}: MsVideoPlayerProps) {

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isShorts = mode === 'shorts';
  const ph       = pageHeight ?? windowHeight;

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
  const prevBufferingRef = useRef(true);   // tracks last known buffering state
  const videoEndedRef    = useRef(false);  // true when didJustFinish fired

  // Fullscreen refs
  const fsVideoRef      = useRef<Video>(null);
  const fsPositionRef   = useRef(0);
  const fsDurationRef   = useRef(0);
  const fsWidthRef      = useRef(0);
  const fsTapTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsHideTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsPlayingRef    = useRef(false);
  const fsPrevBuffRef   = useRef(true);
  const fsEndedRef      = useRef(false);

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
  const [videoEnded,    setVideoEnded]    = useState(false);
  const { hearts, spawnHeart } = useHeartBurst();

  // Fullscreen player state
  const [fsPlaying,    setFsPlaying]    = useState(false);
  const [fsProgress,   setFsProgress]   = useState(0);
  const [fsDurationMs, setFsDurationMs] = useState(0);
  const [fsPositionMs, setFsPositionMs] = useState(0);
  const [fsBuffering,  setFsBuffering]  = useState(true);
  const [fsVideoEnded, setFsVideoEnded] = useState(false);
  const fsHasPlayedRef = useRef(false);

  // ── Animated values ───────────────────────────────────────────────────────
  // Controls overlay (auto-hiding)
  const ctrlOpacity = useSharedValue(1);
  const ctrlStyle   = useAnimatedStyle(() => ({ opacity: ctrlOpacity.value }));
  // Bottom bar slides up 20px → 0 in lockstep with the controls fade, instead
  // of snapping into place.
  const bottomBarStyle = useAnimatedStyle(() => ({
    opacity: ctrlOpacity.value,
    transform: [{ translateY: (1 - ctrlOpacity.value) * 14 }],
  }));
  // Fullscreen controls overlay
  const fsCtrlOpacity = useSharedValue(1);
  const fsCtrlStyle   = useAnimatedStyle(() => ({ opacity: fsCtrlOpacity.value }));
  const fsBottomBarStyle = useAnimatedStyle(() => ({
    opacity: fsCtrlOpacity.value,
    transform: [{ translateY: (1 - fsCtrlOpacity.value) * 14 }],
  }));
  // Soft dark-to-clear brightness ramp on first play — video "wakes up"
  // instead of snapping straight to full exposure.
  const brightnessOpacity = useSharedValue(0.25);
  const brightnessStyle   = useAnimatedStyle(() => ({ opacity: brightnessOpacity.value }));

  // Centre icon (shorts: per-playing state; standard: part of auto-hide overlay)
  const iconScale   = useSharedValue(1);
  // Shorts-only icon opacity — starts HIDDEN (0); appears only on tap
  const shortsIconOpacity = useSharedValue(0);
  const shortsIconStyle   = useAnimatedStyle(() => ({
    opacity: shortsIconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));
  // Standard icon (opacity via parent ctrlStyle, only scale here)
  const stdIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  // Seek flash + YouTube-style outward slide
  const seekLeftOpacity  = useSharedValue(0);
  const seekRightOpacity = useSharedValue(0);
  const seekLeftX        = useSharedValue(0);
  const seekRightX       = useSharedValue(0);
  const seekLeftStyle  = useAnimatedStyle(() => ({
    opacity: seekLeftOpacity.value,
    transform: [{ translateX: seekLeftX.value }],
  }));
  const seekRightStyle = useAnimatedStyle(() => ({
    opacity: seekRightOpacity.value,
    transform: [{ translateX: seekRightX.value }],
  }));

  // Poster → video crossfade
  // posterOpacity starts 1 (thumbnail visible while loading).
  // videoOpacity starts 0 (video invisible until first frame plays).
  // On first play: poster fades out, video fades in.
  const posterOpacity = useSharedValue(1);
  const videoOpacity  = useSharedValue(0);
  const posterFadeStyle = useAnimatedStyle(() => ({ opacity: posterOpacity.value }));
  const videoFadeStyle  = useAnimatedStyle(() => ({ opacity: videoOpacity.value }));

  // Buffering overlay — always mounted, fades in/out so transitions feel premium.
  const bufferOpacity = useSharedValue(1);
  const bufferFadeStyle = useAnimatedStyle(() => ({ opacity: bufferOpacity.value }));

  // ── Reset on source change ────────────────────────────────────────────────
  useEffect(() => {
    hasPlayedRef.current    = false;
    premiumFiredRef.current = false;
    premiumGateRef.current  = false;
    isPlayingRef.current    = false;
    positionRef.current     = 0;
    durationRef.current     = 0;
    prevBufferingRef.current = true;
    videoEndedRef.current   = false;
    setPremiumGated(false);
    setError(false);
    setProgress(0);
    setDurationMs(0);
    setPositionMs(0);
    setIsPlaying(false);
    setIsBuffering(true);
    setVideoEnded(false);
    ctrlOpacity.value = 1;
    iconScale.value   = 1;
    shortsIconOpacity.value = 0;
    // Reset crossfade values
    posterOpacity.value = 1;
    videoOpacity.value  = 0;
    bufferOpacity.value = 1;
    brightnessOpacity.value = 0.25;
    if (initialAspectRatio) setAspectRatio(initialAspectRatio);
  }, [videoId, uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Standard: pause when screen loses focus (active=false) ───────────────
  useEffect(() => {
    if (isShorts) return;
    if (active === false) {
      videoRef.current?.pauseAsync().catch(() => {});
      fsVideoRef.current?.pauseAsync().catch(() => {});
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      ctrlOpacity.value = withTiming(1, { duration: 180 });
    }
  }, [active, isShorts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shorts: respond to active prop ────────────────────────────────────────
  useEffect(() => {
    if (!isShorts) return;
    if (active && !premiumGateRef.current) {
      videoRef.current?.playAsync().catch(() => {});
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      shortsIconOpacity.value = withTiming(0, { duration: 200 });
    } else {
      videoRef.current?.pauseAsync().catch(() => {});
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      shortsIconOpacity.value = withTiming(1, { duration: 180 });
    }
  }, [active, isShorts]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Unmount cleanup — stop all playback and release timers ────────────────
  useEffect(() => {
    return () => {
      videoRef.current?.stopAsync().catch(() => {});
      fsVideoRef.current?.stopAsync().catch(() => {});
      if (hideTimerRef.current)   clearTimeout(hideTimerRef.current);
      if (tapTimerRef.current)    clearTimeout(tapTimerRef.current);
      if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
      if (fsTapTimerRef.current)  clearTimeout(fsTapTimerRef.current);
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls auto-hide helpers ────────────────────────────────────────────
  const scheduleHide = useCallback((
    opacity: SharedValue<number>,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: MOTION.CONTROL_HIDE, easing: MOTION.EASE_EXIT });
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

  // ── Tap icon pulse animation ── subtle scale, no bounce ───────────────────
  const pulseIcon = useCallback(() => {
    iconScale.value = withSequence(
      withTiming(0.88, { duration: MOTION.PRESS_DOWN, easing: MOTION.EASE_EXIT }),
      withTiming(1.0,  { duration: MOTION.PRESS_UP,   easing: MOTION.EASE_ENTER }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shorts: show the icon overlay ─────────────────────────────────────────
  const showShortsIcon = useCallback(() => {
    shortsIconOpacity.value = withTiming(1, { duration: 180 });
    if (isPlayingRef.current) scheduleHide(shortsIconOpacity, hideTimerRef);
  }, [scheduleHide]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shorts: play/pause toggle (centre button) ─────────────────────────────
  const toggleShortsPlayback = useCallback(() => {
    if (premiumGateRef.current) return;
    pulseIcon();
    if (isPlayingRef.current) {
      videoRef.current?.pauseAsync().catch(() => {});
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      shortsIconOpacity.value = withTiming(1, { duration: 180 });
    } else {
      videoRef.current?.playAsync().catch(() => {});
      scheduleHide(shortsIconOpacity, hideTimerRef);
    }
  }, [pulseIcon, scheduleHide]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shorts: double-tap to spawn heart (single tap shows icon as before) ───
  const handleShortsPress = useCallback((tapX: number, tapY: number) => {
    const now  = Date.now();
    const last = lastTapRef.current;
    if (now - last.time < DOUBLE_TAP_MS) {
      // Double-tap → heart
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = { time: 0, x: 0 };
      spawnHeart(tapX, tapY);
      showShortsIcon();
      return;
    }
    lastTapRef.current = { time: now, x: tapX };
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      showShortsIcon();
    }, DOUBLE_TAP_MS);
  }, [spawnHeart, showShortsIcon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise controls auto-hide on mount
  useEffect(() => {
    scheduleHide(ctrlOpacity, hideTimerRef);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Standard: play/pause/restart toggle ───────────────────────────────────
  const toggleStandardPlayback = useCallback(() => {
    if (premiumGateRef.current) return;
    pulseIcon();
    if (videoEndedRef.current) {
      // Video ended → restart from beginning
      videoEndedRef.current = false;
      setVideoEnded(false);
      videoRef.current?.setPositionAsync(0).catch(() => {});
      videoRef.current?.playAsync().catch(() => {});
      showControls();
      return;
    }
    if (isPlayingRef.current) {
      videoRef.current?.pauseAsync().catch(() => {});
      ctrlOpacity.value = withTiming(1, { duration: 180 });
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      videoRef.current?.playAsync().catch(() => {});
      showControls();
    }
  }, [pulseIcon, showControls]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Seek helpers ──────────────────────────────────────────────────────────
  const flashLeft = useCallback(() => {
    // Reset position, then slide leftward as it fades — YouTube-style
    seekLeftX.value = 0;
    seekLeftX.value = withTiming(-20, { duration: 800, easing: Easing.out(Easing.quad) });
    seekLeftOpacity.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 380 }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flashRight = useCallback(() => {
    seekRightX.value = 0;
    seekRightX.value = withTiming(20, { duration: 800, easing: Easing.out(Easing.quad) });
    seekRightOpacity.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 380 }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seekBy = useCallback((deltaS: number, ref: React.RefObject<Video | null>) => {
    const target = Math.max(0, Math.min(durationRef.current, positionRef.current + deltaS * 1000));
    ref.current?.setPositionAsync(target).catch(() => {});
    positionRef.current = target;
    if (durationRef.current > 0) setProgress(target / durationRef.current);
    setPositionMs(target);
  }, []);

  // ── Standard tap (single / double) ───────────────────────────────────────
  const handleStandardPress = useCallback((tapX: number, tapY: number) => {
    if (premiumGateRef.current) return;
    const now  = Date.now();
    const last = lastTapRef.current;
    const W    = windowWidth;

    if (now - last.time < DOUBLE_TAP_MS) {
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = { time: 0, x: 0 };
      if (tapX < W / 2) {
        seekBy(-SEEK_SECONDS, videoRef);
        flashLeft();
      } else {
        seekBy(SEEK_SECONDS, videoRef);
        flashRight();
        spawnHeart(tapX, tapY);  // heart on right double-tap (forward seek = like gesture)
      }
      showControls();
      return;
    }

    lastTapRef.current = { time: now, x: tapX };
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      showControls();
    }, DOUBLE_TAP_MS);
  }, [seekBy, flashLeft, flashRight, showControls, spawnHeart, windowWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fullscreen tap (ratio 0..1 from left edge) ────────────────────────────
  const handleFsPress = useCallback((tapRatio: number) => {
    const now  = Date.now();
    const last = lastTapRef.current;

    if (now - last.time < DOUBLE_TAP_MS) {
      if (fsTapTimerRef.current) { clearTimeout(fsTapTimerRef.current); fsTapTimerRef.current = null; }
      lastTapRef.current = { time: 0, x: 0 };
      const target = tapRatio < 0.5
        ? Math.max(0, fsPositionRef.current - SEEK_SECONDS * 1000)
        : Math.min(fsDurationRef.current, fsPositionRef.current + SEEK_SECONDS * 1000);
      fsVideoRef.current?.setPositionAsync(target).catch(() => {});
      fsPositionRef.current = target;
      if (fsDurationRef.current > 0) setFsProgress(target / fsDurationRef.current);
      setFsPositionMs(target);
      showFsControls();
      return;
    }

    lastTapRef.current = { time: now, x: tapRatio };
    fsTapTimerRef.current = setTimeout(() => {
      fsTapTimerRef.current = null;
      showFsControls();
    }, DOUBLE_TAP_MS);
  }, [showFsControls]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fullscreen: play/pause/restart toggle ─────────────────────────────────
  const toggleFsPlayback = useCallback(() => {
    if (fsEndedRef.current) {
      // Restart fullscreen video
      fsEndedRef.current = false;
      setFsVideoEnded(false);
      fsVideoRef.current?.setPositionAsync(0).catch(() => {});
      fsVideoRef.current?.playAsync().catch(() => {});
      showFsControls();
      return;
    }
    if (fsPlayingRef.current) {
      fsVideoRef.current?.pauseAsync().catch(() => {});
      fsCtrlOpacity.value = withTiming(1, { duration: 180 });
      if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
    } else {
      fsVideoRef.current?.playAsync().catch(() => {});
      showFsControls();
    }
  }, [showFsControls]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback status (inline) ───────────────────────────────────────────────
  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      const playing = status.isPlaying ?? false;
      isPlayingRef.current = playing;
      setIsPlaying(playing);

      // True only on the single status tick where playback first begins.
      const justStartedPlaying = playing && !hasPlayedRef.current;

      // Crossfade: on first play, fade poster out and video in
      if (justStartedPlaying) {
        hasPlayedRef.current = true;
        // Video fades in from black; poster fades out beneath
        videoOpacity.value  = withTiming(1, { duration: 280, easing: MOTION.EASE_ENTER });
        posterOpacity.value = withTiming(0, { duration: 380, easing: MOTION.EASE_ENTER });
        // Brightness ramp: video "wakes up" from a dim exposure to 100%.
        brightnessOpacity.value = withTiming(0, { duration: 420, easing: MOTION.EASE_ENTER });
      }

      // Restart detection
      if (status.didJustFinish) {
        videoEndedRef.current = true;
        setVideoEnded(true);
      }
      if (playing && videoEndedRef.current) {
        videoEndedRef.current = false;
        setVideoEnded(false);
      }

      // Buffering — animate shimmer in/out instead of conditional mount.
      // `justStartedPlaying` is authoritative and wins over a stale
      // `isBuffering: true` the engine can still report for one frame right
      // as playback begins — this is what prevents the loader from ever
      // lingering over video that is already playing.
      const nextBuffering = justStartedPlaying
        ? false
        : hasPlayedRef.current
          ? (status.isBuffering ?? false)
          : (status.isBuffering ?? true);
      setIsBuffering(nextBuffering);
      if (nextBuffering !== prevBufferingRef.current) {
        prevBufferingRef.current = nextBuffering;
        bufferOpacity.value = withTiming(nextBuffering ? 1 : 0, {
          duration: nextBuffering ? 150 : 240,
          easing: nextBuffering ? MOTION.EASE_ENTER : MOTION.EASE_EXIT,
        });
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

    const fsJustStartedPlaying = playing && !fsHasPlayedRef.current;
    if (fsJustStartedPlaying) {
      fsHasPlayedRef.current = true;
    }

    // Restart detection
    if (status.didJustFinish) {
      fsEndedRef.current = true;
      setFsVideoEnded(true);
    }
    if (playing && fsEndedRef.current) {
      fsEndedRef.current = false;
      setFsVideoEnded(false);
    }

    // Buffering animation — first-play tick always wins over a stale
    // isBuffering:true the engine can still report for one frame.
    const nextBuf = fsJustStartedPlaying
      ? false
      : fsHasPlayedRef.current
        ? (status.isBuffering ?? false)
        : (status.isBuffering ?? true);
    setFsBuffering(nextBuf);
    if (nextBuf !== fsPrevBuffRef.current) {
      fsPrevBuffRef.current = nextBuf;
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

  // Fullscreen seek bar PanResponder
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
    fsPrevBuffRef.current  = true;
    fsEndedRef.current     = false;
    setFsBuffering(true);
    setFsVideoEnded(false);
    setFsProgress(progress);
    setFsDurationMs(durationMs);
    setFsPositionMs(positionMs);
    setFsVisible(true);
    if (aspectRatio >= 1) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    } else {
      ScreenOrientation.unlockAsync().catch(() => {});
    }
  }, [progress, durationMs, positionMs, aspectRatio]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeFullscreen = useCallback(() => {
    fsVideoRef.current?.pauseAsync().catch(() => {});
    const pos = fsPositionRef.current;
    setFsVisible(false);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    setTimeout(() => {
      videoRef.current?.setPositionAsync(pos).catch(() => {});
      videoRef.current?.playAsync().catch(() => {});
      showControls();
    }, 180);
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

      {/* ── Poster (crossfades out when video starts) ── */}
      {posterUri ? (
        <Animated.View style={[StyleSheet.absoluteFill, posterFadeStyle]} pointerEvents="none">
          <MsMediaLoader
            uri={posterUri}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibleLabel="Video thumbnail"
          />
        </Animated.View>
      ) : null}

      {/* ── Video (crossfades in on first play) ── */}
      {uri && !error ? (
        <Animated.View style={[StyleSheet.absoluteFill, videoFadeStyle]}>
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
        </Animated.View>
      ) : null}

      {/* ── Error state ── */}
      {(!uri || error) && !isShorts ? (
        <View style={styles.errorCenter}>
          <Text style={styles.errorTitle}>{error ? 'Video could not load' : 'Video unavailable'}</Text>
          {error ? (
            <Pressable
              style={styles.retryBtn}
              onPress={() => {
                setError(false);
                hasPlayedRef.current    = false;
                premiumFiredRef.current = false;
                premiumGateRef.current  = false;
                prevBufferingRef.current = true;
                videoEndedRef.current   = false;
                setPremiumGated(false);
                setIsBuffering(true);
                setVideoEnded(false);
                posterOpacity.value = 1;
                videoOpacity.value  = 0;
                bufferOpacity.value = 1;
              }}
              accessibilityLabel="Retry"
            >
              <ArrowCounterClockwise size={15} color={T.ACCENT} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ── Buffering overlay — skeleton shimmer, opacity-driven for smooth fades ── */}
      {!error ? (
        <Animated.View style={[styles.bufferOverlay, bufferFadeStyle]} pointerEvents="none">
          <MsShimmer
            style={StyleSheet.absoluteFill as any}
            height={4}
            borderRadius={0}
          />
        </Animated.View>
      ) : null}

      {/* ── Brightness ramp — video "wakes up" from a dim exposure on first play ── */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.brightnessOverlay, brightnessStyle]} pointerEvents="none" />

      {/* ── Gesture layer — always active once loaded, independent of buffering ── */}
      {!premiumGated ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={(e) => {
            const { locationX, locationY } = e.nativeEvent;
            if (isShorts) handleShortsPress(locationX, locationY);
            else          handleStandardPress(locationX, locationY);
          }}
          onPressIn={!isShorts ? showControls : undefined}
          accessibilityRole="button"
          accessibilityLabel="Show controls"
        />
      ) : null}

      {/* ── Shorts: tappable centre play/pause button ── */}
      {isShorts && !premiumGated ? (
        <Animated.View style={[styles.iconWrap, styles.shortsIconLayer, shortsIconStyle]} pointerEvents="box-none">
          <PressScale
            style={styles.iconCircle}
            onPress={toggleShortsPlayback}
            hitSlop={16}
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying
              ? <Pause size={16} color="#fff" weight="fill" />
              : <Play  size={16} color="#fff" weight="fill" />}
          </PressScale>
        </Animated.View>
      ) : null}

      {/* ── Controls overlay (auto-hiding) ── */}
      <Animated.View style={[StyleSheet.absoluteFill, ctrlStyle]} pointerEvents="box-none">

        {/* Standard: centre play / pause / restart */}
        {!isShorts ? (
          <Animated.View style={[styles.iconWrap, stdIconStyle]} pointerEvents="box-none">
            <PressScale
              style={styles.iconCircle}
              onPress={toggleStandardPlayback}
              hitSlop={16}
              accessibilityLabel={videoEnded ? 'Restart' : isPlaying ? 'Pause' : 'Play'}
            >
              {videoEnded ? (
                <Animated.View key="replay" entering={FadeIn.duration(MOTION.FADE_IN)}>
                  <ArrowCounterClockwise size={19} color="#fff" weight="bold" />
                </Animated.View>
              ) : isPlaying ? (
                <Pause size={19} color="#fff" weight="fill" />
              ) : (
                <Play size={19} color="#fff" weight="fill" />
              )}
            </PressScale>
          </Animated.View>
        ) : null}

        {/* Standard: fill-container close button */}
        {!isShorts && fillContainer && onClose ? (
          <View style={styles.fillCloseBar} pointerEvents="box-none">
            <PressScale style={styles.fillCloseBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Close video">
              <ArrowsIn size={15} color="rgba(255,255,255,0.9)" />
            </PressScale>
          </View>
        ) : null}

        {/* Standard: bottom control bar */}
        {!isShorts ? (
          <Animated.View style={[styles.bottomBarWrap, bottomBarStyle]} pointerEvents="box-none">
            <SeekBar
              progress={progress}
              positionMs={positionMs}
              durationMs={durationMs}
              panResponder={seekPanResponder}
              onWidthMeasured={(w) => { seekWidthRef.current = w; }}
              onFullscreen={openFullscreen}
              showFullscreen={!fillContainer}
              hasBackground={fillContainer}
            />
          </Animated.View>
        ) : null}
      </Animated.View>

      {/* ── Shorts: always-visible progress strip ── */}
      {isShorts ? (
        <View style={styles.shortsTrack} pointerEvents="none">
          <View style={[styles.shortsFill, { width: `${Math.min(100, progress * 100)}%` as any }]} />
        </View>
      ) : null}

      {/* ── Standard: seek flash overlays (slide outward + fade) ── */}
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

      {/* ── Flying hearts ── */}
      {hearts.map(h => (
        <FlyingHeart key={h.id} x={h.x} y={h.y} />
      ))}

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
          videoEnded={fsVideoEnded}
          progress={fsProgress}
          positionMs={fsPositionMs}
          durationMs={fsDurationMs}
          onStatus={onFsStatus}
          onClose={closeFullscreen}
          onPress={handleFsPress}
          onPressIn={showFsControls}
          onTogglePlay={toggleFsPlayback}
          ctrlStyle={fsCtrlStyle}
          seekPanResponder={fsSeekPanResponder}
          onSeekBarWidth={(w) => { fsWidthRef.current = w; }}
          onOrientPickerChange={(open) => {
            // Suspend the auto-hide timer while orientation picker is open
            // so controls don't disappear beneath the modal menu.
            if (open) {
              if (fsHideTimerRef.current) {
                clearTimeout(fsHideTimerRef.current);
                fsHideTimerRef.current = null;
              }
              fsCtrlOpacity.value = withTiming(1, { duration: MOTION.CONTROL_SHOW });
            } else {
              // Picker closed — restart the normal auto-hide countdown.
              scheduleHide(fsCtrlOpacity, fsHideTimerRef);
            }
          }}
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
  hasBackground?: boolean;
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
  hasBackground = true,
}: SeekBarProps) {
  const pct = `${Math.min(100, Math.max(0, progress * 100))}%` as any;
  return (
    <View style={[sb.bar, !hasBackground && sb.barNoBackground]}>
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
          <ArrowsOut size={15} color="rgba(255,255,255,0.85)" />
        </Pressable>
      ) : null}
      {!showFullscreen && onExitFullscreen ? (
        <Pressable style={sb.fsBtn} onPress={onExitFullscreen} hitSlop={10} accessibilityLabel="Exit fullscreen">
          <ArrowsIn size={15} color="rgba(255,255,255,0.85)" />
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
  barNoBackground: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
  videoRef: React.RefObject<Video | null>;
  isPlaying: boolean;
  isBuffering: boolean;
  videoEnded: boolean;
  progress: number;
  positionMs: number;
  durationMs: number;
  onStatus: (s: AVPlaybackStatus) => void;
  onClose: () => void;
  onPress: (tapRatio: number) => void;
  onPressIn: () => void;
  onTogglePlay: () => void;
  ctrlStyle: object;
  seekPanResponder: ReturnType<typeof PanResponder.create>;
  onSeekBarWidth: (w: number) => void;
  /** Called when orientation picker opens (true) or closes (false). */
  onOrientPickerChange: (open: boolean) => void;
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
  videoEnded,
  progress,
  positionMs,
  durationMs,
  onStatus,
  onClose,
  onPress,
  onPressIn,
  onTogglePlay,
  ctrlStyle,
  seekPanResponder,
  onSeekBarWidth,
  onOrientPickerChange,
}: FullscreenModalProps) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { width: fsWindowWidth } = useWindowDimensions();
  const [showOrientPicker, setShowOrientPicker] = useState(false);

  // Orientation picker: notify parent so it can suspend the auto-hide timer.
  // No auto-dismiss — the popup stays until the user acts or taps outside.
  const openOrientPicker = useCallback(() => {
    setShowOrientPicker(true);
    onOrientPickerChange(true);
  }, [onOrientPickerChange]);

  const closeOrientPicker = useCallback(() => {
    setShowOrientPicker(false);
    onOrientPickerChange(false);
  }, [onOrientPickerChange]);

  // Buffering overlay opacity inside fullscreen
  const fsBufOpacity = useSharedValue(1);
  const fsBufStyle   = useAnimatedStyle(() => ({ opacity: fsBufOpacity.value }));

  useEffect(() => {
    fsBufOpacity.value = withTiming(isBuffering ? 1 : 0, {
      duration: isBuffering ? 150 : 240,
      easing: MOTION.EASE_EXIT,
    });
  }, [isBuffering]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible) return;
    StatusBar.setHidden(true, 'fade');
    const t = setTimeout(() => {
      if (startPositionMs > 0) {
        videoRef.current?.setPositionAsync(startPositionMs).catch(() => {});
      }
      videoRef.current?.playAsync().catch(() => {});
    }, 220);
    return () => {
      clearTimeout(t);
      StatusBar.setHidden(false, 'fade');
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      hardwareAccelerated={Platform.OS === 'android'}
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={fs.root}>
        <StatusBar hidden translucent backgroundColor="transparent" />

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

        {/* Buffering overlay — skeleton shimmer, opacity-animated */}
        <Animated.View style={[styles.bufferOverlay, fsBufStyle]} pointerEvents="none">
          <MsShimmer
            style={StyleSheet.absoluteFill as any}
            height={4}
            borderRadius={0}
          />
        </Animated.View>

        {/* Gesture layer */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={(e) => onPress(e.nativeEvent.locationX / Math.max(fsWindowWidth, 1))}
          onPressIn={onPressIn}
        />

        {/* Controls overlay */}
        <Animated.View style={[StyleSheet.absoluteFill, ctrlStyle]} pointerEvents="box-none">

          {/* Top bar */}
          <View style={fs.topBar} pointerEvents="box-none">
            <PressScale style={fs.closeBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Exit fullscreen">
              <ArrowsIn size={15} color="rgba(255,255,255,0.9)" />
            </PressScale>
            {/* Orientation picker button */}
            <PressScale
              style={[fs.closeBtn, { marginLeft: 10 }]}
              onPress={openOrientPicker}
              hitSlop={12}
              accessibilityLabel="Orientation"
            >
              <ArrowsClockwise size={15} color="rgba(255,255,255,0.9)" />
            </PressScale>
          </View>

          {/* Orientation picker panel — stays open until user acts or taps outside.
              Auto-hide timer is suspended while this is visible (see onOrientPickerChange). */}
          {showOrientPicker ? (
            <>
              <Animated.View
                style={StyleSheet.absoluteFill}
                entering={FadeIn.duration(MOTION.PANEL_IN)}
                exiting={FadeOut.duration(MOTION.PANEL_OUT)}
              >
                <Pressable style={StyleSheet.absoluteFill} onPress={closeOrientPicker} />
              </Animated.View>
              <Animated.View
                style={fs.orientPanel}
                entering={ZoomIn.duration(MOTION.PANEL_IN).springify().damping(18)}
                exiting={FadeOut.duration(MOTION.PANEL_OUT)}
                pointerEvents="box-none"
              >
                <Text style={fs.orientTitle}>Orientation</Text>
                <Pressable
                  style={fs.orientRow}
                  onPress={() => {
                    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
                    closeOrientPicker();
                  }}
                >
                  <Text style={fs.orientLabel}>Portrait</Text>
                </Pressable>
                <Pressable
                  style={fs.orientRow}
                  onPress={() => {
                    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
                    closeOrientPicker();
                  }}
                >
                  <Text style={fs.orientLabel}>Landscape</Text>
                </Pressable>
                <Pressable
                  style={fs.orientRow}
                  onPress={() => {
                    ScreenOrientation.unlockAsync().catch(() => {});
                    closeOrientPicker();
                  }}
                >
                  <Text style={fs.orientLabel}>Auto Rotate</Text>
                </Pressable>
              </Animated.View>
            </>
          ) : null}

          {/* Centre play / pause / restart */}
          <View style={styles.iconWrap} pointerEvents="box-none">
            <PressScale
              style={styles.iconCircle}
              onPress={onTogglePlay}
              hitSlop={16}
              accessibilityLabel={videoEnded ? 'Restart' : isPlaying ? 'Pause' : 'Play'}
            >
              {videoEnded ? (
                <Animated.View key="fs-replay" entering={FadeIn.duration(MOTION.FADE_IN)}>
                  <ArrowCounterClockwise size={20} color="#fff" weight="bold" />
                </Animated.View>
              ) : isPlaying ? (
                <Pause size={20} color="#fff" weight="fill" />
              ) : (
                <Play size={20} color="#fff" weight="fill" />
              )}
            </PressScale>
          </View>

          {/* Bottom bar */}
          <View
            style={[fs.bottomWrap, { paddingBottom: Math.max(8, safeBottom) }]}
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
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 20 : 14,
    paddingHorizontal: 16,
    zIndex: 12,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  bottomWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 14, zIndex: 12,
  },
  // Orientation picker panel
  orientPanel: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 68 : 62,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
    zIndex: 20,
    minWidth: 160,
  },
  orientTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: T.FONT.medium,
    fontSize: 11,
    paddingHorizontal: 12,
    paddingBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  orientRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  orientLabel: {
    color: '#fff',
    fontFamily: T.FONT.medium,
    fontSize: 14,
  },
});

// ─── Shared styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Outer containers
  root: {
    width: '100%',
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

  // Buffering overlay — always mounted; opacity animated
  // Buffering overlay — shimmer sweeps over a light dim; no spinner.
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },

  // Brightness ramp overlay — sits above the video, fades from dim to clear.
  brightnessOverlay: {
    backgroundColor: '#000',
    zIndex: 3,
  },

  // Icon
  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 5,
  },
  shortsIconLayer: {
    zIndex: 12,
  },
  iconCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Bottom bar wrapper
  bottomBarWrap: {
    position: 'absolute',
    left: 10, right: 10, bottom: 10,
    zIndex: 10,
  },

  // Fill-container close button
  fillCloseBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingHorizontal: 16,
    zIndex: 12,
  },
  fillCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
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
    pointerEvents: 'none',
  },
  seekFlashR: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: '50%',
    justifyContent: 'center',
    zIndex: 9,
    pointerEvents: 'none',
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
