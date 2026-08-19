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
 *   • Native seek bar (platform Slider, pink brand accent) — reliable native
 *     dragging/tapping with playback position always synchronized
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
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  ArrowsIn,
  ArrowsOut,
  CaretDown,
  Check,
  Lock,
  Pause,
  Play,
} from 'phosphor-react-native';
import type { MediaQuality } from '@/services/posts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsShimmer } from '@/components/MsShimmer';
import { T } from '@/constants/theme';
import { MOTION } from '@/constants/motion';
import { PressScale } from '@/components/motion/PressScale';
import { FlyingHeart, useHeartBurst } from '@/components/motion/FlyingHeart';
import {
  getCachedVideoFile,
  downloadAndCacheVideo,
  preloadVideo,
} from '@/services/video-cache';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoPlayerMode = 'standard' | 'shorts';

export interface MsVideoPlayerProps {
  /** Unique key — player state resets when this changes. */
  videoId: string;
  uri: string | null;
  posterUri?: string | null;
  /**
   * Server-authoritative playable quality variants (from the video/short API).
   * The quality selector only appears when more than one variant exists — the
   * client never invents qualities. "Auto" uses the server's default variant.
   */
  qualities?: MediaQuality[];
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
  /** Pre-buffer video stream in native memory for adjacent items (default false) */
  prebuffer?: boolean;
  /** Called with ADDITIONAL seconds watched since the last report (deltas —
   *  the server accumulates them and counts a view once per account). */
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
// Seek-sync: how close the engine's reported position must be to the requested
// target before we accept it (MP4 seeks snap to the nearest keyframe, so a few
// hundred ms of drift is normal), and how long to hold an optimistic seek
// position before releasing and trusting the engine again.
const SEEK_CONFIRM_TOLERANCE_MS = 2000;
const SEEK_TIMEOUT_MS = 4000;
// How many times a dropped/reset seek may be re-asserted before giving up.
// If the engine still reports a position nowhere near the target after the
// timeout (the native seek was silently dropped, or the source reset to 0),
// re-issue the seek instead of accepting the wrong position — this is what
// guarantees playback actually begins at the requested timestamp rather than
// snapping back to 0:00.
const SEEK_MAX_RETRIES = 2;
// A seek must never be "confirmed" by the position reported synchronously from
// setPositionAsync() itself — on Android that value can be the optimistic
// target while the native engine is still seeking, which is what made the
// tracker snap back to 0 / the beginning. Require a short settle window so the
// first poll (getStatusAsync) reads the engine's real position instead.
const SEEK_SETTLE_MS = 600;
// Seek tolerances handed to the native engine on every seek. These must be
// ZERO (sample-accurate), not a wide window: a ±30s tolerance tells AVPlayer
// (iOS) it may snap to the nearest keyframe within that window, so a sparse-
// keyframe MP4 seeking to 00:23 lands back at 00:00 and the tracker snaps to
// zero. Zero forces an exact seek so the player lands precisely on the target
// (Android already ignores these tolerances and seeks exactly).
const SEEK_TOLERANCES = {
  toleranceMillisBefore: 0,
  toleranceMillisAfter: 0,
};
// Local preference for the user's chosen quality label (a local UX preference
// only — the actual available qualities always come from the server).
const QUALITY_PREF_KEY = 'ms_quality_pref_v1';

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
  qualities,
  autoPlay      = false,
  isLooping     = false,
  isPremium     = false,
  onPremiumRequired,
  mode          = 'standard',
  fillContainer = false,
  initialAspectRatio,
  pageHeight,
  active,
  prebuffer     = false,
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
  const lastTapRef      = useRef({ time: 0, x: 0 });
  const tapTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBufferingRef = useRef(true);   // tracks last known buffering state
  const videoEndedRef    = useRef(false);  // true when didJustFinish fired
  // Watch-time accumulation (both inline + fullscreen players share one
  // accumulator so time is never lost when toggling fullscreen). Deltas are
  // flushed every ~4s of real playback and on pause/end/unmount.
  const watchAccumRef    = useRef(0);
  const watchLastPosRef  = useRef<number | null>(null);

