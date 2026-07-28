/**
 * MsLongFormPlayer — seekable long-form video player.
 *
 * Architecture note:
 *   The Video component is mounted ONCE and never remounts during playback.
 *   All player state (controls, position, buffering) is managed via refs/state
 *   at the parent level. No inner component is defined — doing so would cause
 *   React to unmount/remount the Video subtree on every state change, producing
 *   the flashing and flickering that plagued the previous implementation.
 *
 * Fullscreen:
 *   Uses expo-av's presentFullscreenPlayer() / dismissFullscreenPlayer() rather
 *   than a React Modal. This keeps the same Video instance alive in both modes.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ResizeMode,
  Video,
  VideoFullscreenUpdate,
  type AVPlaybackStatus,
} from 'expo-av';
import {
  ArrowCounterClockwise,
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
}

const progressKey = (id: string) => `@ms_video_progress:${id}`;

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function MsLongFormPlayer({
  videoId,
  uri,
  posterUri,
  autoPlay = false,
  isPremium = false,
  onPremiumRequired,
  initialAspectRatio,
}: Props) {
  const ref            = useRef<Video>(null);
  const hideTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const premiumFired   = useRef(false);
  // Track position in a ref so onStatus callback never goes stale
  const positionRef    = useRef(0);

  const [isPlaying,     setIsPlaying]     = useState(autoPlay);
  const [isBuffering,   setIsBuffering]   = useState(false);
  const [position,      setPosition]      = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [error,         setError]         = useState(false);
  const [showControls,  setShowControls]  = useState(true);
  const [savedPosition, setSavedPosition] = useState<number | null>(null);
  const [trackWidth,    setTrackWidth]    = useState(1);
  const [premiumGated,  setPremiumGated]  = useState(false);
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  // Track rendered width for centre-tap zone detection
  const [playerWidth,   setPlayerWidth]   = useState(SCREEN_WIDTH);

  // Use caller-supplied aspect ratio (from post metadata) so the first frame
  // is already the correct size — eliminates the layout flash on open.
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio ?? 16 / 9);

  // Restore saved progress on mount
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(progressKey(videoId))
      .then((v) => { if (active && v) setSavedPosition(Number(v)); })
      .catch(() => {});
    return () => { active = false; };
  }, [videoId]);

  // Reset premium gate when videoId / uri changes
  useEffect(() => {
    premiumFired.current = false;
    setPremiumGated(false);
    setError(false);
    setPosition(0);
    setDuration(0);
    positionRef.current = 0;
  }, [videoId, uri]);

  // Auto-hide controls
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        setIsBuffering(true);
        return;
      }
      setIsBuffering(status.isBuffering ?? false);
      setIsPlaying(status.isPlaying);
      const pos = status.positionMillis;
      setPosition(pos);
      setDuration(status.durationMillis ?? 0);
      // Persist progress every 5 s using the ref so this callback never goes stale
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
    // videoId & isPremium are the only truly external deps; onPremiumRequired is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoId, isPremium, onPremiumRequired],
  );

  const onReadyForDisplay = useCallback(
    (event: { naturalSize?: { width: number; height: number } }) => {
      const w = event.naturalSize?.width;
      const h = event.naturalSize?.height;
      if (w && h && h > 0) setAspectRatio(w / h);
    },
    [],
  );

  const onFullscreenUpdate = useCallback(
    ({ fullscreenUpdate }: { fullscreenUpdate: VideoFullscreenUpdate }) => {
      if (
        fullscreenUpdate === VideoFullscreenUpdate.PLAYER_DID_DISMISS ||
        fullscreenUpdate === VideoFullscreenUpdate.PLAYER_WILL_DISMISS
      ) {
        setIsFullscreen(false);
      } else if (
        fullscreenUpdate === VideoFullscreenUpdate.PLAYER_DID_PRESENT ||
        fullscreenUpdate === VideoFullscreenUpdate.PLAYER_WILL_PRESENT
      ) {
        setIsFullscreen(true);
      }
    },
    [],
  );

  const toggle = useCallback(async () => {
    if (!ref.current || premiumGated) return;
    revealControls();
    if (isPlaying) await ref.current.pauseAsync();
    else           await ref.current.playAsync();
  }, [isPlaying, premiumGated, revealControls]);

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
    setIsFullscreen(true);
  }, []);

  // ─── Inline player JSX (no inner component — keeps Video stable) ──────────

  const progressPct = duration > 0 ? `${(position / duration) * 100}%` : '0%';

  return (
    <View
      style={[styles.player, { aspectRatio }]}
      onLayout={(e) => setPlayerWidth(e.nativeEvent.layout.width)}
    >

      {/* Poster — shown while video is not yet loaded */}
      {posterUri ? (
        <MsMediaLoader
          uri={posterUri}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel="Video thumbnail"
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

      {/* Buffering spinner */}
      {isBuffering && uri && !error ? (
        <ActivityIndicator
          color="#fff"
          size="large"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
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

      {/* Gesture layer — centre tap toggles playback; edges toggle controls */}
      {!premiumGated ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={(e) => {
            const x = e.nativeEvent.locationX;
            const third = playerWidth / 3;
            if (x >= third && x <= third * 2) {
              // ── Centre tap: toggle play / pause ──────────────────────────
              if (ref.current) {
                if (isPlaying) {
                  ref.current.pauseAsync().catch(() => {});
                } else {
                  ref.current.playAsync().catch(() => {});
                }
              }
              // Always reveal controls briefly so the user sees the state change
              revealControls();
            } else {
              // ── Edge tap: show / hide controls ───────────────────────────
              setShowControls((v) => {
                if (!v) { scheduleHide(); return true; }
                if (hideTimer.current) clearTimeout(hideTimer.current);
                return false;
              });
            }
          }}
        />
      ) : null}

      {/* Controls bar */}
      {showControls && uri && !error && !premiumGated ? (
        <View style={styles.controls}>
          {/* Skip −10 */}
          <Pressable
            onPress={() => seek(position - 10_000)}
            style={styles.skipBtn}
            accessibilityLabel="Skip back 10 seconds"
          >
            <SkipBack size={18} color="#fff" weight="fill" />
          </Pressable>

          {/* Play / Pause */}
          <Pressable
            onPress={toggle}
            style={styles.playBtn}
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying
              ? <Pause size={20} color="#fff" weight="fill" />
              : <Play  size={20} color="#fff" weight="fill" />}
          </Pressable>

          {/* Skip +10 */}
          <Pressable
            onPress={() => seek(position + 10_000)}
            style={styles.skipBtn}
            accessibilityLabel="Skip forward 10 seconds"
          >
            <SkipForward size={18} color="#fff" weight="fill" />
          </Pressable>

          {/* Progress track */}
          <View
            style={styles.track}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={seekByTrackTap}
              accessibilityLabel="Seek"
            />
            <View style={[styles.trackFill, { width: progressPct as any }]} />
            <View
              style={[styles.thumb, { left: progressPct as any }]}
              pointerEvents="none"
            />
          </View>

          {/* Time */}
          <Text style={styles.time} numberOfLines={1}>
            {formatTime(position)}{' / '}{formatTime(duration)}
          </Text>

          {/* Fullscreen */}
          {!isFullscreen ? (
            <Pressable
              onPress={handleFullscreen}
              style={styles.expandBtn}
              accessibilityLabel="Open fullscreen"
            >
              <ArrowsOut size={16} color="#fff" />
            </Pressable>
          ) : null}
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

  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  skipBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'visible',
    justifyContent: 'center',
  },
  trackFill: {
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
  },
  time: {
    color: '#fff',
    fontFamily: T.FONT.medium,
    fontSize: 10,
    minWidth: 72,
    textAlign: 'right',
  },
  expandBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
