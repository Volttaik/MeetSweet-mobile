/**
 * MsLongFormPlayer — single reusable long-form video controller.
 *
 * Architecture (v2 — polished):
 *   - Outer Pressable IS the interaction surface; child buttons absorb their
 *     own taps so the parent Pressable only fires on empty-space taps.
 *   - Video is mounted ONCE and never remounts during playback.
 *   - Two independent overlay systems:
 *       1. Creator strip  — always visible (its own opacity, never hides).
 *       2. Glass controls — auto-hide overlay (fades in/out).
 *   - fillContainer mode: player fills parent flex container (used in
 *     full-screen video detail).  Default mode: aspect-ratio box.
 *
 * Gesture contract:
 *   - Centre tap (middle third):  toggle play / pause only — no control change.
 *     Brief icon flash gives visual confirmation.
 *   - Edge single-tap (left OR right third): toggle controls visibility.
 *   - Edge double-tap (left third): skip back 10s + rewind indicator flash.
 *   - Edge double-tap (right third): skip forward 10s + forward indicator flash.
 *   - Controls auto-show on mount / play-start, fade after 1.5 s.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import {
  ResizeMode,
  Video,
  VideoFullscreenUpdate,
  type AVPlaybackStatus,
} from 'expo-av';
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  ArrowLeft,
  Bookmark,
  ChatCircle,
  Heart,
  Lock,
  Pause,
  Play,
  ShareNetwork,
  UserPlus,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoThumbnail } from '@/components/MsVideoThumbnail';
import { tapMedium } from '@/lib/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Compact creator info shown over the video. */
export interface LongFormCreator {
  avatarUrl?: string | null;
  name: string;
  username: string;
  onSubscribePress?: () => void;
}

interface Props {
  videoId: string;
  uri: string | null;
  posterUri?: string | null;
  autoPlay?: boolean;
  isPremium?: boolean;
  onPremiumRequired?: () => void;
  /** Eliminate initial layout flash by passing the known aspect ratio. */
  initialAspectRatio?: number;
  /** Back-button callback rendered in the top-left of the controls. */
  onBack?: () => void;
  /**
   * When true the player fills its parent (flex:1) instead of sizing by
   * aspect ratio.  Use for full-screen video-detail screens.
   */
  fillContainer?: boolean;
  /** Show compact creator info overlaid on the video. */
  creator?: LongFormCreator;
  /** Comments-button callback — player pauses first, then calls this. */
  onCommentsPress?: () => void;
  commentCount?: number;
  /** Like button */
  onLike?: () => void;
  isLiked?: boolean;
  likeCount?: number;
  /** Save / bookmark button */
  onSave?: () => void;
  isSaved?: boolean;
  /** Share button */
  onShare?: () => void;
}