  // Fullscreen refs
  const fsVideoRef      = useRef<Video>(null);
  const fsPositionRef   = useRef(0);
  const fsDurationRef   = useRef(0);
  const fsTapTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsHideTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsPlayingRef    = useRef(false);
  const fsPrevBuffRef   = useRef(true);
  const fsEndedRef      = useRef(false);
  // Quality switch: position + playback to restore once the new variant loads.
  // `target` picks the player that should consume it (both inline + fullscreen
  // Video instances reload on a source change, so only the active one resumes).
  const pendingResumeRef = useRef<{
    position: number;
    shouldPlay: boolean;
    target: 'inline' | 'fs';
  } | null>(null);
  // The last source handed to the engine. Guards the cache-resolution effect
  // so it never re-sets the same URI (e.g. when `active` flips and a background
  // download has since completed) — expo-av restarts from 0 on ANY source
  // change, which is what made playback "jump back to the beginning".
  const lastResolvedUriRef = useRef<string | null>(null);
  // Guards the engine-source resolution to ONE hand-off per (videoId, url)
  // session. Without it, a background cache download finishing mid-session
  // (the resolution effect re-runs on every `active` flip) swapped the engine
  // source remote → cached file and expo-av restarted playback from 0 — the
  // "seek/position jumps back to the beginning" bug.
  const lastResolvedSessionRef = useRef<string | null>(null);
  // Pending-seek guards — after requesting a seek the native engine can still
  // report the stale (pre-seek) position for a tick or two, which was snapping
  // the seek bar back to 0 / the old position and desyncing the UI from the
  // actual playback position. While a seek is in flight we hold the optimistic
  // target; once the engine reports a position near the target (or the seek
  // times out) we release the guard and resume live tracking.
  const pendingSeekRef   = useRef<{ target: number; at: number; retries: number } | null>(null);
  const fsPendingSeekRef = useRef<{ target: number; at: number; retries: number } | null>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [isBuffering,   setIsBuffering]   = useState(true);
  const [premiumGated,  setPremiumGated]  = useState(false);
  const [error,         setError]         = useState(false);
  const [playableUri,   setPlayableUri]   = useState<string | null>(uri);
  // ── Quality selection ──
  // selectedUrl is the actual source handed to the engine (the chosen quality
  // variant, or the original uri for Auto). Switching quality swaps this and
  // resumes from the previous position instead of restarting the video.
  const [selectedUrl,          setSelectedUrl]          = useState<string | null>(uri);
  const [selectedQualityLabel, setSelectedQualityLabel] = useState('auto');
  const [qualityMenuOpen,      setQualityMenuOpen]      = useState(false);
  const [progress,      setProgress]      = useState(0);
  const [durationMs,    setDurationMs]    = useState(0);
  const [positionMs,    setPositionMs]    = useState(0);
  // Native seek-bar drag state — while the user drags the Slider, its value
  // comes from dragMs so the player's own position ticks can't snap the thumb
  // back (the old custom tracker's jump/reset bug). On release the seek lands
  // and dragMs clears, resuming live position tracking.
  const [dragging,      setDragging]      = useState(false);
  const [dragMs,        setDragMs]        = useState<number | null>(null);
  const [aspectRatio,   setAspectRatio]   = useState(initialAspectRatio ?? 16 / 9);
  const [fsVisible,     setFsVisible]     = useState(false);
  const [videoEnded,    setVideoEnded]    = useState(false);
  const { hearts, spawnHeart } = useHeartBurst();

