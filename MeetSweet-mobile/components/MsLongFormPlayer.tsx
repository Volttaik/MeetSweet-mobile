/**
 * MsLongFormPlayer — the normal / long-form video player.
 *
 * Engine: `react-native-video` v6 (`Video` + `VideoRef`) — the native
 * ExoPlayer / AVPlayer underneath does all decoding, buffering and seeking.
 * UI: the existing MeetSweet experience (auto-hiding controls, animated bottom
 * seek bar, centre play/pause, double-tap ±10s seek, quality pill, custom
 * fullscreen Modal) — kept exactly as-is, only the playback engine changed.
 *
 * Playback-time architecture (the part that matters for seek correctness):
 *   - The native player is the ONLY authority on position. The React UI never
 *     writes a position back into the player except for an explicit user seek
 *     (`videoRef.current.seek(target)` — the native seek).
 *   - `onProgress` reports the player's REAL currentTime; the UI mirrors that
 *     value and nothing else.
 *   - While a seek is in flight the UI holds the requested target (so a stale
 *     pre-seek progress tick can't snap the bar back), then adopts the
 *     engine's reported position via `onSeek` / the next confirmed
 *     `onProgress`. There is no custom playback state machine and no timer
 *     loop, so stale React state can never overwrite the native position.
 *   - One single `<Video>` instance exists at any moment (inline, or inside
 *     the fullscreen Modal) — the native player is never duplicated and there
 *     is exactly one source of truth. Entering/leaving fullscreen (and
 *     switching quality) remounts that one instance and restores the exact
 *     position with a native seek on load, so playback never resets to 0.
 *
 * The Shorts player is intentionally untouched — it keeps using `MsVideoPlayer`
 * (expo-av) via `MsShortsPlayer`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Video, {
  type OnBufferData,
  type OnLoadData,
  type OnProgressData,
  type OnSeekData,
  type OnVideoErrorData,
  type SelectedVideoTrack,
  SelectedVideoTrackType,
  type VideoRef,
} from 'react-native-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  ArrowCounterClockwise,
  ArrowsIn,
  ArrowsOut,
  CaretDown,
  Check,
  Pause,
  Play,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsShimmer } from '@/components/MsShimmer';
import { PressScale } from '@/components/motion/PressScale';
import { FlyingHeart, useHeartBurst } from '@/components/motion/FlyingHeart';
import { T } from '@/constants/theme';
import { MOTION } from '@/constants/motion';
import type { MediaQuality } from '@/services/posts';
import { getCachedVideoFile, downloadAndCacheVideo } from '@/services/video-cache';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  videoId: string;
  uri: string | null;
  posterUri?: string | null;
  /** Server-authoritative playable quality variants. */
  qualities?: MediaQuality[];
  autoPlay?: boolean;
  isPremium?: boolean;
  onPremiumRequired?: () => void;
  /** Eliminate initial layout flash by passing the known aspect ratio. */
  initialAspectRatio?: number;
  /** When true the player fills its parent (flex:1) instead of sizing by aspect ratio. */
  fillContainer?: boolean;
  /**
   * When false, playback is immediately paused (e.g. screen loses focus).
   * Returning to true does NOT auto-resume — the user must press Play.
   */
  active?: boolean;
  /** Called with ADDITIONAL seconds watched since the last report (deltas). */
  onViewProgress?: (seconds: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
  return `${m}:${String(sc).padStart(2, '0')}`;
}

const SEEK_STEP_SECONDS = 10;
const DOUBLE_TAP_MS = 260;
const CONTROLS_HIDE_MS = 2500;
// How long a requested seek may stay "in flight" before we trust the engine's
// position again (some players never emit onSeek, so onProgress must take
// over). A few hundred ms of keyframe drift is normal for MP4 seeks.
const SEEK_CONFIRM_WINDOW_MS = 1500;
// Delay before re-issuing the restore seek on load (lets the player finish
// preparing so the native seek reliably lands).
const RESTORE_SEEK_DELAY_MS = 100;

// ─── Component ────────────────────────────────────────────────────────────────

