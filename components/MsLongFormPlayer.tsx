/**
 * MsLongFormPlayer — single reusable long-form video controller.
 *
 * Architecture (v2):
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
 *   - Edge tap (left OR right third): toggle controls visibility.
 *   - Controls auto-show on mount / play-start, fade after 1.5 s.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  ArrowLeft,
  ChatCircle,
  Lock,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  UserPlus,
} from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoThumbnail } from '@/components/MsVideoThumbnail';

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
}

const progressKey = (id: string) => `@ms_video_progress:${id}`;

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatRemaining(posMs: number, durMs: number): string {
  const remaining = Math.max(0, durMs - posMs);
  return `-${formatTime(remaining)}`;
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
}: Props) {
  const ref          = useRef<Video>(null);
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const premiumFired = useRef(false);
  const positionRef  = useRef(0);

  const [isPlaying,     setIsPlaying]     = useState(autoPlay);
  const [isBuffering,   setIsBuffering]   = useState(false);
  const [isReady,       setIsReady]       = useState(false);
  const [position,      setPosition]      = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [error,         setError]         = useState(false);
  const [showControls,  setShowControls]  = useState(true);
  const [savedPosition, setSavedPosition] = useState<number | null>(null);
  const [trackWidth,    setTrackWidth]    = useState(1);
  const [premiumGated,  setPremiumGated]  = useState(false);
  const [playerWidth,   setPlayerWidth]   = useState(SCREEN_WIDTH);

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

  // ── Auto-hide timer ──────────────────────────────────────────────────────

  const scheduleHide = useCallback((delayMs = 3000) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      controlsOpacity.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
      setShowControls(false);
    }, delayMs);
  }, [controlsOpacity]);

  const revealControls = useCallback((autoHide = true, delayMs = 3000) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    controlsOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    setShowControls(true);
    if (autoHide) scheduleHide(delayMs);
  }, [controlsOpacity, scheduleHide]);

  const hideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    controlsOpacity.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
    setShowControls(false);
  }, [controlsOpacity]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  // Auto-show controls on play-start, fade after 1.5 s
  useEffect(() => {
    if (isPlaying) revealControls(true, 1500);
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-show on mount
  useEffect(() => {
    revealControls(true, 1500);
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
    premiumFired.current = false;
    setPremiumGated(false);
    setError(false);
    setPosition(0);
    setDuration(0);
    setIsReady(false);
    positionRef.current = 0;
    if (initialAspectRatio) setAspectRatio(initialAspectRatio);
  }, [videoId, uri, initialAspectRatio]);

  // ── Playback status ──────────────────────────────────────────────────────

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      setIsBuffering(status.isBuffering ?? false);
      setIsPlaying(status.isPlaying);
      const pos = status.positionMillis;
      setPosition(pos);
      setDuration(status.durationMillis ?? 0);
      if (pos > 0 && Math.floor(pos / 5000) !== Math.floor(positionRef.current / 5000)) {
        AsyncStorage.setItem(progressKey(videoId), String(pos)).catch(() => {});
      }
      positionRef.current = pos;
      if (status.didJustFinish) setIsPlaying(false);
      if (isPremium && !premiumFired.current && pos >= 3000) {
        premiumFired.current = true;
        ref.current?.pauseAsync().catch(() => {});
        setPremiumGated(true);
        onPremiumRequired?.();
      }
    },
    [videoId, isPremium, onPremiumRequired],
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
      // no-op — native fullscreen not used in this player
      void fullscreenUpdate;
    },
    [],
  );

  // ── Playback controls ────────────────────────────────────────────────────

  const toggle = useCallback(async () => {
    if (!ref.current || premiumGated) return;
    if (isPlaying) await ref.current.pauseAsync();
    else           await ref.current.playAsync();
  }, [isPlaying, premiumGated]);

  const seek = useCallback(async (ms: number) => {
    const clamped = Math.max(0, Math.min(duration || 0, ms));
    setPosition(clamped);
    await ref.current?.setPositionAsync(clamped);
    revealControls(true, 3000);
  }, [duration, revealControls]);

  const seekByTrackTap = useCallback(
    (evt: { nativeEvent: { locationX: number } }) => {
      if (!duration) return;
      const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWidth));
      seek(ratio * duration);
    },
    [duration, seek, trackWidth],
  );

  // ── Comments ─────────────────────────────────────────────────────────────

  const handleCommentsPress = useCallback(async () => {
    // Pause first, then open comments
    if (ref.current && isPlaying) await ref.current.pauseAsync();
    onCommentsPress?.();
  }, [isPlaying, onCommentsPress]);

  // ── Flash icon for centre-tap feedback ───────────────────────────────────

  const triggerFlash = useCallback((icon: 'play' | 'pause') => {
    setFlashIcon(icon);
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(1, { duration: 300 }),
      withTiming(0, { duration: 200 }),
    );
  }, [flashOpacity]);

  // ── Gesture handling ─────────────────────────────────────────────────────
  // The outer Pressable covers the entire player.
  // Child buttons in the controls overlay absorb their own taps, so this
  // handler only fires on "empty" areas of the video.

  const handleOuterPress = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      if (premiumGated || !uri || error) return;
      const x     = e.nativeEvent.locationX;
      const third = playerWidth / 3;

      if (x >= third && x <= third * 2) {
        // ── Centre tap: play / pause only ─────────────────────────────────
        // Do NOT show or hide controls.
        const willPause = isPlaying;
        toggle();
        triggerFlash(willPause ? 'pause' : 'play');
      } else {
        // ── Edge tap: toggle controls ──────────────────────────────────────
        if (showControls) {
          hideControls();
        } else {
          revealControls(true, 3000);
        }
      }
    },
    [premiumGated, uri, error, playerWidth, isPlaying, showControls,
     toggle, triggerFlash, hideControls, revealControls],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const progressPct = duration > 0 ? (position / duration) * 100 : 0;
  const outerStyle  = fillContainer
    ? [styles.player, styles.playerFill]
    : [styles.player, { aspectRatio }];

  return (
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

      {/* Mid-playback buffering */}
      {isReady && isBuffering && uri && !error ? (
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

      {/* ── Glass controls overlay ─────────────────────────────────────── */}
      {uri && !error && !premiumGated ? (
        <Animated.View
          style={[styles.controlsOverlay, controlsStyle]}
          pointerEvents={showControls ? 'box-none' : 'none'}
        >
          {/* Top bar — back + comments */}
          <View style={styles.topBar}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                style={styles.topBtn}
                accessibilityLabel="Go back"
                hitSlop={12}
              >
                <ArrowLeft size={19} color="#fff" weight="bold" />
              </Pressable>
            ) : <View style={styles.topBtnPlaceholder} />}

            <View style={styles.topRight}>
              {onCommentsPress ? (
                <Pressable
                  onPress={handleCommentsPress}
                  style={styles.topBtn}
                  accessibilityLabel="Comments"
                  hitSlop={12}
                >
                  <ChatCircle size={19} color="#fff" />
                  {commentCount > 0 ? (
                    <View style={styles.commentBadge} pointerEvents="none">
                      <Text style={styles.commentBadgeText}>
                        {commentCount >= 1000
                          ? `${(commentCount / 1000).toFixed(1)}k`
                          : String(commentCount)}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Centre playback controls */}
          <View style={styles.centreRow} pointerEvents="box-none">
            <Pressable
              onPress={() => seek(position - 10_000)}
              style={styles.skipBtn}
              accessibilityLabel="Skip back 10 seconds"
              hitSlop={10}
            >
              <SkipBack size={26} color="#fff" weight="fill" />
            </Pressable>

            <Pressable
              onPress={toggle}
              style={styles.playBtn}
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              hitSlop={10}
            >
              {isPlaying
                ? <Pause size={28} color="#fff" weight="fill" />
                : <Play  size={28} color="#fff" weight="fill" />}
            </Pressable>

            <Pressable
              onPress={() => seek(position + 10_000)}
              style={styles.skipBtn}
              accessibilityLabel="Skip forward 10 seconds"
              hitSlop={10}
            >
              <SkipForward size={26} color="#fff" weight="fill" />
            </Pressable>
          </View>

          {/* Bottom: creator strip + progress bar */}
          <View style={styles.bottomSection}>
            {/* Compact creator strip */}
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

            {/* Progress bar row */}
            <View style={styles.bottomBar}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>

              <View
                style={styles.track}
                onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
              >
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={seekByTrackTap}
                  accessibilityLabel="Seek"
                />
                {isBuffering ? (
                  <View style={[styles.trackBuffering, { width: `${Math.min(100, progressPct + 8)}%` as any }]} />
                ) : null}
                <View style={[styles.trackFill, { width: `${progressPct}%` as any }]} />
                <View style={[styles.thumb, { left: `${progressPct}%` as any }]} pointerEvents="none" />
              </View>

              <Text style={styles.timeText}>{formatRemaining(position, duration)}</Text>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  player: {
    width: '100%',
    backgroundColor: '#050506',
    overflow: 'hidden',
    position: 'relative',
  },
  playerFill: {
    flex: 1,
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

  // ── Glass controls overlay ─────────────────────────────────────────────

  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    justifyContent: 'space-between',
    // Gradient-like dark edges
    backgroundColor: 'transparent',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  topBtn: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    flexDirection: 'row',
    gap: 4,
  },
  topBtnPlaceholder: { width: 36 },
  topRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },

  commentBadge: {
    backgroundColor: T.ACCENT,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  commentBadgeText: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 9,
  },

  // Centre controls
  centreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
  },
  skipBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  playBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },

  // Bottom section: creator strip + progress
  bottomSection: {
    paddingHorizontal: 0,
    // Bottom scrim
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 0,
    paddingBottom: 10,
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
    width: 28, height: 28, borderRadius: 14,
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
    color: '#fff', fontFamily: T.FONT.semibold, fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  creatorHandle: {
    color: 'rgba(255,255,255,0.65)', fontFamily: T.FONT.regular, fontSize: 10,
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

  // Progress bar row
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 4,
    paddingTop: 2,
  },
  timeText: {
    color: '#fff',
    fontFamily: T.FONT.medium,
    fontSize: 11,
    minWidth: 38,
    textAlign: 'center',
  },
  track: {
    flex: 1,
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
    backgroundColor: 'rgba(255,255,255,0.2)',
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
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: '#fff',
    marginLeft: -6,
    top: -5,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
});