const progressKey = (id: string) => `@ms_video_progress:${id}`;

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mins  = Math.floor(total / 60);
  const secs  = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function MsLongFormPlayer({
  videoId,
  uri,
  posterUri,
  autoPlay = false,
  isPremium = false,
  onPremiumRequired,
  initialAspectRatio,
  onBack,
  fillContainer = false,
  creator,
  onCommentsPress,
  commentCount = 0,
  onLike,
  isLiked = false,
  likeCount = 0,
  onSave,
  isSaved = false,
  onShare,
}: Props) {
  const insets       = useSafeAreaInsets();
  const ref          = useRef<Video>(null);
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const premiumFired = useRef(false);
  const positionRef  = useRef(0);

  // Refs kept in sync for use inside stable PanResponder closure
  const trackWidthRef   = useRef(1);
  const trackOriginXRef = useRef(0);
  const durationRef     = useRef(0);
  const isDraggingRef   = useRef(false);
  const hasEndedRef     = useRef(false);

  // Glass progress bar separate refs
  const glassTrackWidthRef   = useRef(1);
  const glassTrackOriginXRef = useRef(0);
  const glassIsDraggingRef   = useRef(false);

  // Double-tap tracking for edge skip gestures
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapSideRef  = useRef<'left' | 'right' | 'centre'>('centre');

  const [isPlaying,     setIsPlaying]     = useState(autoPlay);
  const [isBuffering,   setIsBuffering]   = useState(false);
  const [isReady,       setIsReady]       = useState(false);
  const [position,      setPosition]      = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [error,         setError]         = useState(false);
  const [showControls,  setShowControls]  = useState(true);
  const [savedPosition, setSavedPosition] = useState<number | null>(null);
  const [premiumGated,  setPremiumGated]  = useState(false);
  const [playerWidth,   setPlayerWidth]   = useState(SCREEN_WIDTH);
  const [hasEnded,      setHasEnded]      = useState(false);

  /** Stable aspect ratio — never jump on first onReadyForDisplay callback. */
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio ?? 16 / 9);

  // ── Animated values ──────────────────────────────────────────────────────

  const controlsOpacity = useSharedValue(1);
  const controlsStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));

  // Brief icon flash for centre-tap feedback (play / pause confirmation)
  const flashOpacity = useSharedValue(0);
  const flashStyle   = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));
  const [flashIcon, setFlashIcon] = useState<'play' | 'pause'>('play');

  // Spinner rotation
  const spinAngle = useSharedValue(0);
  useEffect(() => {
    spinAngle.value = withRepeat(
      withTiming(360, { duration: 800, easing: Easing.linear }),
      -1, false,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinAngle.value}deg` }],
  }));

  // Skip indicators — hidden by default, spring in on double-tap
  const skipBackOpacity = useSharedValue(0);
  const skipBackScale   = useSharedValue(0.5);
  const skipFwdOpacity  = useSharedValue(0);
  const skipFwdScale    = useSharedValue(0.5);

  const skipBackStyle = useAnimatedStyle(() => ({
    opacity:   skipBackOpacity.value,
    transform: [{ scale: skipBackScale.value }],
  }));
  const skipFwdStyle = useAnimatedStyle(() => ({
    opacity:   skipFwdOpacity.value,
    transform: [{ scale: skipFwdScale.value }],
  }));

  // ── Auto-hide timer ──────────────────────────────────────────────────────

  const scheduleHide = useCallback((delayMs = 2000) => {
    if (isDraggingRef.current) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      controlsOpacity.value = withSpring(0, { damping: 28, stiffness: 180, mass: 1 });
      setShowControls(false);
    }, delayMs);
  }, [controlsOpacity]);

  const revealControls = useCallback((autoHide = true, delayMs = 3000) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    controlsOpacity.value = withSpring(1, { damping: 20, stiffness: 280, mass: 1 });
    setShowControls(true);
    if (autoHide) scheduleHide(delayMs);
  }, [controlsOpacity, scheduleHide]);

  const hideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    controlsOpacity.value = withSpring(0, { damping: 28, stiffness: 200, mass: 1 });
    setShowControls(false);
  }, [controlsOpacity]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  // Auto-show controls on play-start, fade after 2 s
  useEffect(() => {
    if (isPlaying) revealControls(true, 2000);
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-show on mount
  useEffect(() => {
    revealControls(true, 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore saved progress ───────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(progressKey(videoId))
      .then((v) => { if (active && v) setSavedPosition(Number(v)); })
      .catch(() => {});
    return () => { active = false; };
  }, [videoId]);

  // ── Reset on video change ────────────────────────────────────────────────

  useEffect(() => {
    premiumFired.current   = false;
    hasEndedRef.current    = false;
    setPremiumGated(false);
    setError(false);
    setPosition(0);
    setDuration(0);
    setIsReady(false);
    setHasEnded(false);
    positionRef.current  = 0;
    durationRef.current  = 0;
    if (initialAspectRatio) setAspectRatio(initialAspectRatio);
  }, [videoId, uri, initialAspectRatio]);

  // ── Playback status ──────────────────────────────────────────────────────

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      setIsBuffering(status.isBuffering ?? false);
      setIsPlaying(status.isPlaying);
      const pos = status.positionMillis;
      const dur = status.durationMillis ?? 0;
      if (!isDraggingRef.current && !glassIsDraggingRef.current) {
        setPosition(pos);
        positionRef.current = pos;
      }
      setDuration(dur);
      durationRef.current = dur;
      if (pos > 0 && Math.floor(pos / 5000) !== Math.floor(positionRef.current / 5000)) {
        AsyncStorage.setItem(progressKey(videoId), String(pos)).catch(() => {});
      }
      if (status.didJustFinish) {
        setIsPlaying(false);
        setHasEnded(true);
        hasEndedRef.current = true;
        revealControls(false);
      }
      if (isPremium && !premiumFired.current && pos >= 3000) {
        premiumFired.current = true;
        ref.current?.pauseAsync().catch(() => {});
        setPremiumGated(true);
        onPremiumRequired?.();
      }
    },
    [videoId, isPremium, onPremiumRequired, revealControls],
  );

  const onReadyForDisplay = useCallback(
    (event: { naturalSize?: { width: number; height: number } }) => {
      setIsReady(true);
      const w = event.naturalSize?.width;
      const h = event.naturalSize?.height;
      if (w && h && h > 0 && !initialAspectRatio) setAspectRatio(w / h);
    },
    [initialAspectRatio],
  );

  const onFullscreenUpdate = useCallback(
    ({ fullscreenUpdate }: { fullscreenUpdate: VideoFullscreenUpdate }) => {
      void fullscreenUpdate;
    },
    [],
  );

  // ── Playback controls ────────────────────────────────────────────────────

  const toggle = useCallback(async () => {
    if (!ref.current || premiumGated) return;
    if (hasEndedRef.current) {
      hasEndedRef.current = false;
      setHasEnded(false);
      setPosition(0);
      await ref.current.setPositionAsync(0);
      await ref.current.playAsync();
      revealControls(true, 1500);
      return;
    }
    if (isPlaying) await ref.current.pauseAsync();
    else           await ref.current.playAsync();
  }, [isPlaying, premiumGated, revealControls]);

  const handleReplay = useCallback(async () => {
    if (!ref.current) return;
    hasEndedRef.current = false;
    setHasEnded(false);
    setPosition(0);
    await ref.current.setPositionAsync(0);
    await ref.current.playAsync();
    revealControls(true, 1500);
  }, [revealControls]);

  const seek = useCallback(async (ms: number) => {
    const clamped = Math.max(0, Math.min(durationRef.current || 0, ms));
    setPosition(clamped);
    positionRef.current = clamped;
    await ref.current?.setPositionAsync(clamped);
    revealControls(true, 3000);
  }, [revealControls]);

  // ── Skip indicators ──────────────────────────────────────────────────────

  const showSkipIndicator = useCallback((side: 'left' | 'right') => {
    const opacityAnim = side === 'left' ? skipBackOpacity : skipFwdOpacity;
    const scaleAnim   = side === 'left' ? skipBackScale   : skipFwdScale;
    // Spring pop-in
    scaleAnim.value   = withSpring(1,   { damping: 12, stiffness: 380, mass: 1 });
    opacityAnim.value = withSpring(1,   { damping: 14, stiffness: 320, mass: 1 });
    // Fade out after 1 s
    setTimeout(() => {
      opacityAnim.value = withTiming(0, { duration: 300 });
      scaleAnim.value   = withTiming(0.5, { duration: 300 });
    }, 1000);
  }, [skipBackOpacity, skipBackScale, skipFwdOpacity, skipFwdScale]);

  // ── Draggable progress bar (PanResponder) ────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (evt) => {
        isDraggingRef.current = true;
        trackOriginXRef.current =
          evt.nativeEvent.pageX - evt.nativeEvent.locationX;
        if (hideTimer.current) clearTimeout(hideTimer.current);
        controlsOpacity.value = withTiming(1, { duration: 100 });
        const x  = Math.max(0, Math.min(
          evt.nativeEvent.pageX - trackOriginXRef.current,
          trackWidthRef.current,
        ));
        const ms = (x / Math.max(1, trackWidthRef.current)) * Math.max(0, durationRef.current);
        setPosition(ms);
        positionRef.current = ms;
        ref.current?.setPositionAsync(ms).catch(() => {});
      },
      onPanResponderMove: (evt) => {
        const x  = Math.max(0, Math.min(
          evt.nativeEvent.pageX - trackOriginXRef.current,
          trackWidthRef.current,
        ));
        const ms = (x / Math.max(1, trackWidthRef.current)) * Math.max(0, durationRef.current);
        setPosition(ms);
        positionRef.current = ms;
        ref.current?.setPositionAsync(ms).catch(() => {});
      },
      onPanResponderRelease: (evt) => {
        isDraggingRef.current = false;
        const x  = Math.max(0, Math.min(
          evt.nativeEvent.pageX - trackOriginXRef.current,
          trackWidthRef.current,
        ));
        const ms = (x / Math.max(1, trackWidthRef.current)) * Math.max(0, durationRef.current);
        setPosition(ms);
        positionRef.current = ms;
        ref.current?.setPositionAsync(ms).catch(() => {});
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
          controlsOpacity.value = withTiming(0, { duration: 350 });
          setShowControls(false);
        }, 2000);
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
      },
    })
  ).current; // eslint-disable-line react-hooks/exhaustive-deps

  // ── Glass progress bar PanResponder ─────────────────────────────────────

  const glassPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (evt) => {
        glassIsDraggingRef.current = true;
        glassTrackOriginXRef.current =
          evt.nativeEvent.pageX - evt.nativeEvent.locationX;
        const x  = Math.max(0, Math.min(
          evt.nativeEvent.pageX - glassTrackOriginXRef.current,
          glassTrackWidthRef.current,
        ));
        const ms = (x / Math.max(1, glassTrackWidthRef.current)) * Math.max(0, durationRef.current);
        setPosition(ms);
        positionRef.current = ms;
        ref.current?.setPositionAsync(ms).catch(() => {});
      },
      onPanResponderMove: (evt) => {
        const x  = Math.max(0, Math.min(
          evt.nativeEvent.pageX - glassTrackOriginXRef.current,
          glassTrackWidthRef.current,
        ));
        const ms = (x / Math.max(1, glassTrackWidthRef.current)) * Math.max(0, durationRef.current);
        setPosition(ms);
        positionRef.current = ms;
        ref.current?.setPositionAsync(ms).catch(() => {});
      },
      onPanResponderRelease: (evt) => {
        glassIsDraggingRef.current = false;
        const x  = Math.max(0, Math.min(
          evt.nativeEvent.pageX - glassTrackOriginXRef.current,
          glassTrackWidthRef.current,
        ));
        const ms = (x / Math.max(1, glassTrackWidthRef.current)) * Math.max(0, durationRef.current);
        setPosition(ms);
        positionRef.current = ms;
        ref.current?.setPositionAsync(ms).catch(() => {});
      },
      onPanResponderTerminate: () => {
        glassIsDraggingRef.current = false;
      },
    })
  ).current; // eslint-disable-line react-hooks/exhaustive-deps

  // ── Comments ─────────────────────────────────────────────────────────────

  const handleCommentsPress = useCallback(async () => {
    if (ref.current && isPlaying) await ref.current.pauseAsync();
    onCommentsPress?.();
  }, [isPlaying, onCommentsPress]);

  // ── Flash icon for centre-tap feedback ───────────────────────────────────

  const triggerFlash = useCallback((icon: 'play' | 'pause') => {
    setFlashIcon(icon);
    flashOpacity.value = withSequence(
      withSpring(1, { damping: 10, stiffness: 400, mass: 1 }),
      withTiming(1, { duration: 260 }),
      withSpring(0, { damping: 22, stiffness: 220, mass: 1 }),
    );
  }, [flashOpacity]);

  // ── Gesture handling (with double-tap edge skip) ──────────────────────────

  const handleOuterPress = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      if (premiumGated || !uri || error) return;
      const x     = e.nativeEvent.locationX;
      const third = playerWidth / 3;

      const side: 'left' | 'right' | 'centre' =
        x < third        ? 'left'   :
        x > third * 2    ? 'right'  :
                           'centre';

      // Reset counter when side changes
      if (tapSideRef.current !== side) {
        tapCountRef.current = 0;
      }
      tapSideRef.current = side;
      tapCountRef.current += 1;

      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

      tapTimerRef.current = setTimeout(() => {
        const count = tapCountRef.current;
        tapCountRef.current = 0;

        if (side === 'centre') {
          // Centre tap: play / pause toggle + flash
          // isPlaying is captured at call time in the outer callback
          const willPause = isPlaying;
          toggle();
          // willPause = was playing → we're about to pause → show Pause icon
          // !willPause = was paused → we're about to play → show Play icon
          triggerFlash(willPause ? 'pause' : 'play');
        } else if (count >= 2) {
          // Double-tap edge: skip ±10 s
          const delta = side === 'left' ? -10_000 : 10_000;
          seek(positionRef.current + delta);
          showSkipIndicator(side);
          tapMedium();
        } else {
          // Single-tap edge: toggle controls
          if (showControls) hideControls();
          else revealControls(true, 3000);
        }
      }, 220);
    },
    [premiumGated, uri, error, playerWidth, isPlaying, showControls,
     toggle, triggerFlash, hideControls, revealControls, seek, showSkipIndicator],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const progressPct = duration > 0 ? (position / duration) * 100 : 0;
  const outerStyle  = fillContainer
    ? [styles.player, styles.playerFill]
    : [styles.player, { aspectRatio }];

  const topPad = Math.max(insets.top, 0) + 10;

  // Centre button icon: buffering → spinner, ended → replay, playing → pause, paused → play
  const centreIcon = isBuffering && !hasEnded
    ? 'buffering'
    : hasEnded
    ? 'replay'
    : isPlaying
    ? 'pause'
    : 'play';

  return (
    <View>
      <Pressable
        style={outerStyle}
        onPress={handleOuterPress}
        onLayout={(e) => setPlayerWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Video player"
      >
        {/* Poster / thumbnail */}
        {posterUri ? (
          <MsMediaLoader
            uri={posterUri}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibleLabel="Video thumbnail"
          />
        ) : !posterUri && uri ? (
          <MsVideoThumbnail
            videoUri={uri}
            style={StyleSheet.absoluteFill}
            visible={!isReady}
          />
        ) : null}

        {/* The ONE Video instance */}
        {uri && !error ? (
          <Video
            ref={ref}
            source={{ uri }}
            style={[StyleSheet.absoluteFill, styles.video]}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={autoPlay && !premiumGated}
            positionMillis={savedPosition ?? 0}
            onPlaybackStatusUpdate={onStatus}
            onReadyForDisplay={onReadyForDisplay}
            onFullscreenUpdate={onFullscreenUpdate}
            onError={() => { setError(true); setIsPlaying(false); }}
            useNativeControls={false}
          />
        ) : null}

        {/* Error overlay */}
        {(!uri || error) ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>
              {error ? 'Video could not load' : 'Video unavailable'}
            </Text>
            {error ? (
              <Pressable
                onPress={() => {
                  setError(false);
                  setIsReady(false);
                  premiumFired.current = false;
                  setPremiumGated(false);
                }}
                style={styles.retryBtn}
                accessibilityLabel="Retry loading video"
              >
                <ArrowCounterClockwise size={16} color={T.ACCENT} />
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Spinner — before first frame */}
        {!isReady && uri && !error ? (
          <View style={styles.spinnerWrap} pointerEvents="none">
            <Animated.View style={[styles.spinnerRing, spinStyle]} />
          </View>
        ) : null}

        {/* Premium gate overlay */}
        {premiumGated ? (
          <View style={styles.premiumOverlay}>
            <View style={styles.premiumCircle}>
              <Lock size={22} color={T.ACCENT} />
            </View>
            <Text style={styles.premiumTitle}>Premium content</Text>
            <Text style={styles.premiumSub}>Subscribe to keep watching</Text>
          </View>
        ) : null}

        {/* Centre-tap icon flash (play / pause confirmation) */}
        <Animated.View style={[styles.flashWrap, flashStyle]} pointerEvents="none">
          <View style={styles.flashCircle}>
            {flashIcon === 'pause'
              ? <Pause size={28} color="#fff" weight="fill" />
              : <Play  size={28} color="#fff" weight="fill" />}
          </View>
        </Animated.View>

        {/* Skip-back indicator — hidden by default, shown on double-tap left */}
        <Animated.View style={[styles.skipIndicator, styles.skipIndicatorLeft, skipBackStyle]} pointerEvents="none">
          <ArrowCounterClockwise size={28} color="#fff" weight="bold" />
          <Text style={styles.skipIndicatorText}>10s</Text>
        </Animated.View>

        {/* Skip-forward indicator — hidden by default, shown on double-tap right */}
        <Animated.View style={[styles.skipIndicator, styles.skipIndicatorRight, skipFwdStyle]} pointerEvents="none">
          <ArrowClockwise size={28} color="#fff" weight="bold" />
          <Text style={styles.skipIndicatorText}>10s</Text>
        </Animated.View>

        {/* ── Glass controls overlay ─────────────────────────────────────── */}
        {uri && !error && !premiumGated ? (
          <Animated.View
            style={[styles.controlsOverlay, controlsStyle]}
            pointerEvents={showControls ? 'box-none' : 'none'}
          >
            {/* Top bar — back (left) + actions (right) */}
            <View style={[styles.topBar, { paddingTop: topPad }]}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  style={styles.topBtn}
                  accessibilityLabel="Go back"
                  hitSlop={12}
                >
                  <ArrowLeft size={18} color="#fff" weight="bold" />
                </Pressable>
              ) : <View style={styles.topBtnPlaceholder} />}

              <View style={styles.topRight}>
                {onLike ? (
                  <Pressable
                    onPress={onLike}
                    style={styles.topBtn}
                    accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
                    hitSlop={10}
                  >
                    <Heart
                      size={17}
                      color={isLiked ? '#EF4444' : '#fff'}
                      weight={isLiked ? 'fill' : 'regular'}
                    />
                    {likeCount > 0 ? (
                      <Text style={[styles.topBtnLabel, isLiked && styles.topBtnLabelLiked]}>
                        {likeCount >= 1000
                          ? `${(likeCount / 1000).toFixed(1)}k`
                          : String(likeCount)}
                      </Text>
                    ) : null}
                  </Pressable>
                ) : null}

                {onCommentsPress ? (
                  <Pressable
                    onPress={handleCommentsPress}
                    style={styles.topBtn}
                    accessibilityLabel="Comments"
                    hitSlop={10}
                  >
                    <ChatCircle size={17} color="#fff" />
                    {commentCount > 0 ? (
                      <Text style={styles.topBtnLabel}>
                        {commentCount >= 1000
                          ? `${(commentCount / 1000).toFixed(1)}k`
                          : String(commentCount)}
                      </Text>
                    ) : null}
                  </Pressable>
                ) : null}

                {onSave ? (
                  <Pressable
                    onPress={onSave}
                    style={styles.topBtn}
                    accessibilityLabel={isSaved ? 'Unsave' : 'Save'}
                    hitSlop={10}
                  >
                    <Bookmark
                      size={17}
                      color={isSaved ? T.ACCENT : '#fff'}
                      weight={isSaved ? 'fill' : 'regular'}
                    />
                  </Pressable>
                ) : null}

                {onShare ? (
                  <Pressable
                    onPress={onShare}
                    style={styles.topBtn}
                    accessibilityLabel="Share"
                    hitSlop={10}
                  >
                    <ShareNetwork size={17} color="#fff" />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Centre row — play/pause button only (skip via double-tap gesture) */}
            <View style={styles.centreRow} pointerEvents="box-none">
              <Pressable
                onPress={() => {
                  if (hasEnded) { handleReplay(); return; }
                  const willPause = isPlaying;
                  toggle();
                  triggerFlash(willPause ? 'pause' : 'play');
                }}
                style={[styles.playBtn, hasEnded && styles.replayBtn]}
                accessibilityLabel={hasEnded ? 'Replay' : isPlaying ? 'Pause' : 'Play'}
                hitSlop={8}
              >
                {centreIcon === 'buffering' ? (
                  <Animated.View style={[styles.spinnerRingSmall, spinStyle]} />
                ) : centreIcon === 'replay' ? (
                  <ArrowCounterClockwise size={26} color="#fff" weight="bold" />
                ) : centreIcon === 'pause' ? (
                  <Pause size={26} color="#fff" weight="fill" />
                ) : (
                  <Play  size={26} color="#fff" weight="fill" />
                )}
              </Pressable>
            </View>

            {/* Bottom: creator strip + progress bar */}
            <View style={styles.bottomSection}>
              {creator ? (
                <View style={styles.creatorRow} pointerEvents="box-none">
                  {creator.avatarUrl ? (
                    <Image
                      source={{ uri: creator.avatarUrl }}
                      style={styles.creatorAvatar}
                    />
                  ) : (
                    <View style={[styles.creatorAvatar, styles.creatorAvatarFallback]}>
                      <Text style={styles.creatorAvatarInitial}>
                        {creator.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.creatorText}>
                    <Text style={styles.creatorName} numberOfLines={1}>
                      {creator.name}
                    </Text>
                    <Text style={styles.creatorHandle} numberOfLines={1}>
                      @{creator.username}
                    </Text>
                  </View>
                  {creator.onSubscribePress ? (
                    <Pressable
                      onPress={creator.onSubscribePress}
                      style={styles.subscribeBtn}
                      accessibilityLabel="Subscribe"
                      hitSlop={6}
                    >
                      <UserPlus size={11} color={T.BG} />
                      <Text style={styles.subscribeBtnText}>Subscribe</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {/* Progress bar row (inside controls — detailed, with times) */}
              <View style={styles.bottomBar}>
                <Text style={styles.timeText}>
                  {formatTime(position)}
                  <Text style={styles.timeDivider}> / </Text>
                  {formatTime(duration)}
                </Text>

                <View
                  style={styles.trackHitArea}
                  onLayout={(e) => {
                    trackWidthRef.current = e.nativeEvent.layout.width;
                  }}
                  {...panResponder.panHandlers}
                >
                  <View style={styles.track} pointerEvents="none">
                    {isBuffering ? (
                      <View
                        style={[
                          styles.trackBuffering,
                          { width: `${Math.min(100, progressPct + 8)}%` as any },
                        ]}
                      />
                    ) : null}
                    <View style={[styles.trackFill, { width: `${progressPct}%` as any }]} />
                    <View style={[styles.thumb, { left: `${progressPct}%` as any }]} />
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </Pressable>

      {/* ── Glass progress bar — always visible below the player ─────────── */}
      {uri && !error && !premiumGated ? (
        <View
          style={styles.glassBarOuter}
          onLayout={(e) => {
            glassTrackWidthRef.current = e.nativeEvent.layout.width - 32; // 16px padding each side
          }}
          {...glassPanResponder.panHandlers}
        >
          {/* Glass pill container */}
          <View style={styles.glassBarPill}>
            {/* Track background */}
            <View style={styles.glassTrack}>
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
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  player: {
    width: '100%',
    backgroundColor: '#050506',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: T.RADIUS.xl,
  },
  playerFill: {
    flex: 1,
    borderRadius: 0,
  },

  video: { zIndex: 1 },

  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 4,
  },
  errorTitle: { color: '#fff', fontFamily: T.FONT.medium, fontSize: 13 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 4,
  },
  retryText: { color: T.ACCENT, fontFamily: T.FONT.semibold, fontSize: 13 },

  spinnerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    pointerEvents: 'none' as any,
  },
  spinnerRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    borderTopColor: '#fff',
  },
  spinnerRingSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
  },

  premiumOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  premiumCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  premiumTitle: { color: '#fff', fontFamily: T.FONT.bold, fontSize: 16 },
  premiumSub:   { color: 'rgba(255,255,255,0.65)', fontFamily: T.FONT.regular, fontSize: 12 },

  // Centre-tap flash
  flashWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 7,
    pointerEvents: 'none' as any,
  },
  flashCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },

  // Skip indicators — positioned left/right centre, hidden by default (opacity driven by Animated)
  skipIndicator: {
    position: 'absolute',
    top: '38%',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    zIndex: 8,
    pointerEvents: 'none' as any,
  },
  skipIndicatorLeft:  { left: 20 },
  skipIndicatorRight: { right: 20 },
  skipIndicatorText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 12,
    marginTop: 2,
  },

  // ── Glass controls overlay ─────────────────────────────────────────────

  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  topBtn: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    flexDirection: 'row',
    gap: 4,
  },
  topBtnLabel: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
  topBtnLabelLiked: {
    color: '#EF4444',
  },
  topBtnPlaceholder: { width: 38, height: 38 },
  topRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'nowrap',
  },

  // Centre play/pause button
  centreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  replayBtn: {
    backgroundColor: 'rgba(20,10,30,0.65)',
  },

  // Bottom section
  bottomSection: {
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    paddingBottom: 12,
  },

  // Creator strip
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  creatorAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: T.SURFACE_2,
  },
  creatorAvatarFallback: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.SURFACE_2,
  },
  creatorAvatarInitial: {
    color: T.TEXT_2, fontFamily: T.FONT.bold, fontSize: 12,
  },
  creatorText: { flex: 1 },
  creatorName: {
    color: '#fff', fontFamily: T.FONT.semibold, fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  creatorHandle: {
    color: 'rgba(255,255,255,0.65)', fontFamily: T.FONT.regular, fontSize: 11,
  },
  subscribeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff',
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  subscribeBtnText: {
    color: T.BG, fontFamily: T.FONT.semibold, fontSize: 10,
  },

  // Progress bar row (inside controls overlay)
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 2,
    paddingTop: 4,
  },
  timeText: {
    color: '#fff',
    fontFamily: T.FONT.medium,
    fontSize: 11,
    minWidth: 90,
  },
  timeDivider: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: T.FONT.regular,
  },
  trackHitArea: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'visible',
    justifyContent: 'center',
  },
  trackBuffering: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.ACCENT,
  },
  thumb: {
    position: 'absolute',
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#fff',
    marginLeft: -7,
    top: -5,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },

  // ── Glass progress bar (always visible, below player) ─────────────────

  glassBarOuter: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  glassBarPill: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    overflow: 'hidden',
    // subtle glass border
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  glassTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'visible',
    justifyContent: 'center',
  },
  glassTrackFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  glassThumb: {
    position: 'absolute',
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#fff',
    marginLeft: -5.5,
    top: -4,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
});
