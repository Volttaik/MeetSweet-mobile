/**
 * MsVoiceBubble — audio message bubble.
 *
 * Design mirrors the VoiceCompactBar staging preview exactly:
 *  • Pill-shaped, T.SURFACE background (no accent tint)
 *  • Left : mic icon in small accent circle (28 px)
 *  • Centre: waveform bars, flex-1, progress-coloured, animated while playing
 *  • Right : MM:SS timer (tap to cycle speed) + accent play/pause circle (26 px)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowClockwise, Microphone, Pause, Play } from 'phosphor-react-native';
import { Audio } from 'expo-av';
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
  onLongPress?: () => void;
}

export function MsVoiceBubble({ uri, duration, position, onLongPress }: Props) {
  const isOwn = position === 'right';

  const [isPlaying,    setIsPlaying]    = useState(false);
  const [positionSecs, setPositionSecs] = useState(0);
  const [totalSecs,    setTotalSecs]    = useState(duration);
  const [speedIdx,     setSpeedIdx]     = useState(0);
  const [isLoading,    setIsLoading]    = useState(false);
  const [hasError,     setHasError]     = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const barAnims = useRef(BAR_HEIGHTS.map(() => new Animated.Value(1))).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Waveform animation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      const stagger = barAnims.map((a, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 40),
            Animated.timing(a, {
              toValue: 1.25,
              duration: 700 + (i % 7) * 120,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(a, {
              toValue: 0.75,
              duration: 700 + (i % 7) * 120,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        ),
      );
      pulseRef.current = Animated.parallel(stagger);
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
      pulseRef.current = null;
      barAnims.forEach((a) => a.setValue(1));
    }
  }, [isPlaying]);

  // ── Sync duration prop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (duration > 0) setTotalSecs(duration);
  }, [duration]);

  // ── Probe actual duration when prop arrives as 0 ─────────────────────────────
  useEffect(() => {
    if (duration > 0) return;
    let cancelled = false;
    let probe: Audio.Sound | null = null;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
        probe = sound;
        const status = await sound.getStatusAsync();
        if (!cancelled && status.isLoaded && status.durationMillis && status.durationMillis > 0) {
          setTotalSecs(Math.floor(status.durationMillis / 1000));
        }
        await sound.unloadAsync();
        probe = null;
      } catch {/* will show 0:00 until user presses play */}
    })();
    return () => {
      cancelled = true;
      probe?.unloadAsync().catch(() => {});
    };
  }, [uri, duration]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    pulseRef.current?.stop();
    soundRef.current?.unloadAsync().catch(() => {});
  }, []);

  // ── Playback helpers ─────────────────────────────────────────────────────────
  const loadAndPlay = async () => {
    try {
      setIsLoading(true);
      setHasError(false);
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, rate: SPEEDS[speedIdx] },
        (status) => {
          if (!status.isLoaded) return;
          setPositionSecs(Math.floor((status.positionMillis ?? 0) / 1000));
          if (status.durationMillis && status.durationMillis > 0)
            setTotalSecs(Math.floor(status.durationMillis / 1000));
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPositionSecs(0);
            soundRef.current?.unloadAsync().catch(() => {});
            soundRef.current = null;
          }
        },
      );
      soundRef.current = sound;
      setIsLoading(false);
      setIsPlaying(true);
    } catch {
      setIsLoading(false);
      setHasError(true);
    }
  };

  const togglePlay = async () => {
    try {
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
      if (!soundRef.current) {
        await loadAndPlay();
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {
      setIsLoading(false);
    }
  };

  const cycleSpeed = async () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    await soundRef.current?.setRateAsync(SPEEDS[next], true).catch(() => {});
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const clampedP   = totalSecs > 0 ? Math.max(0, Math.min(1, positionSecs / totalSecs)) : 0;
  const displayTime = formatDuration(isPlaying ? positionSecs : totalSecs);

  return (
    <Pressable
      delayLongPress={350}
      onLongPress={onLongPress}
      style={[s.bubble, isOwn ? s.bubbleRight : s.bubbleLeft]}
    >

      {/* ── Mic icon circle ──────────────────────────────────────────────── */}
      <View style={s.micCircle}>
        <Microphone size={14} color={T.ACCENT} weight="fill" />
      </View>

      {/* ── Waveform bars ────────────────────────────────────────────────── */}
      <View style={s.wave}>
        {BAR_HEIGHTS.map((baseH, i) => {
          const active = i / BAR_HEIGHTS.length <= clampedP;
          return (
            <Animated.View
              key={i}
              style={[
                s.bar,
                {
                  height: baseH,
                  transform: [{ scaleY: isPlaying && active ? barAnims[i] : 1 }],
                  backgroundColor: active ? T.ACCENT : 'rgba(255,255,255,0.15)',
                },
              ]}
            />
          );
        })}
      </View>

      {/* ── Duration — tap to cycle playback speed ───────────────────────── */}
      <TouchableOpacity onPress={cycleSpeed} hitSlop={8} activeOpacity={0.7}>
        <Text style={s.duration}>
          {displayTime}{speedIdx > 0 ? ` ${SPEEDS[speedIdx]}×` : ''}
        </Text>
      </TouchableOpacity>

      {/* ── Play / Pause button ──────────────────────────────────────────── */}
      <TouchableOpacity
        style={s.playBtn}
        onPress={hasError ? loadAndPlay : togglePlay}
        activeOpacity={0.8}
        disabled={isLoading}
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
      </TouchableOpacity>

    </Pressable>
  );
}

const s = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    width: 264,
    marginVertical: 1,
    // Hairline edge so the pill stays defined over custom image wallpapers.
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    ...T.SHADOWS.soft,
  },
  bubbleLeft:  { alignSelf: 'flex-start', marginLeft: 8 },
  bubbleRight: { alignSelf: 'flex-end',   marginRight: 8 },

  micCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
    flexShrink: 0,
    minWidth: 32,
    textAlign: 'right',
  },

  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    opacity: 0.7,
  },
});
