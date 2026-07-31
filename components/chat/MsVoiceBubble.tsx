/**
 * MsVoiceBubble — compact voice note bubble.
 *
 * Single horizontal row:
 *   [PlayBtn] [Waveform flex:1] [Duration / Speed]
 *
 * 8px radius, dark-gray theme, no pink background.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Pause, Play } from 'phosphor-react-native';
import { Audio } from 'expo-av';
import { T } from '@/constants/theme';
import { formatDuration } from '@/types/chat-message';

const BG_OWN   = '#28282F';
const BG_OTHER = '#1C1C23';

// 18 bars — comfortable density
const BARS = Array.from({ length: 18 }, (_, i) =>
  3 + Math.abs(Math.sin(i * 1.7 + 0.5) * Math.cos(i * 0.9)) * 12,
);

const SPEEDS = [1, 1.5, 2];

interface Props {
  uri: string;
  duration: number; // seconds
  position: 'left' | 'right';
}

export function MsVoiceBubble({ uri, duration, position }: Props) {
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [positionSecs, setPositionSecs] = useState(0);
  const [speedIdx,     setSpeedIdx]     = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => () => { soundRef.current?.unloadAsync().catch(() => {}); }, []);

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
    } catch { /* ignore */ }
  };

  const cycleSpeed = async () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    await soundRef.current?.setRateAsync(SPEEDS[next], true).catch(() => {});
  };

  const isOwn    = position === 'right';
  const progress = duration > 0 ? positionSecs / duration : 0;

  return (
    <View style={[styles.bubble, isOwn ? styles.bubbleRight : styles.bubbleLeft]}>
      {/* ── Play / Pause ──────────────────────────────────────────────────── */}
      <TouchableOpacity onPress={togglePlayback} style={styles.playBtn} activeOpacity={0.8}>
        {isPlaying
          ? <Pause size={15} color="#fff" weight="fill" />
          : <Play  size={15} color="#fff" weight="fill" />
        }
      </TouchableOpacity>

      {/* ── Waveform (takes remaining width) ─────────────────────────────── */}
      <View style={styles.waveform}>
        {BARS.map((h, i) => {
          const active = i / BARS.length <= progress;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: h,
                  backgroundColor: active
                    ? (isOwn ? 'rgba(255,255,255,0.88)' : T.ACCENT)
                    : (isOwn ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.10)'),
                },
              ]}
            />
          );
        })}
      </View>

      {/* ── Duration + speed (stacked, right side) ────────────────────────── */}
      <View style={styles.rightCol}>
        <Text style={[styles.duration, isOwn ? styles.durationOwn : styles.durationOther]}>
          {formatDuration(isPlaying ? positionSecs : duration)}
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
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    // Fixed width so waveform has a stable flex:1 context
    width: 240,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
  },
  bar: {
    flex: 1,
    borderRadius: 1.5,
    minWidth: 2,
  },

  rightCol: {
    alignItems: 'flex-end',
    gap: 1,
    flexShrink: 0,
    minWidth: 30,
  },
  duration: {
    fontSize: 10,
    fontFamily: T.FONT.medium,
  },
  durationOwn:   { color: 'rgba(255,255,255,0.65)' },
  durationOther: { color: T.TEXT_2 },
  speed: {
    fontSize: 9,
    fontFamily: T.FONT.semibold,
    letterSpacing: 0.2,
  },
  speedOwn:   { color: 'rgba(255,255,255,0.40)' },
  speedOther: { color: T.TEXT_3 },
});
