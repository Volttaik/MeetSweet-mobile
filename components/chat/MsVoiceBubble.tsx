/**
 * MsVoiceBubble — premium voice note player.
 *
 * Features:
 *  • Animated waveform bars that pulse during playback
 *  • Progress-aware bar coloring
 *  • Elapsed / total duration display
 *  • Speed selector (1× / 1.5× / 2×)
 *  • Smooth icon transition Play ↔ Pause
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Pause, Play } from 'phosphor-react-native';
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
  const [speedIdx,     setSpeedIdx]     = useState(0);
  const [isLoading,    setIsLoading]    = useState(false);
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

  useEffect(() => () => {
    pulseRef.current?.stop();
    soundRef.current?.unloadAsync().catch(() => {});
  }, []);

  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
      setIsLoading(true);
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, rate: SPEEDS[speedIdx] },
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
      } else {
        await soundRef.current.playAsync();
      }
      setIsLoading(false);
      setIsPlaying(true);
    } catch {
      setIsLoading(false);
    }
  };

  const cycleSpeed = async () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    await soundRef.current?.setRateAsync(SPEEDS[next], true).catch(() => {});
  };

  const isOwn    = position === 'right';
  const progress = duration > 0 ? positionSecs / duration : 0;

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
    <View style={[s.bubble, isOwn ? s.bubbleRight : s.bubbleLeft]}>

      {/* Play / Pause */}
      <TouchableOpacity onPress={togglePlayback} style={s.playBtn} activeOpacity={0.8} disabled={isLoading}>
        {/* Play icon (visible when idle) */}
        <Animated.View style={[StyleSheet.absoluteFill, s.iconCenter, { opacity: iconAnim.interpolate({ inputRange: [0,1], outputRange: [1,0] }) }]}>
          <Play size={14} color="#fff" weight="fill" />
        </Animated.View>
        {/* Pause icon (visible when playing) */}
        <Animated.View style={[StyleSheet.absoluteFill, s.iconCenter, { opacity: iconAnim }]}>
          <Pause size={14} color="#fff" weight="fill" />
        </Animated.View>
      </TouchableOpacity>

      {/* Waveform */}
      <View style={s.waveform}>
        {BARS.map((baseH, i) => {
          const active = i / BARS.length <= progress;
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

      {/* Duration + speed */}
      <View style={s.rightCol}>
        <Text style={[s.duration, isOwn ? s.durOwn : s.durOther]}>
          {formatDuration(isPlaying ? positionSecs : duration)}
        </Text>
        <TouchableOpacity onPress={cycleSpeed} hitSlop={8} activeOpacity={0.7}>
          <Text style={[s.speed, isOwn ? s.speedOwn : s.speedOther]}>
            {SPEEDS[speedIdx]}×
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    width: 250,
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
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexShrink: 0,
    position: 'relative',
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 26,
    overflow: 'hidden',
  },
  bar: {
    flex: 1,
    borderRadius: 1.5,
    minWidth: 2,
  },

  rightCol: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
    minWidth: 32,
  },
  duration: { fontSize: 10, fontFamily: T.FONT.medium },
  durOwn:   { color: 'rgba(255,255,255,0.6)' },
  durOther: { color: T.TEXT_2 },

  speed: { fontSize: 9, fontFamily: T.FONT.semibold, letterSpacing: 0.2 },
  speedOwn:   { color: 'rgba(255,255,255,0.35)' },
  speedOther: { color: T.TEXT_3 },
});