export function MsLongFormPlayer({
  videoId,
  uri,
  posterUri,
  qualities,
  autoPlay = false,
  isPremium = false,
  onPremiumRequired,
  initialAspectRatio,
  fillContainer = false,
  active,
  onViewProgress,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { hearts, spawnHeart } = useHeartBurst();

  // ── Source resolution (local disk cache → seekable file) ───────────────────
  // Resolve the cache BEFORE handing a source to the player and never swap the
  // source mid-playback — a source swap reloads the player and resets it to 0,
  // which is the root cause of "seek jumps back to the beginning". A complete
  // local file is always seekable, whereas a streamed remote URL can only play
  // forward if the CDN doesn't support HTTP Range requests.
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const resolvedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uri) {
      resolvedSessionRef.current = null;
      setResolvedUri(null);
      return;
    }
    const sessionKey = `${videoId}::${uri}`;
    if (resolvedSessionRef.current === sessionKey) return; // already resolved this session
    let cancelled = false;
    getCachedVideoFile(uri, videoId).then((cachedPath) => {
      if (cancelled) return;
      resolvedSessionRef.current = sessionKey;
      const next = cachedPath ?? uri;
      setResolvedUri(next);
      if (!cachedPath) {
        // Stream from remote now; cache in the background so the NEXT session
        // (and rewinds) play from a seekable local file.
        downloadAndCacheVideo(uri, videoId).catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uri, videoId]);

  // The exact source handed to the player. Starts as the resolved (cached or
  // remote) URL; a quality switch replaces it and restores position on load.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    setSourceUrl(resolvedUri);
    // A fresh video/source always starts on Auto (no forced HLS rendition).
    setVideoTrack(undefined);
  }, [resolvedUri, videoId]);

  // ── Reactive playback state (native events → React state, mirror only) ────
  const [paused, setPaused] = useState(!autoPlay);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [ended, setEnded] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);
  const [fsVisible, setFsVisible] = useState(false);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [selectedQualityLabel, setSelectedQualityLabel] = useState('Auto');
  // HLS rendition selection (react-native-video `selectedVideoTrack`). When the
  // server offers multi-variant HLS (same manifest URL, distinct `index`), a
  // quality choice picks the ACTUAL rendition — no source reload, no restart.
  const [videoTrack, setVideoTrack] = useState<SelectedVideoTrack | undefined>(undefined);

  // ── Refs (native player + end-of-video + watch time + premium + gestures) ──
  const videoRef = useRef<VideoRef | null>(null);
  const pausedRef = useRef(paused);
  const positionRef = useRef(0);
  const endedRef = useRef(false);
  // Holds the target of a seek requested but not yet confirmed by the engine.
  // While set, stale onProgress positions must NOT overwrite the UI (this is
  // what previously "fought" the seek back to 0).
  const pendingSeekRef = useRef<{ target: number; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  // Position to restore on the NEXT onLoad — set on fullscreen enter/exit and
  // quality switches (the one Video remounts; we native-seek back to it).
  const restorePositionRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const premiumFiredRef = useRef(false);
  const watchAccumRef = useRef(0);
  const watchLastPosRef = useRef<number | null>(null);
  const lastTapRef = useRef({ time: 0, x: 0 });
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animated values (controls auto-hide, bottom bar slide, icon pulse, seek flashes) ──
  const ctrlOpacity = useSharedValue(1);
  const ctrlStyle = useAnimatedStyle(() => ({ opacity: ctrlOpacity.value }));
  const bottomBarStyle = useAnimatedStyle(() => ({
    opacity: ctrlOpacity.value,
    transform: [{ translateY: (1 - ctrlOpacity.value) * 14 }],
  }));
  const fsCtrlOpacity = useSharedValue(1);
  const fsCtrlStyle = useAnimatedStyle(() => ({ opacity: fsCtrlOpacity.value }));
  const fsBottomBarStyle = useAnimatedStyle(() => ({
    opacity: fsCtrlOpacity.value,
    transform: [{ translateY: (1 - fsCtrlOpacity.value) * 14 }],
  }));
  const iconScale = useSharedValue(1);
  const stdIconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));
  const seekLeftOpacity = useSharedValue(0);
  const seekRightOpacity = useSharedValue(0);
  const seekLeftX = useSharedValue(0);
  const seekRightX = useSharedValue(0);
  const seekLeftStyle = useAnimatedStyle(() => ({
    opacity: seekLeftOpacity.value,
    transform: [{ translateX: seekLeftX.value }],
  }));
  const seekRightStyle = useAnimatedStyle(() => ({
    opacity: seekRightOpacity.value,
    transform: [{ translateX: seekRightX.value }],
  }));

  // ── Quality options (server-authoritative only) ────────────────────────────
  const qualityOptions = useMemo(() => {
    if (!qualities || qualities.length === 0) return [];
    const list = qualities.some((q) => q.label === 'Auto')
      ? qualities
      : [{ label: 'Auto', url: qualities[0].url }, ...qualities];
    return list.filter((q) => q && typeof q.url === 'string' && q.url);
  }, [qualities]);
  const showQualityPicker = qualityOptions.length > 1;

  // ── Keep the paused mirror in sync ─────────────────────────────────────────
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    positionRef.current = positionSec;
  }, [positionSec]);

  // ── Native player events ───────────────────────────────────────────────────
  // onLoad: authoritative duration + any pending restore seek (fullscreen /
  // quality switch). Seeking here never happens for a fresh source (restore is
  // null), so a normal load starts exactly where it should.
  const handleLoad = useCallback(({ duration }: OnLoadData) => {
    if (duration > 0) setDurationSec(duration);
    setBuffering(false);
    const restore = restorePositionRef.current;
    if (restore != null && restore > 0.5) {
      restorePositionRef.current = null;
      const target = duration > 0 ? Math.min(restore, duration) : restore;
      // Hold the target until the restore seek lands so early onProgress ticks
      // (which can report the pre-seek position) can't flash the bar at 0.
      if (pendingSeekRef.current?.timer) clearTimeout(pendingSeekRef.current.timer);
      pendingSeekRef.current = {
        target,
        timer: setTimeout(() => {
          pendingSeekRef.current = null;
        }, SEEK_CONFIRM_WINDOW_MS),
      };
      setPositionSec(target);
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = setTimeout(() => {
        restoreTimerRef.current = null;
        videoRef.current?.seek(target);
      }, RESTORE_SEEK_DELAY_MS);
    }
  }, []);

  const handleLoadStart = useCallback(() => {
    setBuffering(true);
    setError(false);
  }, []);

  // onProgress: the ONLY place the UI position is updated during playback. It
  // reads the engine's real currentTime and mirrors it — it never writes back.
  const handleProgress = useCallback(({ currentTime }: OnProgressData) => {
    const pending = pendingSeekRef.current;
    if (pending) {
      // A seek is in flight. Only accept the engine's reported position once it
      // has actually landed near the target; otherwise keep showing the target
      // so a stale 0 / old position can't snap the bar (or the player) back.
      if (Math.abs(currentTime - pending.target) <= 0.6) {
        if (pending.timer) clearTimeout(pending.timer);
        pendingSeekRef.current = null;
        setPositionSec(currentTime);
      } else {
        setPositionSec(pending.target);
        return;
      }
    } else {
      setPositionSec(currentTime);
    }

    // Watch-time accumulation (forward deltas only, flush every ~4s).
    if (onViewProgress && !pausedRef.current) {
      const last = watchLastPosRef.current;
      if (last !== null) {
        const delta = currentTime - last;
        if (delta > 0 && delta < 4) watchAccumRef.current += delta;
      }
      watchLastPosRef.current = currentTime;
      if (watchAccumRef.current >= 4) {
        const seconds = watchAccumRef.current;
        watchAccumRef.current = 0;
        onViewProgress(seconds);
      }
    } else {
      watchLastPosRef.current = null;
    }

    // Premium gate at 3 s — pause once and ask the host to show the paywall.
    if (isPremium && !premiumFiredRef.current && currentTime >= 3) {
      premiumFiredRef.current = true;
      setPaused(true);
      onPremiumRequired?.();
    }
  }, [isPremium, onViewProgress]);

  // onSeek: the engine confirms the seek landed at a real position — adopt it.
  const handleSeek = useCallback(({ currentTime }: OnSeekData) => {
    if (pendingSeekRef.current?.timer) clearTimeout(pendingSeekRef.current.timer);
    pendingSeekRef.current = null;
    if (currentTime > 0) setPositionSec(currentTime);
  }, []);

  // onBuffer: native buffering state (no position touch — the player stays
  // exactly where it was and resumes there once buffering completes).
  const handleBuffer = useCallback(({ isBuffering }: OnBufferData) => {
    setBuffering(isBuffering);
  }, []);

  // onEnd: video finished — flip to the replay state and flush watch time.
  const handleEnd = useCallback(() => {
    endedRef.current = true;
    setEnded(true);
    setPaused(true);
    if (onViewProgress && watchAccumRef.current > 0) {
      const seconds = watchAccumRef.current;
      watchAccumRef.current = 0;
      onViewProgress(seconds);
    }
  }, [onViewProgress]);

  const handleError = useCallback((_e: OnVideoErrorData) => {
    setBuffering(false);
    setError(true);
  }, []);

  // onReadyForDisplay: first frame rendered — drop the poster.
  const handleReadyForDisplay = useCallback(() => {
    setFirstFrame(true);
  }, []);

  // ── Reset per-source state ─────────────────────────────────────────────────
  useEffect(() => {
    premiumFiredRef.current = false;
    endedRef.current = false;
    pendingSeekRef.current = null;
    restorePositionRef.current = null;
    watchLastPosRef.current = null;
    setEnded(false);
    setPositionSec(0);
    setDurationSec(0);
    setBuffering(true);
    setError(false);
    setFirstFrame(false);
    setPaused(!autoPlay);
    setSelectedQualityLabel('Auto');
    setQualityMenuOpen(false);
  }, [videoId, uri, autoPlay]);

  // ── Pause when the screen loses focus ──────────────────────────────────────
  useEffect(() => {
    if (active === false) setPaused(true);
  }, [active]);

  // ── Flush watch time on pause ──────────────────────────────────────────────
  useEffect(() => {
    if (paused && onViewProgress && watchAccumRef.current > 0) {
      const seconds = watchAccumRef.current;
      watchAccumRef.current = 0;
      onViewProgress(seconds);
    }
  }, [paused, onViewProgress]);

  // ── Initialise controls auto-hide ──────────────────────────────────────────
  useEffect(() => {
    scheduleHide(ctrlOpacity, hideTimerRef);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Unmount cleanup ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      if (pendingSeekRef.current?.timer) clearTimeout(pendingSeekRef.current.timer);
      if (onViewProgress && watchAccumRef.current > 0) {
        const seconds = watchAccumRef.current;
        watchAccumRef.current = 0;
        onViewProgress(seconds);
      }
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onViewProgress]);

  // ── Controls auto-hide helpers ─────────────────────────────────────────────
  const scheduleHide = useCallback(
    (
      opacity: SharedValue<number>,
      timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    ) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        opacity.value = withTiming(0, { duration: MOTION.CONTROL_HIDE, easing: MOTION.EASE_EXIT });
      }, CONTROLS_HIDE_MS);
    },
    [],
  );

  const showControls = useCallback(() => {
    ctrlOpacity.value = withTiming(1, { duration: MOTION.CONTROL_SHOW });
    scheduleHide(ctrlOpacity, hideTimerRef);
  }, [scheduleHide]);

  const showFsControls = useCallback(() => {
    fsCtrlOpacity.value = withTiming(1, { duration: MOTION.CONTROL_SHOW });
    scheduleHide(fsCtrlOpacity, fsHideTimerRef);
  }, [scheduleHide]);

  const pulseIcon = useCallback(() => {
    iconScale.value = withSequence(
      withTiming(0.88, { duration: MOTION.PRESS_DOWN, easing: MOTION.EASE_EXIT }),
      withTiming(1.0, { duration: MOTION.PRESS_UP, easing: MOTION.EASE_ENTER }),
    );
  }, []);

  // ── Seek helpers ───────────────────────────────────────────────────────────
  // Seek to an absolute position using the NATIVE seek. The optimistic update
  // only touches the UI mirror; the engine's real position arrives via onSeek /
  // onProgress and takes over immediately.
  const seekTo = useCallback(
    (seconds: number) => {
      // Clamp into [0, duration] when the length is known — never a negative
      // or past-the-end target.
      const length = durationSec > 0 ? durationSec : 0;
      const clamped = length > 0
        ? Math.min(Math.max(0, seconds), length)
        : Math.max(0, seconds);
      // An explicit user seek supersedes any pending restore seek (fullscreen
      // / quality-switch position restore that is still waiting to land).
      if (restoreTimerRef.current) {
        clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
      if (pendingSeekRef.current?.timer) clearTimeout(pendingSeekRef.current.timer);
      pendingSeekRef.current = {
        target: clamped,
        timer: setTimeout(() => {
          pendingSeekRef.current = null;
        }, SEEK_CONFIRM_WINDOW_MS),
      };
      // UI mirror → requested position immediately.
      setPositionSec(clamped);
      // Native seek — playback starts/resumes from exactly this position.
      videoRef.current?.seek(clamped);
    },
    [durationSec],
  );

  // Relative seek (double-tap ±10s). Uses the UI-mirrored real position.
  const seekBy = useCallback(
    (deltaSeconds: number) => {
      seekTo(positionRef.current + deltaSeconds);
    },
    [seekTo],
  );

  const flashLeft = useCallback(() => {
    seekLeftX.value = 0;
    seekLeftX.value = withTiming(-20, { duration: 800, easing: Easing.out(Easing.quad) });
    seekLeftOpacity.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 380 }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) }),
    );
  }, []);

  const flashRight = useCallback(() => {
    seekRightX.value = 0;
    seekRightX.value = withTiming(20, { duration: 800, easing: Easing.out(Easing.quad) });
    seekRightOpacity.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 380 }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) }),
    );
  }, []);

  // ── Playback toggle (shared by inline + fullscreen) ────────────────────────
  const togglePlayback = useCallback(() => {
    pulseIcon();
    if (endedRef.current) {
      endedRef.current = false;
      setEnded(false);
      // Replay from the start — native seek, then play.
      if (pendingSeekRef.current?.timer) clearTimeout(pendingSeekRef.current.timer);
      pendingSeekRef.current = {
        target: 0,
        timer: setTimeout(() => {
          pendingSeekRef.current = null;
        }, SEEK_CONFIRM_WINDOW_MS),
      };
      setPositionSec(0);
      videoRef.current?.seek(0);
      setPaused(false);
      if (fsVisible) showFsControls();
      else showControls();
      return;
    }
    const wasPlaying = !pausedRef.current;
    setPaused(wasPlaying);
    if (wasPlaying) {
      // Pausing — keep the controls visible so the user can resume.
      if (fsVisible) {
        fsCtrlOpacity.value = withTiming(1, { duration: MOTION.CONTROL_SHOW });
        if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
      } else {
        ctrlOpacity.value = withTiming(1, { duration: MOTION.CONTROL_SHOW });
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      }
    } else {
      // Playing — controls auto-hide shortly.
      if (fsVisible) showFsControls();
      else showControls();
    }
  }, [pulseIcon, showControls, showFsControls, fsVisible]);

  // ── Quality selector (real variant swap + position/playback restore) ───────
  const changeQuality = useCallback(
    (label: string) => {
      setQualityMenuOpen(false);
      if (label === selectedQualityLabel) return;
      const option = qualityOptions.find((o) => o.label === label);
      if (!option?.url) return;

      // HLS rendition within the SAME manifest — select the actual track via
      // the native player (no source swap, playback keeps going uninterrupted).
      if (option.index != null && option.url === sourceUrl) {
        setVideoTrack({ type: SelectedVideoTrackType.INDEX, value: option.index });
        setSelectedQualityLabel(label);
        return;
      }
      if (label === 'Auto' && option.url === sourceUrl) {
        // Back to Auto on the current manifest — clear the forced rendition.
        setVideoTrack(undefined);
        setSelectedQualityLabel(label);
        return;
      }
      // Distinct source (e.g. the MP4 "Original" fallback) — swap the source
      // and restore position/playback on load so switching quality never
      // restarts the video from zero. If the new source is the HLS manifest,
      // re-apply the rendition track; a progressive MP4 clears it.
      restorePositionRef.current = positionRef.current;
      setVideoTrack(
        option.index != null
          ? { type: SelectedVideoTrackType.INDEX, value: option.index }
          : undefined,
      );
      setSelectedQualityLabel(label);
      setSourceUrl(option.url);
    },
    [qualityOptions, selectedQualityLabel, sourceUrl],
  );

  // ── Tap handling (single tap = controls, double tap = ±10s seek) ───────────
  const handlePress = useCallback(
    (tapX: number, tapY: number) => {
      const now = Date.now();
      const last = lastTapRef.current;
      if (now - last.time < DOUBLE_TAP_MS) {
        if (tapTimerRef.current) {
          clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
        }
        lastTapRef.current = { time: 0, x: 0 };
        if (tapX < windowWidth / 2) {
          seekBy(-SEEK_STEP_SECONDS);
          flashLeft();
        } else {
          seekBy(SEEK_STEP_SECONDS);
          flashRight();
          spawnHeart(tapX, tapY); // heart on right double-tap (forward seek = like gesture)
        }
        if (fsVisible) showFsControls();
        else showControls();
        return;
      }
      lastTapRef.current = { time: now, x: tapX };
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        if (fsVisible) showFsControls();
        else showControls();
      }, DOUBLE_TAP_MS);
    },
    [seekBy, flashLeft, flashRight, spawnHeart, showControls, showFsControls, fsVisible, windowWidth],
  );

  // ── Fullscreen open / close (same player — position restored on remount) ──
  const aspectRatio = initialAspectRatio ?? 16 / 9;
  const openFullscreen = useCallback(() => {
    // Capture the real position; the remounted Video seeks back to it on load.
    restorePositionRef.current = positionRef.current;
    setFsVisible(true);
    if (aspectRatio >= 1) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    } else {
      ScreenOrientation.unlockAsync().catch(() => {});
    }
  }, [aspectRatio]);

  const closeFullscreen = useCallback(() => {
    restorePositionRef.current = positionRef.current;
    setFsVisible(false);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const isPlaying = !paused && !ended;

  // The ONE native player. Mounted inline, or inside the fullscreen Modal —
  // never both at the same time.
  const videoView = sourceUrl ? (
    <Video
      ref={videoRef}
      source={{ uri: sourceUrl }}
      selectedVideoTrack={videoTrack}
      paused={paused}
      style={StyleSheet.absoluteFill}
      resizeMode="contain"
      progressUpdateInterval={250}
      playInBackground={false}
      ignoreSilentSwitch="ignore"
      onLoadStart={handleLoadStart}
      onLoad={handleLoad}
      onProgress={handleProgress}
      onSeek={handleSeek}
      onBuffer={handleBuffer}
      onEnd={handleEnd}
      onError={handleError}
      onReadyForDisplay={handleReadyForDisplay}
      accessibilityLabel="Video player"
    />
  ) : null;

  const bufferingOverlay = buffering && !error ? (
    <View style={styles.bufferOverlay} pointerEvents="none">
      <MsShimmer style={StyleSheet.absoluteFill as any} height={4} borderRadius={0} />
    </View>
  ) : null;

  const playPauseIcon = ended ? (
    <ArrowCounterClockwise size={19} color="#fff" weight="bold" />
  ) : isPlaying ? (
    <Pause size={19} color="#fff" weight="fill" />
  ) : (
    <Play size={19} color="#fff" weight="fill" />
  );

  const qualityPopup = showQualityPicker ? (
    <View style={styles.qualityPopup}>
      {qualityOptions.map((opt) => {
        const active = opt.label === selectedQualityLabel;
        return (
          <Pressable
            key={opt.label}
            style={styles.qualityOption}
            onPress={() => changeQuality(opt.label)}
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
  ) : null;

  return (
    <View
      style={[
        fillContainer ? styles.playerFill : styles.player,
        fillContainer ? null : { aspectRatio },
      ]}
    >
      {/* Poster — shown until the first video frame renders. */}
      {posterUri && !firstFrame ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <MsMediaLoader
            uri={posterUri}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibleLabel="Video thumbnail"
          />
        </View>
      ) : null}

      {/* Inline video (unmounted while fullscreen is open so the Modal's Video
          is the only one attached — one native player at all times). */}
      {!fsVisible ? videoView : null}

      {!fsVisible ? bufferingOverlay : null}

      {/* Error state */}
      {!fsVisible && error ? (
        <View style={styles.errorCenter}>
          <Text style={styles.errorTitle}>Video could not load</Text>
        </View>
      ) : null}

      {/* Inline: gesture layer + auto-hiding controls */}
      {!fsVisible && !error ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(e) => handlePress(e.nativeEvent.locationX, e.nativeEvent.locationY)}
            accessibilityRole="button"
            accessibilityLabel="Show controls"
          />
          <Animated.View style={[StyleSheet.absoluteFill, ctrlStyle]} pointerEvents="box-none">
            {/* Centre play / pause / restart */}
            <Animated.View style={[styles.iconWrap, stdIconStyle]} pointerEvents="box-none">
              <PressScale
                style={styles.iconCircle}
                onPress={togglePlayback}
                hitSlop={16}
                accessibilityLabel={ended ? 'Restart' : isPlaying ? 'Pause' : 'Play'}
              >
                {playPauseIcon}
              </PressScale>
            </Animated.View>

            {/* Bottom seek bar */}
            <Animated.View style={[styles.bottomBarWrap, bottomBarStyle]} pointerEvents="box-none">
              <View style={styles.bottomBarInner}>
                {qualityMenuOpen && showQualityPicker ? (
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setQualityMenuOpen(false)}
                    accessibilityLabel="Close quality menu"
                  />
                ) : null}
                <SeekBar
                  positionSec={positionSec}
                  durationSec={durationSec}
                  onSeek={seekTo}
                  onDragStart={showControls}
                  onFullscreen={openFullscreen}
                  showFullscreen={!fillContainer}
                  hasBackground={fillContainer}
                  qualityOptions={showQualityPicker ? qualityOptions : []}
                  currentQualityLabel={selectedQualityLabel}
                  qualityMenuOpen={qualityMenuOpen}
                  onToggleQualityMenu={() => setQualityMenuOpen((o) => !o)}
                  onQualityChange={changeQuality}
                />
                {qualityMenuOpen && showQualityPicker ? qualityPopup : null}
              </View>
            </Animated.View>
          </Animated.View>

          {/* Double-tap seek flashes */}
          <Animated.View style={[styles.seekFlashL, seekLeftStyle]} pointerEvents="none">
            <View style={styles.seekBubble}>
              <Text style={styles.seekArrow}>«</Text>
              <Text style={styles.seekSec}>{SEEK_STEP_SECONDS}s</Text>
            </View>
          </Animated.View>
          <Animated.View style={[styles.seekFlashR, seekRightStyle]} pointerEvents="none">
            <View style={styles.seekBubble}>
              <Text style={styles.seekSec}>{SEEK_STEP_SECONDS}s</Text>
              <Text style={styles.seekArrow}>»</Text>
            </View>
          </Animated.View>

          {/* Flying hearts */}
          {hearts.map((h) => (
            <FlyingHeart key={h.id} x={h.x} y={h.y} />
          ))}
        </>
      ) : null}

      {/* Fullscreen Modal — the same single Video, one at a time. */}
      <Modal
        visible={fsVisible}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        hardwareAccelerated={Platform.OS === 'android'}
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={closeFullscreen}
      >
        <View style={styles.fsRoot}>
          {fsVisible ? videoView : null}
          {fsVisible ? bufferingOverlay : null}

          {fsVisible && !error ? (
            <>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={(e) => handlePress(e.nativeEvent.locationX, e.nativeEvent.locationY)}
              />
              <Animated.View style={[StyleSheet.absoluteFill, fsCtrlStyle]} pointerEvents="box-none">
                {/* Top bar */}
                <View style={[styles.fsTopBar, { paddingTop: Math.max(insets.top + 8, 16) }]} pointerEvents="box-none">
                  <PressScale
                    style={styles.fsCloseBtn}
                    onPress={closeFullscreen}
                    hitSlop={12}
                    accessibilityLabel="Exit fullscreen"
                  >
                    <ArrowsIn size={15} color="rgba(255,255,255,0.9)" />
                  </PressScale>
                </View>

                {/* Centre play / pause / restart */}
                <View style={styles.iconWrap} pointerEvents="box-none">
                  <PressScale
                    style={styles.iconCircle}
                    onPress={togglePlayback}
                    hitSlop={16}
                    accessibilityLabel={ended ? 'Restart' : isPlaying ? 'Pause' : 'Play'}
                  >
                    {playPauseIcon}
                  </PressScale>
                </View>

                {/* Bottom seek bar */}
                <View style={[styles.fsBottomWrap, { paddingBottom: Math.max(8, insets.bottom) }]} pointerEvents="box-none">
                  <Animated.View style={fsBottomBarStyle}>
                    <View style={styles.bottomBarInner}>
                      {qualityMenuOpen && showQualityPicker ? (
                        <Pressable
                          style={StyleSheet.absoluteFill}
                          onPress={() => setQualityMenuOpen(false)}
                          accessibilityLabel="Close quality menu"
                        />
                      ) : null}
                      <SeekBar
                        positionSec={positionSec}
                        durationSec={durationSec}
                        onSeek={seekTo}
                        onDragStart={showFsControls}
                        onExitFullscreen={closeFullscreen}
                        qualityOptions={showQualityPicker ? qualityOptions : []}
                        currentQualityLabel={selectedQualityLabel}
                        qualityMenuOpen={qualityMenuOpen}
                        onToggleQualityMenu={() => setQualityMenuOpen((o) => !o)}
                        onQualityChange={changeQuality}
                      />
                      {qualityMenuOpen && showQualityPicker ? qualityPopup : null}
                    </View>
                  </Animated.View>
                </View>
              </Animated.View>
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

// ─── SeekBar ──────────────────────────────────────────────────────────────────

interface SeekBarProps {
  positionSec: number;
  durationSec: number;
  onSeek: (seconds: number) => void;
  /** Called when the user starts dragging — keeps the controls visible. */
  onDragStart?: () => void;
  onFullscreen?: () => void;
  showFullscreen?: boolean;
  onExitFullscreen?: () => void;
  hasBackground?: boolean;
  qualityOptions?: MediaQuality[];
  currentQualityLabel?: string;
  qualityMenuOpen?: boolean;
  onToggleQualityMenu?: () => void;
  onQualityChange?: (label: string) => void;
}

/**
 * Native seek tracker — the platform Slider handles all dragging/tapping. The
 * value is pinned to local drag state while dragging so the player's own
 * progress ticks can't snap the thumb back; on release the seek lands and live
 * tracking resumes.
 */
function SeekBar({
  positionSec,
  durationSec,
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
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  // The slider operates on a [0..1] fraction. The seek target is always derived
  // from the video length (duration) so there is no unit mismatch between the
  // slider's range and the native player's seconds.
  const fraction = durationSec > 0
    ? (dragging && dragFraction !== null ? dragFraction : positionSec / durationSec)
    : 0;
  const displayedSec = durationSec > 0 ? fraction * durationSec : 0;

  return (
    <View style={[sb.bar, !hasBackground && sb.barNoBackground]}>
      <Text style={sb.time}>{fmtTime(displayedSec)}</Text>
      <Slider
        style={sb.slider}
        minimumValue={0}
        maximumValue={1}
        value={fraction}
        disabled={durationSec <= 0}
        onSlidingStart={() => {
          onDragStart?.();
          setDragging(true);
          setDragFraction(durationSec > 0 ? positionSec / durationSec : 0);
        }}
        onValueChange={(v) => setDragFraction(v)}
        onSlidingComplete={(v) => {
          setDragging(false);
          setDragFraction(null);
          // Convert the [0..1] fraction back to seconds via the video length.
          if (durationSec > 0) onSeek(v * durationSec);
        }}
        minimumTrackTintColor={T.ACCENT}
        maximumTrackTintColor="rgba(255,255,255,0.28)"
        thumbTintColor={T.ACCENT}
        accessibilityLabel="Video seek bar"
      />
      <Text style={sb.time}>{fmtTime(durationSec)}</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  player: {
    width: '100%',
    backgroundColor: '#050506',
    overflow: 'hidden',
    borderRadius: T.RADIUS.xl,
  },
  playerFill: {
    flex: 1,
    backgroundColor: '#050506',
    overflow: 'hidden',
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  errorCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  errorTitle: {
    color: '#fff',
    fontFamily: T.FONT.medium,
    fontSize: 13,
  },
  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    zIndex: 10,
  },
  bottomBarInner: {
    position: 'relative',
  },
  seekFlashL: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    justifyContent: 'center',
    zIndex: 9,
  },
  seekFlashR: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    justifyContent: 'center',
    zIndex: 9,
  },
  seekBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: T.RADIUS.full,
  },
  seekArrow: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 15,
  },
  seekSec: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 13,
  },
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
  fsRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  fsTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 12,
  },
  fsCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsBottomWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    zIndex: 12,
  },
});
