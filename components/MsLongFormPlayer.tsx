/**
 * MsLongFormPlayer — seekable long-form video player.
 *
 * Architecture:
 *   - Video is mounted ONCE and never remounts during playback (prevents flash).
 *   - Controls are a translucent glass overlay that floats inside the video frame.
 *   - Spinner only shows before the first frame is decoded (onReadyForDisplay).
 *
 * Gesture contract:
 *   - Centre tap (middle third): pause / resume only — never shows/hides controls.
 *   - Edge tap (left or right third): toggle controls visibility.
 *   - Controls auto-show on playback start and hide after 1.5 s.
 *
 * Controls layout (inside the video, glass-frosted overlay):
 *   Top    : optional back button + fullscreen toggle
 *   Middle : ⏪ 10s  |  ▶/⏸  |  ⏩ 10s
 *   Bottom : current time · progress bar · remaining time
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
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
  ArrowsOut,
  Lock,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoThumbnail } from '@/components/MsVideoThumbnail';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  videoId: string;
  uri: string | null;
  posterUri?: string | null;
  autoPlay?: boolean;
  isPremium?: boolean;
  onPremiumRequired?: () => void;
  /** Pass the known aspect ratio from post metadata to eliminate the initial layout flash. */
  initialAspectRatio?: number;
  /** Optional callback for the back button shown inside the controls overlay. */
  onBack?: () => void;
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
}: Props) {
  const ref          = useRef<Video>(null);
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const premiumFired = useRef(false);
  const positionRef  = useRef(0);

  const [isPlaying,    setIsPlaying]    = useState(autoPlay);
  const [isBuffering,  setIsBuffering]  = useState(false);
  // isReady: true once onReadyForDisplay fires — spinner hidden from this point
  const [isReady,      setIsReady]      = useState(false);
  const [position,     setPosition]     = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [error,        setError]        = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [savedPosition,setSavedPosition]= useState<number | null>(null);
  const [trackWidth,   setTrackWidth]   = useState(1);
  const [premiumGated, setPremiumGated] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerWidth,  setPlayerWidth]  = useState(SCREEN_WIDTH);

  // Stable aspect ratio — always start at initialAspectRatio ?? 16/9 so the
  // container never resizes on the first onReadyForDisplay callback.
  const [aspectRatio,  setAspectRatio]  = useState(initialAspectRatio ?? 16 / 9);

  // Animated opacity for smooth control fade
  const controlsOpacity = useSharedValue(1);
  const controlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  // ── Auto-hide timer ─────────────────────────────────────────────────────────

  const scheduleHide = useCallback((delayMs = 3000) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      controlsOpacity.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
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

  // Auto-show controls when playback begins, then fade after 1.5 s
  useEffect(() => {
    if (isPlaying) revealControls(true, 1500);
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore saved progress ─────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(progressKey(videoId))
      .then((v) => { if (active && v) setSavedPosition(Number(v)); })
      .catch(() => {});
    return () => { active = false; };
  }, [videoId]);

  // ── Reset on video change ─────────────────────────────────────────────────

  useEffect(() => {
    premiumFired.current = false;
    setPremiumGated(false);
    setError(false);
    setPosition(0);
    setDuration(0);
    setIsReady(false);
    positionRef.current = 0;
    // Keep the aspect ratio stable across video changes — only reset if caller
    // provides a new value.
    if (initialAspectRatio) setAspectRatio(initialAspectRatio);
  }, [videoId, uri, initialAspectRatio]);

  // ── Playback status ────────────────────────────────────────────────────────

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        return;
      }
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
      // Premium gate
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
      // Mark as ready — spinner disappears immediately
      setIsReady(true);
      const w = event.naturalSize?.width;
      const h = event.naturalSize?.height;
      // Only update if not already set by initialAspectRatio to avoid layout jump
      if (w && h && h > 0 && !initialAspectRatio) setAspectRatio(w / h);
    },
    [initialAspectRatio],
  );

  const onFullscreenUpdate = useCallback(
    ({ fullscreenUpdate }: { fullscreenUpdate: VideoFullscreenUpdate }) => {
      if (
        fullscreenUpdate === VideoFullscreenUpdate.PLAYER_DID_DISMISS ||
        fullscreenUpdate === VideoFullscreenUpdate.PLAYER_WILL_DISMISS
      ) {
        setIsFullscreen(false);
      } else {
        setIsFullscreen(true);
      }
    },
    [],
  );

  // ── Playback controls ──────────────────────────────────────────────────────

  const toggle = useCallback(async () => {
    if (!ref.current || premiumGated) return;
    if (isPlaying) await ref.current.pauseAsync();
    else           await ref.current.playAsync();
  }, [isPlaying, premiumGated]);

  const seek = useCallback(async (ms: number) => {
    const clamped = Math.max(0, Math.min(duration || 0, ms));
    setPosition(clamped);
    await ref.current?.setPositionAsync(clamped);
    revealControls();
  }, [duration, revealControls]);

  const seekByTrackTap = useCallback(
    (evt: { nativeEvent: { locationX: number } }) => {
      if (!duration) return;
      const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWidth));
      seek(ratio * duration);
    },
    [duration, seek, trackWidth],
  );

  const handleFullscreen = useCallback(async () => {
    await ref.current?.presentFullscreenPlayer();
  }, []);

  // ── Gesture handling ──────────────────────────────────────────────────────

  const handleVideoPress = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      if (premiumGated) return;
      const x = e.nativeEvent.locationX;
      const third = playerWidth / 3;

      if (x >= third && x <= third * 2) {
        // ── Centre tap: play / pause only ──────────────────────────────────
        toggle();
        // Brief control flash so user sees the state change, then re-hide
        revealControls(true, 800);
      } else {
        // ── Edge tap: toggle control visibility ───────────────────────────
        if (showControls) {
          hideControls();
        } else {
          revealControls(true, 3000);
        }
      }
    },
    [premiumGated, playerWidth, toggle, showControls, revealControls, hideControls],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const progressPct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <View
      style={[styles.player, { aspectRatio }]}
      onLayout={(e) => setPlayerWidth(e.nativeEvent.layout.width)}
    >
      {/* Poster / thumbnail — shown until video is ready */}
      {posterUri ? (
        <MsMediaLoader
          uri={posterUri}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel="Video thumbnail"
        />
      ) : !posterUri && uri ? (
        /* First-frame fallback when no thumbnail URL is available */
        <MsVideoThumbnail
          videoUri={uri}
          style={StyleSheet.absoluteFill}
          visible={!isReady}
        />
      ) : null}

      {/* The ONE Video instance — never remounts */}
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

      {/* Spinner — only before first frame is decoded */}
      {!isReady && uri && !error ? (
        <View style={styles.spinnerWrap} pointerEvents="none">
          <View style={styles.spinnerRing} />
        </View>
      ) : null}

      {/* Mid-playback buffering dot on progress (subtle, non-blocking) */}
      {isReady && isBuffering && !isPlaying && uri && !error ? (
        <View style={styles.spinnerWrap} pointerEvents="none">
          <View style={styles.spinnerRing} />
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

      {/* Gesture layer — covers entire player */}
      {!premiumGated && uri && !error ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleVideoPress}
          accessibilityLabel="Video player"
        />
      ) : null}

      {/* Glass controls overlay */}
      {uri && !error && !premiumGated ? (
        <Animated.View
          style={[styles.controlsOverlay, controlsStyle]}
          pointerEvents={showControls ? 'box-none' : 'none'}
        >
          {/* Top bar */}
          <View style={styles.topBar}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                style={styles.topBtn}
                accessibilityLabel="Go back"
                hitSlop={10}
              >
                <ArrowLeft size={19} color="#fff" weight="bold" />
              </Pressable>
            ) : <View style={styles.topBtnPlaceholder} />}

            <View style={styles.topRight}>
              {!isFullscreen ? (
                <Pressable
                  onPress={handleFullscreen}
                  style={styles.topBtn}
                  accessibilityLabel="Fullscreen"
                  hitSlop={10}
                >
                  <ArrowsOut size={17} color="#fff" />
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
              hitSlop={8}
            >
              <SkipBack size={26} color="#fff" weight="fill" />
            </Pressable>

            <Pressable
              onPress={toggle}
              style={styles.playBtn}
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              hitSlop={8}
            >
              {isPlaying
                ? <Pause size={26} color="#fff" weight="fill" />
                : <Play  size={26} color="#fff" weight="fill" />}
            </Pressable>

            <Pressable
              onPress={() => seek(position + 10_000)}
              style={styles.skipBtn}
              accessibilityLabel="Skip forward 10 seconds"
              hitSlop={8}
            >
              <SkipForward size={26} color="#fff" weight="fill" />
            </Pressable>
          </View>

          {/* Bottom bar: time + seekbar */}
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
              {/* Buffering ghost fill */}
              {isBuffering ? (
                <View style={[styles.trackBuffering, { width: `${Math.min(100, progressPct + 8)}%` as any }]} />
              ) : null}
              <View style={[styles.trackFill, { width: `${progressPct}%` as any }]} />
              <View style={[styles.thumb, { left: `${progressPct}%` as any }]} pointerEvents="none" />
            </View>

            <Text style={styles.timeText}>{formatRemaining(position, duration)}</Text>
          </View>
        </Animated.View>
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  premiumTitle: { color: '#fff', fontFamily: T.FONT.bold, fontSize: 16 },
  premiumSub:   { color: 'rgba(255,255,255,0.65)', fontFamily: T.FONT.regular, fontSize: 12 },

  // ── Glass overlay ─────────────────────────────────────────────────────────

  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    justifyContent: 'space-between',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0)',
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    // Soft shadow so it reads against any background
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  topBtnPlaceholder: { width: 36 },
  topRight: { flexDirection: 'row', gap: 8 },

  // Centre controls
  centreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  skipBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.32)',
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
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'visible',
    justifyContent: 'center',
  },
  trackBuffering: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
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
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginLeft: -6,
    top: -4,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
});