  // Fullscreen player state
  const [fsPlaying,    setFsPlaying]    = useState(false);
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
    pendingSeekRef.current   = null;
    fsPendingSeekRef.current = null;
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
  }, [videoId, selectedUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Quality: follow a NEW video (uri prop change) while keeping the user's
  // remembered quality preference applied to it. ─────────────────────────────
  useEffect(() => {
    setSelectedUrl(uri);
    setQualityMenuOpen(false);
  }, [uri]);

  // ── Quality: server-provided options + remembered preference ──────────────
  // The available qualities come ONLY from the server (never invented here).
  // The user's selected label may be stored as a local preference, but it only
  // takes effect when the server actually offers that variant.
  const qualityOptions = useMemo(() => {
    if (!qualities || qualities.length === 0) {
      return uri ? [{ label: 'Auto', url: uri }] : [];
    }
    const list = qualities.some((q) => q.label === 'Auto')
      ? qualities
      : [{ label: 'Auto', url: qualities[0].url }, ...qualities];
    return list.filter((q) => q && typeof q.url === 'string' && q.url);
  }, [qualities, uri]);

  const showQualityPicker = qualityOptions.length > 1;
  const currentQualityLabel =
    selectedQualityLabel === 'auto' || !qualityOptions.some((o) => o.label === selectedQualityLabel)
      ? 'Auto'
      : selectedQualityLabel;

  // Restore the remembered quality when a video (or its quality list) loads.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(QUALITY_PREF_KEY)
      .then((pref) => {
        if (cancelled || !pref) return;
        if (pref === 'Auto' || qualityOptions.some((o) => o.label === pref)) {
          setSelectedQualityLabel(pref === 'Auto' ? 'auto' : pref);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [videoId, qualityOptions]);

  const persistQualityPref = useCallback((label: string) => {
    AsyncStorage.setItem(QUALITY_PREF_KEY, label).catch(() => {});
  }, []);

  /**
   * Switch quality — swaps the engine source and resumes from the previous
   * position (playback never restarts from zero). Only switches when the
   * server offered the variant.
   */
  const handleQualityChange = useCallback((label: string) => {
    setQualityMenuOpen(false);
    if (label === currentQualityLabel) return;
    const option = qualityOptions.find((o) => o.label === label);
    if (!option?.url) return;
    if (option.url === selectedUrl) {
      setSelectedQualityLabel(label === 'Auto' ? 'auto' : label);
      persistQualityPref(label);
      return;
    }
    // Preserve position + playback across the source swap. The active player
    // (fullscreen or inline) consumes this once its new source has loaded.
    const target: 'inline' | 'fs' = fsVisible ? 'fs' : 'inline';
    const pos     = fsVisible ? fsPositionRef.current : positionRef.current;
    const playing = fsVisible ? fsPlayingRef.current : isPlayingRef.current;
    if (pos > 0 || playing) {
      pendingResumeRef.current = { position: pos, shouldPlay: playing, target };
    }
    setSelectedQualityLabel(label === 'Auto' ? 'auto' : label);
    persistQualityPref(label);
    setSelectedUrl(option.url);
  }, [qualityOptions, selectedUrl, currentQualityLabel, persistQualityPref, fsVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Local disk caching for 0ms rewinds and instant replay ──────────────────
  // Cache entries are keyed by quality too, so different variants never
  // overwrite each other on disk.
  const cacheKey =
    selectedQualityLabel !== 'auto' && selectedQualityLabel
      ? `${videoId}__q_${selectedQualityLabel}`
      : videoId;

  useEffect(() => {
    let isCurrent = true;
    if (!selectedUrl) {
      setPlayableUri(null);
      return;
    }

    const sessionKey = `${videoId}::${selectedUrl}`;
    if (lastResolvedSessionRef.current === sessionKey) {
      // This session already handed a source to the engine — never swap it
      // mid-playback (a remote → cached-file swap restarts the video at 0).
      // The background download may still finish the cache for NEXT session.
      if (active || prebuffer || autoPlay || isShorts) {
        downloadAndCacheVideo(selectedUrl, cacheKey).catch(() => {});
      }
      return;
    }

    // 1. Check if video already exists in local disk cache
    getCachedVideoFile(selectedUrl, cacheKey).then((cachedPath) => {
      if (!isCurrent) return;
      const next = cachedPath ?? selectedUrl;
      lastResolvedSessionRef.current = sessionKey;
      lastResolvedUriRef.current = next;
      setPlayableUri(next);
      if (!cachedPath) {
        // Start background download if player is active, prebuffering, or shorts
        if (active || prebuffer || autoPlay || isShorts) {
          downloadAndCacheVideo(selectedUrl, cacheKey).catch(() => {});
        }
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [selectedUrl, cacheKey, videoId, active, prebuffer, autoPlay, isShorts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preload upcoming videos when prebuffer is true ────────────────────────
  useEffect(() => {
    if (prebuffer && selectedUrl) {
      preloadVideo(selectedUrl, cacheKey);
    }
  }, [prebuffer, selectedUrl, cacheKey]);

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

  // ── Standard: position polling (expo-av Android workaround) ──────────────
  // expo-av's onPlaybackStatusUpdate does NOT fire at regular intervals on
  // Android during playback (expo/expo#29044) — it only emits on load / play /
  // pause / seek. That left the long-form seek bar frozen while the video
  // played and only "caught up" on pause. getStatusAsync() always reads the
  // live native position and re-enters onPlaybackStatusUpdate/onFsStatus via
  // _handleNewStatus, so polling it keeps the tracker, watch-time accumulator
  // and seek confirmation advancing. Shorts are excluded — they are driven by
  // `active` and must remain untouched.
  useEffect(() => {
    if (isShorts) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const player = (fsVisible ? fsVideoRef : videoRef).current;
      if (!player) return;
      player.getStatusAsync().catch(() => {});
    };
    const id = setInterval(tick, 250);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isShorts, fsVisible]);

  // ── Shorts: respond to active prop ────────────────────────────────────────
  // The centre play/pause icon is HIDDEN until the user interacts with the
  // short (handleShortsPress / toggleShortsPlayback reveal it). An inactive or
  // not-yet-playing short must NOT force it visible — that was the play button
  // flashing over the poster/first frame while loading or during swipes.
  useEffect(() => {
    if (!isShorts) return;
    if (active && !premiumGateRef.current) {
      videoRef.current?.playAsync().catch(() => {});
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      shortsIconOpacity.value = withTiming(0, { duration: 200 });
    } else {
      videoRef.current?.pauseAsync().catch(() => {});
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
  }, [active, isShorts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── View-progress tracking ────────────────────────────────────────────────
  // Report accumulated watch time as a DELTA (not a cumulative total) — the
  // server adds it to the account's running total and counts a view exactly
  // once per account+content when the threshold is crossed.
  const flushWatch = useCallback(() => {
    if (watchAccumRef.current > 0 && onViewProgress) {
      const seconds = watchAccumRef.current;
      watchAccumRef.current = 0;
      onViewProgress(seconds);
    }
  }, [onViewProgress]);

  const accumulateWatch = useCallback(
    (posMs: number, playing: boolean, scrubbing: boolean) => {
      if (!onViewProgress) return;
      if (!playing || scrubbing) {
        watchLastPosRef.current = null;
        if (!playing) flushWatch();
        return;
      }
      if (watchLastPosRef.current !== null) {
        const delta = (posMs - watchLastPosRef.current) / 1000;
        // Guard against seeks / loops / clock discontinuities: only count
        // sane forward deltas, so scrubbing and rewinding can't inflate time.
        if (delta > 0 && delta < 4) watchAccumRef.current += delta;
      }
      watchLastPosRef.current = posMs;
      if (watchAccumRef.current >= 4) flushWatch();
    },
    [flushWatch, onViewProgress],
  );

  // ── Seek synchronisation helpers ──────────────────────────────────────────
  // Mark a requested seek target so the status handler can distinguish a stale
  // pre-seek tick from the confirmed post-seek tick.
  const requestSeek = useCallback(
    (
      ref: React.MutableRefObject<{ target: number; at: number; retries: number } | null>,
      target: number,
    ) => {
      ref.current = { target, at: Date.now(), retries: 0 };
    },
    [],
  );

  // Given the engine's reported position, decide what to show. Returns the
  // reported position normally, or null while a seek is still in flight (the
  // caller then keeps the optimistic target instead of snapping back).
  const reconcileSeek = useCallback(
    (
      ref: React.MutableRefObject<{ target: number; at: number; retries: number } | null>,
      reportedPos: number,
      playerRef: React.RefObject<Video | null>,
    ): number | null => {
      const pending = ref.current;
      if (!pending) return reportedPos;
      const elapsed = Date.now() - pending.at;
      const confirmed =
        elapsed >= SEEK_SETTLE_MS &&
        Math.abs(reportedPos - pending.target) <= SEEK_CONFIRM_TOLERANCE_MS;
      if (confirmed) {
        ref.current = null;
        return reportedPos;
      }
      if (elapsed > SEEK_TIMEOUT_MS) {
        // The engine still hasn't landed near the target — the native seek was
        // silently dropped (e.g. issued while still buffering) or the source
        // reset to 0. Re-assert the seek a bounded number of times instead of
        // accepting the stale/zero position, so playback really begins at the
        // requested timestamp. Once retries are exhausted we stop fighting the
        // engine and trust whatever it reports.
        if (pending.retries < SEEK_MAX_RETRIES) {
          pending.retries += 1;
          pending.at = Date.now();
          playerRef.current?.setPositionAsync(pending.target, SEEK_TOLERANCES).catch(() => {});
          return null; // still in flight — keep holding the optimistic target
        }
        ref.current = null;
        return reportedPos;
      }
      return null; // seek in flight — hold the optimistic target
    },
    [],
  );

  // Flush any pending watch time when the player unmounts.
  useEffect(() => {
    return () => flushWatch();
  }, [flushWatch]);

  // ── Auto-play (standard) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!autoPlay || isShorts || !selectedUrl) return;
    const t = setTimeout(() => videoRef.current?.playAsync().catch(() => {}), 100);
    return () => clearTimeout(t);
  }, [videoId, selectedUrl]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Fall back to the duration state when the ref is unseeded (first tick not
    // yet arrived) so a double-tap seek can never clamp to 0 / "jump back".
    const d = durationRef.current > 0 ? durationRef.current : durationMs;
    const target = Math.max(0, Math.min(d, positionRef.current + deltaS * 1000));
    ref.current?.setPositionAsync(target, SEEK_TOLERANCES).catch(() => {});
    positionRef.current = target;
    if (d > 0) setProgress(target / d);
    setPositionMs(target);
    requestSeek(pendingSeekRef, target);
  }, [durationMs, requestSeek]);

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
      fsVideoRef.current?.setPositionAsync(target, SEEK_TOLERANCES).catch(() => {});
      fsPositionRef.current = target;
      setFsPositionMs(target);
      requestSeek(fsPendingSeekRef, target);
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

      // Quality switch: once the new variant has loaded, restore the position
      // and playback state captured when the user switched — never restart
      // the video from zero.
      if (pendingResumeRef.current && pendingResumeRef.current.target === 'inline') {
        const resume = pendingResumeRef.current;
        pendingResumeRef.current = null;
        if (resume.position > 0) {
          videoRef.current?.setPositionAsync(resume.position, SEEK_TOLERANCES).catch(() => {});
        }
        if (resume.shouldPlay) {
          setTimeout(() => videoRef.current?.playAsync().catch(() => {}), 80);
        }
      }

      const playing = status.isPlaying ?? false;
      isPlayingRef.current = playing;
      setIsPlaying(playing);

      // True only on the single status tick where playback first begins.
      const justStartedPlaying = playing && !hasPlayedRef.current;

      // Crossfade: on first play, fade poster out and video in
      if (justStartedPlaying) {
        hasPlayedRef.current = true;
        // Trigger background disk caching so subsequent loops and rewinds are instant
        if (selectedUrl) {
          downloadAndCacheVideo(selectedUrl, cacheKey).catch(() => {});
        }
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

      // Track position / duration. Only overwrite a known duration with a real
      // one (a transient `durationMillis: 0` tick while buffering must not wipe
      // the duration we already have). Reconcile position against any in-flight
      // seek so stale pre-seek ticks can't snap the bar back to 0 / the old spot.
      const dur = status.durationMillis ?? 0;
      const pos = status.positionMillis ?? 0;
      if (dur > 0) {
        durationRef.current = dur;
        setDurationMs(dur);
      }
      const shown = reconcileSeek(pendingSeekRef, pos, videoRef);
      if (shown !== null) {
        positionRef.current = shown;
        if (dur > 0) setProgress(shown / dur);
        setPositionMs(shown);
      }

      // Watch-time accumulation (runs for shorts and long-form alike).
      // While the native Slider is dragged its value is pinned to dragMs, so
      // these ticks can't snap the thumb back mid-drag.
      accumulateWatch(pos, playing, false);

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
    [isPremium, isShorts, onPremiumRequired, selectedUrl, cacheKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Playback status (fullscreen) ───────────────────────────────────────────
  const onFsStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    // Quality switch while in fullscreen: restore position/playback here.
    if (pendingResumeRef.current && pendingResumeRef.current.target === 'fs') {
      const resume = pendingResumeRef.current;
      pendingResumeRef.current = null;
      if (resume.position > 0) {
        fsVideoRef.current?.setPositionAsync(resume.position, SEEK_TOLERANCES).catch(() => {});
      }
      if (resume.shouldPlay) {
        setTimeout(() => fsVideoRef.current?.playAsync().catch(() => {}), 80);
      }
    }

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
    if (dur > 0) {
      fsDurationRef.current = dur;
      setFsDurationMs(dur);
    }
    const shown = reconcileSeek(fsPendingSeekRef, pos, fsVideoRef);
    if (shown !== null) {
      fsPositionRef.current = shown;
      setFsPositionMs(shown);
    }

    // Share the accumulator with the inline player — fullscreen time counts.
    accumulateWatch(pos, playing, false);
  }, [accumulateWatch, reconcileSeek]);

  // ── Aspect ratio from video ────────────────────────────────────────────────
  const onReadyForDisplay = useCallback(
    (e: { naturalSize?: { width: number; height: number } }) => {
      const w = e.naturalSize?.width;
      const h = e.naturalSize?.height;
      if (w && h && h > 0 && !initialAspectRatio) setAspectRatio(w / h);
      // Duration fallback: expo-av can report durationMillis=0 in the earliest
      // status ticks (or emit no tick at all on some devices). Once the first
      // frame is displayed the duration is authoritative via getStatusAsync —
      // fetch it so the timer/seek range are never stuck at 00:00 for a video
      // that is clearly playing.
      videoRef.current
        ?.getStatusAsync()
        .then((s) => {
          if (s.isLoaded && s.durationMillis && s.durationMillis > 0) {
            durationRef.current = s.durationMillis;
            setDurationMs(s.durationMillis);
          }
        })
        .catch(() => {});
    },
    [initialAspectRatio],
  );

  // ── Seek (native Slider) ──────────────────────────────────────────────────
  // The platform Slider drives all dragging/tapping (reliable native
  // behaviour); these helpers just land the resulting position on the player
  // and keep the time/progress state in sync. There is no custom drag
  // geometry to conflict with playback ticks.
  const seekTo = useCallback((ms: number) => {
    // Clamp against the best-known duration. The duration ref can be unseeded
    // for a brief moment before the engine reports its first loaded tick, and
    // Math.min(0, ms) would land the seek at 0 — the "jumps back to the
    // beginning" bug. Fall back to the duration state when the ref is 0.
    const d = durationRef.current > 0 ? durationRef.current : durationMs;
    const t = Math.max(0, Math.min(d, ms));
    positionRef.current = t;
    if (d > 0) setProgress(t / d);
    setPositionMs(t);
    requestSeek(pendingSeekRef, t);
    videoRef.current?.setPositionAsync(t, SEEK_TOLERANCES).catch(() => {});
    showControls();
  }, [durationMs, showControls, requestSeek]);

  const fsSeekTo = useCallback((ms: number) => {
    // Same guard as seekTo: on fullscreen open the fs duration REF is not
    // seeded until the fs engine's first loaded tick (which can take seconds
    // for large/moov-at-end files), so a drag in that window used to clamp to
    // 0 and "seek back to the beginning". Fall back to the duration state.
    const d = fsDurationRef.current > 0 ? fsDurationRef.current : fsDurationMs;
    const t = Math.max(0, Math.min(d, ms));
    fsPositionRef.current = t;
    setFsPositionMs(t);
    requestSeek(fsPendingSeekRef, t);
    fsVideoRef.current?.setPositionAsync(t, SEEK_TOLERANCES).catch(() => {});
    showFsControls();
  }, [fsDurationMs, showFsControls, requestSeek]);

  // ── Fullscreen open / close ───────────────────────────────────────────────
  const openFullscreen = useCallback(() => {
    videoRef.current?.pauseAsync().catch(() => {});
    fsHasPlayedRef.current = false;
    fsPrevBuffRef.current  = true;
    fsEndedRef.current     = false;
    setFsBuffering(true);
    setFsVideoEnded(false);
    // Seed the fullscreen refs from the inline player's known state so seeks
    // never clamp against an unseeded (0) duration right after opening.
    fsDurationRef.current = durationMs;
    fsPositionRef.current = positionMs;
    setFsDurationMs(durationMs);
    setFsPositionMs(positionMs);
    // The fullscreen engine is a fresh Video instance that starts at 0. Seed a
    // pending seek so its 0-position status ticks can't snap the bar back to
    // the beginning while the restore seek (issued on open) is still landing.
    fsPendingSeekRef.current = { target: positionMs, at: Date.now(), retries: 0 };
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
    fsPendingSeekRef.current = null;
    setFsVisible(false);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    setTimeout(() => {
      videoRef.current?.setPositionAsync(pos, SEEK_TOLERANCES).catch(() => {});
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
      {playableUri && !error ? (
        <Animated.View style={[StyleSheet.absoluteFill, videoFadeStyle]}>
          <Video
            ref={videoRef}
            source={{ uri: playableUri }}
            style={StyleSheet.absoluteFill}
            // Adaptive media: always CONTAIN so the full frame stays visible
            // (no cropping); unused space shows the player's black background.
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isShorts ? Boolean(active) : (autoPlay || Boolean(active))}
            isLooping={isShorts ? true : isLooping}
            useNativeControls={false}
            progressUpdateIntervalMillis={250}
            posterSource={posterUri ? { uri: posterUri } : undefined}
            usePoster={Boolean(posterUri)}
            posterStyle={{ resizeMode: 'contain' }}
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
            style={[styles.iconCircle, styles.shortsIconNoBg]}
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
          <>
            {/* Quality menu backdrop — closes the picker when tapping elsewhere */}
            {qualityMenuOpen && showQualityPicker ? (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setQualityMenuOpen(false)}
                accessibilityLabel="Close quality menu"
              />
            ) : null}
            <Animated.View style={[styles.bottomBarWrap, bottomBarStyle]} pointerEvents="box-none">
              <View style={styles.bottomBarInner}>
                <SeekBar
                  positionMs={positionMs}
                  durationMs={durationMs}
                  onSeek={seekTo}
                  onDragStart={showControls}
                  onFullscreen={openFullscreen}
                  showFullscreen={!fillContainer}
                  hasBackground={fillContainer}
                  qualityOptions={showQualityPicker ? qualityOptions : []}
                  currentQualityLabel={currentQualityLabel}
                  qualityMenuOpen={qualityMenuOpen}
                  onToggleQualityMenu={() => setQualityMenuOpen((o) => !o)}
                  onQualityChange={handleQualityChange}
                />
                {/* Quality picker popup — opens upward from the pill */}
                {qualityMenuOpen && showQualityPicker ? (
                  <View style={styles.qualityPopup}>
                    {qualityOptions.map((opt) => {
                      const active = opt.label === currentQualityLabel;
                      return (
                        <Pressable
                          key={opt.label}
                          style={styles.qualityOption}
                          onPress={() => handleQualityChange(opt.label)}
                          accessibilityRole="button"
                          accessibilityLabel={`${opt.label} quality`}
                        >
                          <Text style={[styles.qualityOptionLabel, active && styles.qualityOptionActive]}>
                            {opt.label}
                          </Text>
                          {active ? <Check size={13} color={T.ACCENT} weight="bold" /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </Animated.View>
          </>
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
          uri={playableUri ?? uri}
          posterUri={posterUri}
          isLooping={isLooping}
          startPositionMs={positionRef.current}
          videoRef={fsVideoRef}
          isPlaying={fsPlaying}
          isBuffering={fsBuffering}
          videoEnded={fsVideoEnded}
          positionMs={fsPositionMs}
          durationMs={fsDurationMs}
          onStatus={onFsStatus}
          onClose={closeFullscreen}
          onPress={handleFsPress}
          onPressIn={showFsControls}
          onTogglePlay={toggleFsPlayback}
          ctrlStyle={fsCtrlStyle}
          onSeekTo={fsSeekTo}
          onDragStart={showFsControls}
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
          qualityOptions={showQualityPicker ? qualityOptions : []}
          currentQualityLabel={currentQualityLabel}
          qualityMenuOpen={qualityMenuOpen}
          onToggleQualityMenu={() => setQualityMenuOpen((o) => !o)}
          onQualityChange={handleQualityChange}
        />
      ) : null}
    </View>
  );
}

// ─── SeekBar component ────────────────────────────────────────────────────────

interface SeekBarProps {
  positionMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  /** Called when the user starts dragging — keeps the controls visible. */
  onDragStart?: () => void;
  onFullscreen?: () => void;
  showFullscreen?: boolean;
  onExitFullscreen?: () => void;
  hasBackground?: boolean;
  // ── Quality selector (only passed when multiple variants exist) ──
  qualityOptions?: Array<{ label: string; url: string; height?: number | null }>;
  currentQualityLabel?: string;
  qualityMenuOpen?: boolean;
  onToggleQualityMenu?: () => void;
  onQualityChange?: (label: string) => void;
}

/**
 * Native seek tracker — the platform Slider (@react-native-community/slider)
 * handles ALL dragging/tapping with its own reliable native behaviour. The
 * only customisation is appearance: progress + thumb in the pink brand accent.
 * While dragging, the Slider value is pinned to local drag state so the
 * player's playback ticks can't snap the thumb back; on release the seek is
 * applied and live position tracking resumes.
 */
function SeekBar({
  positionMs,
  durationMs,
  onSeek,
  onDragStart,
  onFullscreen,
  showFullscreen = false,
  onExitFullscreen,
  hasBackground = true,
  qualityOptions = [],
  currentQualityLabel = 'Auto',
  qualityMenuOpen = false,
  onToggleQualityMenu,
  onQualityChange,
}: SeekBarProps) {
  const [dragging, setDragging] = useState(false);
  const [dragMs,   setDragMs]   = useState<number | null>(null);
  const value = dragging && dragMs !== null ? dragMs : positionMs;
  return (
    <View style={[sb.bar, !hasBackground && sb.barNoBackground]}>
      <Text style={sb.time}>{fmtTime(value)}</Text>
      <Slider
        style={sb.slider}
        minimumValue={0}
        maximumValue={Math.max(1, durationMs)}
        value={value}
        disabled={durationMs <= 0}
        onSlidingStart={() => { onDragStart?.(); setDragging(true); setDragMs(positionMs); }}
        onValueChange={(v) => setDragMs(v)}
        onSlidingComplete={(v) => {
          setDragging(false);
          setDragMs(null);
          onSeek(v);
        }}
        minimumTrackTintColor={T.ACCENT}
        maximumTrackTintColor="rgba(255,255,255,0.28)"
        thumbTintColor={T.ACCENT}
        accessibilityLabel="Video seek bar"
      />
      <Text style={sb.time}>{fmtTime(durationMs)}</Text>
      {/* Quality selector pill — only rendered when the server offered more
          than one playable variant (qualityOptions is [] otherwise). */}
      {qualityOptions.length > 0 ? (
        <Pressable
          style={[sb.qualityPill, qualityMenuOpen && sb.qualityPillActive]}
          onPress={onToggleQualityMenu}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Video quality"
        >
          <Text style={sb.qualityPillLabel}>{currentQualityLabel}</Text>
          <CaretDown size={10} color="rgba(255,255,255,0.85)" weight="bold" />
        </Pressable>
      ) : null}
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
  slider: {
    flex: 1,
    height: 36,
    // Slight negative margin lets the thumb reach the very ends of the track.
    marginHorizontal: -6,
  },
  fsBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  qualityPillActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  qualityPillLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: T.FONT.semibold,
    fontSize: 10,
    letterSpacing: 0.2,
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
  positionMs: number;
  durationMs: number;
  onStatus: (s: AVPlaybackStatus) => void;
  onClose: () => void;
  onPress: (tapRatio: number) => void;
  onPressIn: () => void;
  onTogglePlay: () => void;
  ctrlStyle: object;
  onSeekTo: (ms: number) => void;
  onDragStart: () => void;
  /** Called when orientation picker opens (true) or closes (false). */
  onOrientPickerChange: (open: boolean) => void;
  // ── Quality selector ──
  qualityOptions: Array<{ label: string; url: string; height?: number | null }>;
  currentQualityLabel: string;
  qualityMenuOpen: boolean;
  onToggleQualityMenu: () => void;
  onQualityChange: (label: string) => void;
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
  positionMs,
  durationMs,
  onStatus,
  onClose,
  onPress,
  onPressIn,
  onTogglePlay,
  ctrlStyle,
  onSeekTo,
  onDragStart,
  onOrientPickerChange,
  qualityOptions,
  currentQualityLabel,
  qualityMenuOpen,
  onToggleQualityMenu,
  onQualityChange,
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
        videoRef.current?.setPositionAsync(startPositionMs, SEEK_TOLERANCES).catch(() => {});
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
            // Match the inline player: without a progress interval the engine
            // only emits discrete load/play/pause events, so the seek bar never
            // advances while the fullscreen video is playing.
            progressUpdateIntervalMillis={250}
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
            {/* Quality menu backdrop — closes the picker when tapping elsewhere */}
            {qualityMenuOpen && qualityOptions.length > 0 ? (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onToggleQualityMenu}
                accessibilityLabel="Close quality menu"
              />
            ) : null}
            <View style={fs.bottomInner}>
              <SeekBar
                positionMs={positionMs}
                durationMs={durationMs}
                onSeek={onSeekTo}
                onDragStart={onDragStart}
                onExitFullscreen={onClose}
                qualityOptions={qualityOptions}
                currentQualityLabel={currentQualityLabel}
                qualityMenuOpen={qualityMenuOpen}
                onToggleQualityMenu={onToggleQualityMenu}
                onQualityChange={onQualityChange}
              />
              {/* Quality picker popup — opens upward from the pill */}
              {qualityMenuOpen && qualityOptions.length > 0 ? (
                <View style={styles.qualityPopup}>
                  {qualityOptions.map((opt) => {
                    const active = opt.label === currentQualityLabel;
                    return (
                      <Pressable
                        key={opt.label}
                        style={styles.qualityOption}
                        onPress={() => onQualityChange(opt.label)}
                        accessibilityRole="button"
                        accessibilityLabel={`${opt.label} quality`}
                      >
                        <Text style={[styles.qualityOptionLabel, active && styles.qualityOptionActive]}>
                          {opt.label}
                        </Text>
                        {active ? <Check size={13} color={T.ACCENT} weight="bold" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
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
  bottomInner: {
    position: 'relative',
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
  // Shorts play/pause sits directly on the video (no glass disc), matching the
  // side action icons. Standard mode keeps its subtle disc for legibility.
  shortsIconNoBg: {
    backgroundColor: 'transparent',
  },

  // Bottom bar wrapper
  bottomBarWrap: {
    position: 'absolute',
    left: 10, right: 10, bottom: 10,
    zIndex: 10,
  },
  bottomBarInner: {
    position: 'relative',
  },

  // Quality picker popup (opens upward from the bottom bar pill)
  qualityPopup: {
    position: 'absolute',
    bottom: 48,
    right: 6,
    zIndex: 30,
    minWidth: 116,
    backgroundColor: '#1C1C22',
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  qualityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    minHeight: 36,
  },
  qualityOptionLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: T.FONT.medium,
    fontSize: 12,
  },
  qualityOptionActive: {
    color: T.ACCENT,
    fontFamily: T.FONT.semibold,
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
