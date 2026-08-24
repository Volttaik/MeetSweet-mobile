/**
 * MsVoiceBubble — audio message bubble.
 *
 * Design mirrors the VoiceCompactBar staging preview exactly:
 *  • Pill-shaped, T.SURFACE background (no accent tint)
 *  • Left : mic icon in small accent circle (28 px)
 *  • Centre: waveform bars, flex-1, progress-coloured, animated while playing
 *  • Right : MM:SS timer (tap to cycle speed) + accent play/pause circle (26 px)
 *
 * Playback runs on expo-audio (expo-av is removed from SDK 55) and the
 * playing-waveform pulse is driven by Reanimated worklets on the UI thread.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ArrowClockwise, DownloadSimple, Microphone, Pause, Play } from 'phosphor-react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { T } from '@/constants/theme';
import { formatDuration } from '@/types/chat-message';

// Same bar profile used in the staging preview
const BAR_HEIGHTS = [5,9,14,8,12,16,7,10,13,6,15,9,11,14,8,12,7,10,5,13,9,14,6,11,15,8,12,7,10,13];
const SPEEDS = [1, 1.5, 2] as const;

interface Props {
  uri:       string;
  duration:  number; // seconds (0 = unknown)
  position:  'left' | 'right';
  fileSize?: number; // unused visually, kept for API compat
  onDownload?: () => void;
  onLongPress?: () => void;
}

/** A single waveform bar whose scaleY pulse runs as a Reanimated worklet. */
function PlayingBar({ scale, style }: { scale: SharedValue<number>; style: any }) {
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return <Reanimated.View style={[style, animatedStyle]} />;
}

