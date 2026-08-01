/**
 * MsVoiceBubble — premium audio message player.
 *
 * Visual spec:
 *  • Gradient card background
 *  • Left-aligned circular play/pause button with ripple
 *  • Duration timer (MM:SS, bold, center)
 *  • Animated waveform bars reacting to playback
 *  • Full-width seekable progress bar
 *  • File size badge bottom-right
 *  • 5px rounded corners, soft shadow, 12/16 padding
 *
 * States: loading (shimmer) | ready | playing (waveform animated) | paused | error (retry)
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

// ─── Colours ──────────────────────────────────────────────────────────────────
const BG_OWN_TOP    = '#2E2E38';
const BG_OWN_BOT    = '#23232C';
const BG_OTHER_TOP  = '#1E1E27';
const BG_OTHER_BOT  = '#16161E';

const BARS = Array.from({ length: 26 }, (_, i) =>
  5 + Math.abs(Math.sin(i * 1.7 + 0.5) * Math.cos(i * 0.9)) * 18,
);
const SPEEDS = [1, 1.5, 2] as const;

function fmtBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  uri:       string;
  duration:  number; // seconds
  position:  'left' | 'right';
  fileSize?: number; // bytes
}

export function MsVoiceBubble({ uri, duration, position, fileSize }: Props) {
  const isOwn = position === 'right';

  const [isPlaying,    setIsPlaying]    = useState(false);
  const [positionSecs, setPositionSecs] = useState(0);
  const [totalSecs,    setTotalSecs]    = useState(duration);
  const [speedIdx,     setSpeedIdx]     = useState(0);
  const [isLoading,    setIsLoading]    = useState(false);
  const [hasError,     setHasError]     = useState(false);
  const [progressW,    setProgressW]    = useState(0);

  const soundRef  = useRef<Audio.Sound | null>(null);
  const barAnims  = useRef(BARS.map(() => new Animated.Value(1))).current;
  const pulseRef  = useRef<Animated.CompositeAnimation | null>(null);
  const iconAnim  = useRef(new Animated.Value(0)).current;
  const rippleAnim = useRef(new Animated.Value(0)).current;

  // Waveform animation
  useEffect(() => {
    if (isPlaying) {
      const stagger = barAnims.map((a, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 22),
            Animated.timing(a, {
              toValue: 1.6,
              duration: 320 + (i % 5) * 45,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(a, {
              toValue: 0.5,
              duration: 320 + (i % 5) * 45,
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

  // Icon crossfade
  useEffect(() => {
    Animated.timing(iconAnim, {
      toValue: isPlaying ? 1 : 0,
      duration: 130,
      useNativeDriver: true,
    }).start();
  }, [isPlaying]);

  useEffect(() => {
    if (duration > 0) setTotalSecs(duration);
  }, [duration]);

  useEffect(() => () => {
    pulseRef.current?.stop();
    soundRef.current?.unloadAsync().catch(() => {});
  }, []);

  // Ripple on play press
  const triggerRipple = () => {
    rippleAnim.setValue(0);
    Animated.timing(rippleAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

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
    triggerRipple();
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

  const handleProgressTap = async (e: GestureResponderEvent) => {
    if (progressW <= 0 || totalSecs <= 0) return;
    const ratio  = Math.max(0, Math.min(1, e.nativeEvent.locationX / progressW));
    const millis = Math.floor(ratio * totalSecs * 1000);
    setPositionSecs(Math.floor(millis / 1000));
    if (soundRef.current) {
      try { await soundRef.current.setPositionAsync(millis); } catch {/* */}
    } else {
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

  const progress  = totalSecs > 0 ? positionSecs / totalSecs : 0;
  const clampedP  = Math.max(0, Math.min(1, progress));
  const fileSizeLabel = fmtBytes(fileSize);

  // Colours
  const accentColor  = isOwn ? 'rgba(255,255,255,0.9)' : T.ACCENT;
  const dimColor     = isOwn ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)';
  const playBtnBg    = isOwn ? 'rgba(255,255,255,0.16)' : `${T.ACCENT}28`;
  const playIconColor= isOwn ? '#FFFFFF' : T.ACCENT;

  return (
    <View
      style={[
        s.bubble,
        isOwn ? s.bubbleRight : s.bubbleLeft,
        T.SHADOWS.medium,
      ]}
      accessibilityLabel={`Voice message, ${formatDuration(totalSecs)}`}
      accessibilityRole="button"
    >
      {/* Gradient-like layered background */}
      <View style={[StyleSheet.absoluteFill, s.bgLayer, {
        backgroundColor: isOwn ? BG_OWN_TOP : BG_OTHER_TOP,
        opacity: 0.6,
      }]} />
      <View style={[StyleSheet.absoluteFill, s.bgLayerBottom, {
        backgroundColor: isOwn ? BG_OWN_BOT : BG_OTHER_BOT,
      }]} />

      {/* Play/Pause button */}
      <View style={s.playBtnWrap}>
        {/* Ripple */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            s.ripple,
            {
              borderColor: accentColor,
              opacity: rippleAnim.interpolate({ inputRange: [0,1], outputRange: [0.4, 0] }),
              transform: [{ scale: rippleAnim.interpolate({ inputRange: [0,1], outputRange: [0.7, 1.6] }) }],
            },
          ]}
          pointerEvents="none"
        />
        <TouchableOpacity
          onPress={hasError ? loadAndPlay : togglePlayback}
          style={[s.playBtn, { backgroundColor: playBtnBg }]}
          activeOpacity={0.75}
          disabled={isLoading}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          accessibilityRole="button"
        >
          {hasError ? (
            <ArrowClockwise size={17} color={T.ERROR} weight="bold" />
          ) : isLoading ? (
            <View style={s.loadingDots}>
              {[0,1,2].map((i) => (
                <View key={i} style={[s.dot, { backgroundColor: playIconColor, opacity: 0.5 + i * 0.2 }]} />
              ))}
            </View>
          ) : (
            <>
              <Animated.View style={[StyleSheet.absoluteFill, s.iconCenter, { opacity: iconAnim.interpolate({ inputRange: [0,1], outputRange: [1,0] }) }]}>
                <Play size={18} color={playIconColor} weight="fill" />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, s.iconCenter, { opacity: iconAnim }]}>
                <Pause size={18} color={playIconColor} weight="fill" />
              </Animated.View>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Right: waveform + timer + progress + meta */}
      <View style={s.content}>
        {/* Timer — bold, centered */}
        <Text style={[s.timer, { color: isOwn ? 'rgba(255,255,255,0.85)' : T.TEXT }]}>
          {formatDuration(isPlaying ? positionSecs : totalSecs)}
        </Text>

        {/* Waveform */}
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
                    backgroundColor: active ? accentColor : dimColor,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Progress bar */}
        <TouchableOpacity
          activeOpacity={1}
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
                backgroundColor: accentColor,
              },
            ]}
          />
        </TouchableOpacity>

        {/* Meta row: speed + file size */}
        <View style={s.metaRow}>
          <TouchableOpacity onPress={cycleSpeed} hitSlop={8} activeOpacity={0.7}>
            <Text style={[s.speed, { color: isOwn ? 'rgba(255,255,255,0.4)' : T.TEXT_3 }]}>
              {SPEEDS[speedIdx]}×
            </Text>
          </TouchableOpacity>
          {fileSizeLabel ? (
            <View style={[s.sizeBadge, { backgroundColor: isOwn ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)' }]}>
              <Text style={[s.sizeLabel, { color: isOwn ? 'rgba(255,255,255,0.32)' : T.TEXT_3 }]}>
                {fileSizeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: 280,
    marginVertical: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  bgLayer:       { borderRadius: 14 },
  bgLayerBottom: { borderRadius: 14 },
  bubbleLeft: {
    alignSelf: 'flex-start',
    marginLeft: 8,
    borderBottomLeftRadius: 5,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    marginRight: 8,
    borderBottomRightRadius: 5,
  },

  playBtnWrap: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    borderRadius: 24,
    borderWidth: 2,
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  content: {
    flex: 1,
    gap: 6,
  },

  timer: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    letterSpacing: 0.2,
    textAlign: 'center',
  },

  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 28,
    overflow: 'hidden',
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minWidth: 2,
  },

  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
  speed: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    letterSpacing: 0.3,
  },
  sizeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sizeLabel: {
    fontSize: 9,
    fontFamily: T.FONT.medium,
    letterSpacing: 0.2,
  },
});
