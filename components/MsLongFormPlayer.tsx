/**
 * MsLongFormPlayer — improved long-form video player.
 *
 * Improvements over the previous version:
 * - Seekable tap-to-seek progress bar
 * - Skip −10 / +10 s buttons
 * - Controls auto-hide after 3 s of playback
 * - Cleaner buffering indicator (centred spinner)
 * - Premium 3-second preview: pause + call onPremiumRequired after 3 s
 * - Retry on error
 * - Aspect-ratio preserved (16 : 9 default, switches to flex-1 in fullscreen)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import {
  ArrowCounterClockwise,
  ArrowsOut,
  ArrowsIn,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Lock,
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
  /** If true, playback pauses at 3 s and fires onPremiumRequired */
  isPremium?: boolean;
  onPremiumRequired?: () => void;
}

const progressKey = (id: string) => `@ms_video_progress:${id}`;

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsLongFormPlayer({
  videoId,
  uri,
  posterUri,
  autoPlay = false,
  isPremium = false,
  onPremiumRequired,
}: Props) {
  const ref        = useRef<Video>(null);
  const trackRef   = useRef<View>(null);
  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const premiumFired = useRef(false);

  const [isPlaying,     setIsPlaying]     = useState(autoPlay);
  const [isBuffering,   setIsBuffering]   = useState(false);
  const [position,      setPosition]      = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [error,         setError]         = useState(false);
  const [fullscreen,    setFullscreen]    = useState(false);
  const [showControls,  setShowControls]  = useState(true);
  const [savedPosition, setSavedPosition] = useState<number | null>(null);
  const [trackWidth,    setTrackWidth]    = useState(1);
  // Premium gate: true while locked and waiting for user action
  const [premiumGated,  setPremiumGated]  = useState(false);

  // Restore saved progress on mount
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(progressKey(videoId))
      .then((v) => { if (active && v) setSavedPosition(Number(v)); })
      .catch(() => {});
    return () => { active = false; };
  }, [videoId]);

  // Reset premium gate when URI changes
  useEffect(() => {
    premiumFired.current = false;
    setPremiumGated(false);
  }, [videoId, uri]);

  // Auto-hide controls after 3 s of playback
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const showControlsNow = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) { setIsBuffering(true); return; }
      setIsBuffering(status.isBuffering ?? false);
      setIsPlaying(status.isPlaying);
      const pos = status.positionMillis;
      setPosition(pos);
      setDuration(status.durationMillis ?? 0);
      // Persist every 5 s
      if (pos > 0 && Math.floor(pos / 5000) !== Math.floor((position || 0) / 5000)) {
        AsyncStorage.setItem(progressKey(videoId), String(pos)).catch(() => {});
      }
      if (status.didJustFinish) setIsPlaying(false);
      // Premium gate: pause at 3 s
      if (isPremium && !premiumFired.current && pos >= 3000) {
        premiumFired.current = true;
        ref.current?.pauseAsync().catch(() => {});
        setPremiumGated(true);
        onPremiumRequired?.();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoId, isPremium, onPremiumRequired],
  );

  const toggle = async () => {
    if (!ref.current || premiumGated) return;
    showControlsNow();
    if (isPlaying) await ref.current.pauseAsync();
    else           await ref.current.playAsync();
  };

  const seek = async (ms: number) => {
    const clamped = Math.max(0, Math.min(duration || 0, ms));
    setPosition(clamped);
    await ref.current?.setPositionAsync(clamped);
    showControlsNow();
  };

  const seekByTrackTap = (evt: { nativeEvent: { locationX: number } }) => {
    if (!duration) return;
    const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWidth));
    seek(ratio * duration);
  };

  // ── Player inner JSX (reused in inline + fullscreen Modal) ──────────────────
  const Player = ({ modal = false }: { modal?: boolean }) => (
    <View style={[styles.player, modal && styles.modalPlayer]}>
      {/* Poster */}
      {posterUri ? (
        <MsMediaLoader
          uri={posterUri}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel="Video thumbnail"
        />
      ) : null}

      {/* Stream */}
      {uri && !error ? (
        <Video
          ref={ref}
          source={{ uri }}
          style={[StyleSheet.absoluteFill, styles.video]}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={autoPlay && !premiumGated}
          positionMillis={savedPosition ?? 0}
          onPlaybackStatusUpdate={onStatus}
          onError={() => { setError(true); setIsPlaying(false); }}
          useNativeControls={false}
        />
      ) : null}

      {/* Error overlay */}
      {(!uri || error) ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{error ? 'Video could not load' : 'Video unavailable'}</Text>
          {error ? (
            <Pressable
              onPress={() => { setError(false); premiumFired.current = false; setPremiumGated(false); }}
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
        <ActivityIndicator color="#fff" size="large" style={StyleSheet.absoluteFill} pointerEvents="none" />
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

      {/* Tap to toggle controls */}
      {!premiumGated ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {
          setShowControls((v) => {
            if (!v) { scheduleHide(); return true; }
            if (hideTimer.current) clearTimeout(hideTimer.current);
            return false;
          });
        }} />
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
              ? <Pause  size={20} color="#fff" weight="fill" />
              : <Play   size={20} color="#fff" weight="fill" />}
          </Pressable>

          {/* Skip +10 */}
          <Pressable
            onPress={() => seek(position + 10_000)}
            style={styles.skipBtn}
            accessibilityLabel="Skip forward 10 seconds"
          >
            <SkipForward size={18} color="#fff" weight="fill" />
          </Pressable>

          {/* Progress bar */}
          <View
            ref={trackRef}
            style={styles.track}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={seekByTrackTap}
              accessibilityLabel="Seek"
            />
            <View style={[styles.trackFill, { width: duration ? `${(position / duration) * 100}%` as any : '0%' }]} />
            {/* Scrubber thumb */}
            <View
              style={[
                styles.thumb,
                { left: duration ? `${(position / duration) * 100}%` as any : '0%' },
              ]}
              pointerEvents="none"
            />
          </View>

          {/* Time */}
          <Text style={styles.time} numberOfLines={1}>
            {formatTime(position)}{' / '}{formatTime(duration)}
          </Text>

          {/* Fullscreen toggle */}
          {!modal ? (
            <Pressable
              onPress={() => setFullscreen(true)}
              style={styles.expandBtn}
              accessibilityLabel="Open fullscreen"
            >
              <ArrowsOut size={16} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setFullscreen(false)}
              style={styles.expandBtn}
              accessibilityLabel="Exit fullscreen"
            >
              <ArrowsIn size={16} color="#fff" />
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Player />
      <Modal
        visible={fullscreen}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={styles.fullscreenWrap}>
          <Player modal />
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#050506',
    overflow: 'hidden',
    position: 'relative',
  },
  modalPlayer: {
    aspectRatio: undefined,
    flex: 1,
  },
  video: { zIndex: 1 },

  // States
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

  // Premium gate
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

  // Controls bar
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
    paddingBottom: 10,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
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

  // Fullscreen
  fullscreenWrap: { flex: 1, backgroundColor: '#000' },
});
