/**
 * MsVoiceBubble — pill-shaped voice note with waveform, playback, speed.
 * Used in chat bubbles for audio/voice messages.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Pause, Play, SpeakerHigh } from 'phosphor-react-native';
import { Audio } from 'expo-av';
import { T } from '@/constants/theme';
import { formatDuration } from '@/types/chat-message';

// Pre-computed waveform bar heights (22 bars)
const VOICE_BARS = Array.from({ length: 22 }, (_, i) =>
  4 + Math.abs(Math.sin(i * 1.7 + 0.5) * Math.cos(i * 0.9)) * 14,
);

const SPEEDS = [1, 1.5, 2];

interface Props {
  uri: string;
  duration: number; // seconds
  position: 'left' | 'right';
}

export function MsVoiceBubble({ uri, duration, position }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position_secs, setPositionSecs] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
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
      setIsPlaying(true);
    } catch {
      // ignore
    }
  };

  const cycleSpeed = async () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (soundRef.current) {
      await soundRef.current.setRateAsync(SPEEDS[next], true).catch(() => {});
    }
  };

  const isOwn = position === 'right';
  const progress = duration > 0 ? position_secs / duration : 0;

  return (
    <View
      style={[
        styles.bubble,
        isOwn ? styles.bubbleRight : styles.bubbleLeft,
      ]}
    >
      {/* Play/Pause */}
      <TouchableOpacity onPress={togglePlayback} style={styles.playBtn} activeOpacity={0.8}>
        {isPlaying ? (
          <Pause size={18} color="#fff" weight="fill" />
        ) : (
          <Play size={18} color="#fff" weight="fill" />
        )}
      </TouchableOpacity>

      {/* Waveform */}
      <View style={styles.waveform}>
        {VOICE_BARS.map((h, i) => {
          const isActive = i / VOICE_BARS.length <= progress;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: h,
                  backgroundColor: isActive
                    ? isOwn ? 'rgba(255,255,255,0.95)' : T.ACCENT
                    : isOwn ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
                },
              ]}
            />
          );
        })}
      </View>

      {/* Duration + speed */}
      <View style={styles.rightCol}>
        <Text style={[styles.duration, isOwn ? styles.durationOwn : styles.durationOther]}>
          {formatDuration(isPlaying ? position_secs : duration)}
        </Text>
        <TouchableOpacity onPress={cycleSpeed} hitSlop={8} activeOpacity={0.7}>
          <Text style={[styles.speed, isOwn ? styles.speedOwn : styles.speedOther]}>
            {SPEEDS[speedIdx]}×
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 280,
    marginVertical: 2,
  },
  bubbleLeft: {
    backgroundColor: T.SURFACE_2,
    alignSelf: 'flex-start',
    marginLeft: 8,
    borderBottomLeftRadius: 8,
  },
  bubbleRight: {
    backgroundColor: T.ACCENT,
    alignSelf: 'flex-end',
    marginRight: 8,
    borderBottomRightRadius: 8,
  },

  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 28,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minWidth: 2,
  },

  rightCol: {
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  duration: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
  },
  durationOwn: { color: 'rgba(255,255,255,0.8)' },
  durationOther: { color: T.TEXT_2 },
  speed: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    letterSpacing: 0.3,
  },
  speedOwn: { color: 'rgba(255,255,255,0.65)' },
  speedOther: { color: T.TEXT_3 },
});
