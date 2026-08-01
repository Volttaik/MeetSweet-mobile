/**
 * MsVoiceBubble — premium voice note player.
 *
 * Features:
 *  • Animated waveform bars that pulse during playback
 *  • Progress-aware bar coloring
 *  • Seekable tap-on-progress-bar
 *  • Elapsed / total duration display
 *  • Speed selector (1× / 1.5× / 2×)
 *  • Smooth icon transition Play ↔ Pause
 *  • Skeleton while loading, error state with retry
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Pause, Play, ArrowClockwise } from 'phosphor-react-native';
import { Audio } from 'expo-av';
import { T } from '@/constants/theme';
import { formatDuration } from '@/types/chat-message';

const BG_OWN   = '#28282F';
const BG_OTHER = '#1C1C23';

const BARS   = Array.from({ length: 22 }, (_, i) =>
  3 + Math.abs(Math.sin(i * 1.7 + 0.5) * Math.cos(i * 0.9)) * 14,
);
const SPEEDS = [1, 1.5, 2] as const;

interface Props {
  uri:      string;
  duration: number; // seconds
  position: 'left' | 'right';
}

export function MsVoiceBubble({ uri, duration, position }: Props) {
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [positionSecs, setPositionSecs] = useState(0);
  const [totalSecs,    setTotalSecs]    = useState(duration);
  const [speedIdx,     setSpeedIdx]     = useState(0);
  const [isLoading,    setIsLoading]    = useState(false);
  const [hasError,     setHasError]     = useState(false);
  const [progressW,    setProgressW]    = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  // One Animated.Value per bar for the "active" pulse
  const barAnims = useRef(BARS.map(() => new Animated.Value(1))).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // Start / stop the waveform pulse animation
  useEffect(() => {
    if (isPlaying) {
      const stagger = barAnims.map((a, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 28),
            Animated.timing(a, {
              toValue: 1.55,
              duration: 350 + (i % 5) * 40,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(a, {
              toValue: 1,
              duration: 350 + (i % 5) * 40,
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

  useEffect(() => {
    if (duration > 0) setTotalSecs(duration);
  }, [duration]);

  useEffect(() => () => {
    pulseRef.current?.stop();
    soundRef.current?.unloadAsync().catch(() => {});
  }, []);

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
          const secs = Math.floor((status.positionMillis ?? 0) / 1000);
          setPositionSecs(secs);
          // Get actual duration from metadata if available
          if (status.durationMillis && status.durationMillis > 0) {
            setTotalSecs(Math.floor(status.durationMillis / 1000));
          }
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

  const togglePlayback = async () => {
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

  // Seek when user taps on the progress bar
  const handleProgressTap = async (e: GestureResponderEvent) => {
    if (progressW <= 0 || totalSecs <= 0) return;
    const ratio  = Math.max(0, Math.min(1, e.nativeEvent.locationX / progressW));
    const millis = Math.floor(ratio * totalSecs * 1000);
    setPositionSecs(Math.floor(millis / 1000));
    if (soundRef.current) {
      try { await soundRef.current.setPositionAsync(millis); } catch {/* */}
    } else {
      // Not loaded yet — load and seek
      try {
        setIsLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, positionMillis: millis },
          (status) => {
            if (!status.isLoaded) return;
            setPositionSecs(Math.floor((status.positionMillis ?? 0) / 1000));
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
      } catch {
        setIsLoading(false);
      }
    }
  };

  const isOwn    = position === 'right';
  const progress = totalSecs > 0 ? positionSecs / totalSecs : 0;
  const clampedP = Math.max(0, Math.min(1, progress));

  // Icon opacity for smooth Play ↔ Pause transition
  const iconAnim = useRef(new Animated.Value(isPlaying ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(iconAnim, {
      toValue: isPlaying ? 1 : 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [isPlaying]);

  return (
    <View
      style={[s.bubble, isOwn ? s.bubbleRight : s.bubbleLeft]}
      accessibilityLabel={`Voice message, ${formatDuration(totalSecs)}`}
      accessibilityRole="button"
    >
      {/* Play / Pause */}
      <TouchableOpacity
        onPress={hasError ? loadAndPlay : togglePlayback}
        style={[s.playBtn, hasError && s.playBtnError]}
        activeOpacity={0.8}
        disabled={isLoading}
        accessibilityLabel={isPlaying ? 'Pause voice message' : 'Play voice message'}
        accessibilityRole="button"
      >
        {hasError ? (
          <ArrowClockwise size={14} color="#fff" weight="bold" />
        ) : (
          <>
            <Animated.View style={[StyleSheet.absoluteFill, s.iconCenter, { opacity: iconAnim.interpolate({ inputRange: [0,1], outputRange: [1,0] }) }]}>
              <Play size={14} color="#fff" weight="fill" />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, s.iconCenter, { opacity: iconAnim }]}>
              <Pause size={14} color="#fff" weight="fill" />
            </Animated.View>
          </>
        )}
      </TouchableOpacity>

      {/* Right: waveform + progress bar + meta */}
      <View style={s.content}>
        {/* Waveform bars */}
        <View style={s.waveform}>
          {BARS.map((baseH, i) => {
            const active = i / BARS.length <= clampedP;
            return (
              <Animated.View
                key={i}
                style={[
                  s.bar,
                  {
                    height: baseH,
                    transform: [{ scaleY: isPlaying && active ? barAnims[i] : 1 }],
                    backgroundColor: active
                      ? (isOwn ? 'rgba(255,255,255,0.88)' : T.ACCENT)
                      : (isOwn ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)'),
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Seekable progress bar */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleProgressTap}
          onLayout={(e: LayoutChangeEvent) => setProgressW(e.nativeEvent.layout.width)}
          style={s.progressTrack}
          accessibilityLabel="Seek audio"
        >
          <View
            style={[
              s.progressFill,
              {
                width: `${Math.round(clampedP * 100)}%`,
                backgroundColor: isOwn ? 'rgba(255,255,255,0.72)' : T.ACCENT,
              },
            ]}
          />
        </TouchableOpacity>

        {/* Meta row: elapsed + speed */}
        <View style={s.metaRow}>
          <Text style={[s.duration, isOwn ? s.durOwn : s.durOther]}>
            {formatDuration(isPlaying ? positionSecs : 0)}{' '}
            <Text style={[s.totalDur, isOwn ? s.durOwn : s.durOther]}>
              / {formatDuration(totalSecs)}
            </Text>
          </Text>
          <TouchableOpacity onPress={cycleSpeed} hitSlop={8} activeOpacity={0.7}>
            <Text style={[s.speed, isOwn ? s.speedOwn : s.speedOther]}>
              {SPEEDS[speedIdx]}×
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: 268,
    marginVertical: 1,
  },
  bubbleLeft: {
    backgroundColor: BG_OTHER,
    alignSelf: 'flex-start',
    marginLeft: 8,
    borderBottomLeftRadius: 3,
  },
  bubbleRight: {
    backgroundColor: BG_OWN,
    alignSelf: 'flex-end',
    marginRight: 8,
    borderBottomRightRadius: 3,
  },

  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.14)',
    flexShrink: 0,
    position: 'relative',
    marginTop: 4,
  },
  playBtnError: { backgroundColor: 'rgba(239,68,68,0.22)' },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    flex: 1,
    gap: 5,
  },

  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 24,
    overflow: 'hidden',
  },
  bar: {
    flex: 1,
    borderRadius: 1.5,
    minWidth: 2,
  },

  // Seekable progress bar
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    minWidth: 4,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  duration:  { fontSize: 10, fontFamily: T.FONT.medium },
  totalDur:  { fontSize: 10, fontFamily: T.FONT.regular },
  durOwn:    { color: 'rgba(255,255,255,0.55)' },
  durOther:  { color: T.TEXT_2 },

  speed:       { fontSize: 9, fontFamily: T.FONT.semibold, letterSpacing: 0.2 },
  speedOwn:   { color: 'rgba(255,255,255,0.35)' },
  speedOther: { color: T.TEXT_3 },
});