export function MsVoiceBubble({ uri, duration, position, onDownload, onLongPress }: Props) {
  const isOwn = position === 'right';

  const [totalSecs,    setTotalSecs]    = useState(duration);
  const [speedIdx,     setSpeedIdx]     = useState(0);
  const [isLoading,    setIsLoading]    = useState(false);
  const [hasError,     setHasError]     = useState(false);
  const needsDownload = !uri.startsWith('file:') && !uri.startsWith('content:');

  // Player is created empty; remote media is never fetched — the source is only
  // attached after the user explicitly downloads/plays (on-demand contract).
  const player = useAudioPlayer(needsDownload ? null : uri, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const isPlaying   = status.playing;
  const positionSecs = Math.floor(status.currentTime ?? 0);

  const barScales = useRef(BAR_HEIGHTS.map(() => useSharedValue(1))).current;

  // ── Waveform pulse (Reanimated worklets — UI thread) ────────────────────────
  useEffect(() => {
    if (isPlaying) {
      barScales.forEach((v, i) => {
        v.value = withRepeat(
          withSequence(
            withDelay(i * 40, withTiming(1.25, { duration: 700 + (i % 7) * 120, easing: Easing.inOut(Easing.sin) })),
            withTiming(0.75, { duration: 700 + (i % 7) * 120, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        );
      });
    } else {
      barScales.forEach((v) => { cancelAnimation(v); v.value = 1; });
    }
  }, [isPlaying]);

  // ── Sync duration prop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (duration > 0) setTotalSecs(duration);
  }, [duration]);

  // ── Probe actual duration when the prop arrives as 0 (local files only) ─────
  useEffect(() => {
    if (duration > 0 || needsDownload) return;
    if (status.isLoaded && status.duration > 0) setTotalSecs(Math.floor(status.duration));
  }, [uri, duration, needsDownload, status.isLoaded, status.duration]);

  // ── Reset the playhead when playback finishes ────────────────────────────────
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    barScales.forEach((v) => cancelAnimation(v));
    player.remove();
  }, []);

  // ── Playback helpers ─────────────────────────────────────────────────────────
  const loadAndPlay = async () => {
    if (needsDownload) {
      onDownload?.();
      return;
    }
    try {
      setIsLoading(true);
      setHasError(false);
      await setAudioModeAsync({ playsInSilentMode: true });
      if (!status.isLoaded) player.replace(uri);
      player.setPlaybackRate(SPEEDS[speedIdx], 'high');
      player.play();
      setIsLoading(false);
    } catch {
      setIsLoading(false);
      setHasError(true);
    }
  };

  const togglePlay = async () => {
    try {
      if (isPlaying) {
        player.pause();
        return;
      }
      if (!status.isLoaded) {
        await loadAndPlay();
      } else {
        player.play();
      }
    } catch {
      setIsLoading(false);
    }
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    player.setPlaybackRate(SPEEDS[next], 'high');
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const clampedP   = totalSecs > 0 ? Math.max(0, Math.min(1, positionSecs / totalSecs)) : 0;
  const displayTime = formatDuration(isPlaying ? positionSecs : totalSecs);

  if (needsDownload) {
    return (
      <MsPressable
        onLongPress={onLongPress}
        delayLongPress={350}
        scale={0.98}
        pressOpacity={1}
        haptic
      >
        <View style={[s.bubble, isOwn ? s.bubbleRight : s.bubbleLeft, s.downloadBubble]}>
          <View style={s.micCircle}>
            <Microphone size={14} color={T.ACCENT} weight="fill" />
          </View>
          <View style={s.downloadInfo}>
            <Text style={s.downloadTitle}>Voice message</Text>
            <Text style={s.downloadSub}>Download to play</Text>
          </View>
          <MsPressable
            style={s.playBtn}
            scale={0.88}
            pressOpacity={0.8}
            onPress={onDownload}
            haptic
            accessibilityLabel="Download voice message"
            accessibilityRole="button"
          >
            <DownloadSimple size={13} color="#fff" weight="bold" />
          </MsPressable>
        </View>
      </MsPressable>
    );
  }

  return (
    <MsPressable
      onLongPress={onLongPress}
      delayLongPress={350}
      scale={0.98}
      pressOpacity={1}
      haptic
    >
      <View style={[s.bubble, isOwn ? s.bubbleRight : s.bubbleLeft]}>


      {/* ── Mic icon circle ──────────────────────────────────────────────── */}
      <View style={s.micCircle}>
        <Microphone size={14} color={T.ACCENT} weight="fill" />
      </View>

      {/* ── Waveform bars ────────────────────────────────────────────────── */}
      <View style={s.wave}>
        {BAR_HEIGHTS.map((baseH, i) => {
          const active = i / BAR_HEIGHTS.length <= clampedP;
          const style = [
            s.bar,
            {
              height: baseH,
              backgroundColor: active ? T.ACCENT : 'rgba(255,255,255,0.15)',
            },
          ];
          return isPlaying && active
            ? <PlayingBar key={i} scale={barScales[i]} style={style} />
            : <View key={i} style={style} />;
        })}
      </View>

      {/* ── Duration — tap to cycle playback speed ───────────────────────── */}
      <MsPressable onPress={cycleSpeed} scale={0.92} pressOpacity={0.7} haptic hitSlop={8}>
        <Text style={s.duration}>
          {displayTime}{speedIdx > 0 ? ` ${SPEEDS[speedIdx]}×` : ''}
        </Text>
      </MsPressable>

      {/* ── Play / Pause button — native press feedback + haptic ─────────── */}
      <MsPressable
        style={s.playBtn}
        onPress={hasError ? loadAndPlay : togglePlay}
        scale={0.86}
        pressOpacity={0.85}
        disabled={isLoading}
        haptic
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        accessibilityRole="button"
      >
        {hasError ? (
          <ArrowClockwise size={12} color="#fff" weight="bold" />
        ) : isLoading ? (
          <View style={s.loadingDot} />
        ) : isPlaying ? (
          <Pause size={12} color="#fff" weight="fill" />
        ) : (
          <Play size={12} color="#fff" weight="fill" />
        )}
      </MsPressable>

      </View>
    </MsPressable>
  );
}

const s = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    width: 260,
    marginVertical: 1,
    ...T.SHADOWS.soft,
  },
  bubbleLeft:  { alignSelf: 'flex-start', marginLeft: 8 },
  bubbleRight: { alignSelf: 'flex-end',   marginRight: 8 },

  micCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${T.ACCENT}22`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  wave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 20,
    overflow: 'hidden',
  },
  bar: {
    width: 2.5,
    borderRadius: 2,
    minHeight: 3,
  },

  duration: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
    flexShrink: 0,
    minWidth: 30,
    textAlign: 'right',
  },

  playBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  downloadBubble: { width: 230 },
  downloadInfo: { flex: 1, gap: 2 },
  downloadTitle: { fontSize: 12, fontFamily: T.FONT.semibold, color: T.TEXT },
  downloadSub: { fontSize: 10, fontFamily: T.FONT.regular, color: T.TEXT_3 },

  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    opacity: 0.7,
  },
});
