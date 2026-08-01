/**
 * MsVoiceNoteBubble — chat bubble matching the VoiceCompactBar preview design.
 *
 * Design: Microphone icon pill · waveform bars · duration · play/pause
 * States: ready | playing | paused | error
 * Shows a download/share button for the receiver only (showDownload=true).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { DownloadSimple, Microphone, Pause, Play } from 'phosphor-react-native';
import { Audio } from 'expo-av';
import { T } from '@/constants/theme';

// ─── Waveform profile ─────────────────────────────────────────────────────────

const BAR_HEIGHTS = [5,9,14,8,12,16,7,10,13,6,15,9,11,14,8,12,7,10,5,13,9,14,6,11,15,8,12,7,10,13];
const NUM_BARS    = 26;

interface Props {
  uri:          string;
  duration:     number; // seconds
  isOwn:        boolean;
  showDownload?: boolean; // true for receiver only
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function MsVoiceNoteBubble({ uri, duration, isOwn, showDownload }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position,  setPosition]  = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError,  setHasError]  = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Animated waveform bars (play → animate, else static)
  const barAnims = useRef(BAR_HEIGHTS.map(() => new Animated.Value(1))).current;
  const loopRef  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isPlaying) {
      const animations = barAnims.map((a, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 16),
            Animated.timing(a, {
              toValue: 1.8,
              duration: 300 + (i % 5) * 35,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(a, {
              toValue: 0.4,
              duration: 300 + (i % 5) * 35,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        ),
      );
      loopRef.current = Animated.parallel(animations);
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      loopRef.current = null;
      barAnims.forEach((a) => a.setValue(1));
    }
  }, [isPlaying]);

  useEffect(() => () => {
    loopRef.current?.stop();
    soundRef.current?.unloadAsync().catch(() => {});
  }, []);

  const togglePlay = useCallback(async () => {
    if (hasError) {
      setHasError(false);
    }
    try {
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
      if (!soundRef.current) {
        setIsLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setPosition(Math.floor((status.positionMillis ?? 0) / 1000));
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPosition(0);
              soundRef.current?.unloadAsync().catch(() => {});
              soundRef.current = null;
            }
          },
        );
        soundRef.current = sound;
        setIsLoading(false);
        setIsPlaying(true);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {
      setIsLoading(false);
      setHasError(true);
    }
  }, [isPlaying, hasError, uri]);

  const handleDownload = useCallback(async () => {
    try {
      await Share.share({ url: uri, message: uri });
    } catch {/* user cancelled */}
  }, [uri]);

  const progress    = duration > 0 && position > 0 ? position / duration : 0;
  const displayTime = fmt(isPlaying ? position : duration);

  // Colours: sender = accent-tinted, receiver = surface-tinted
  const bubbleBg    = isOwn ? `${T.ACCENT}18` : T.SURFACE;
  const iconBg      = `${T.ACCENT}22`;
  const accentColor = T.ACCENT;
  const dimBarColor = 'rgba(255,255,255,0.15)';

  return (
    <View
      style={[
        s.bubble,
        isOwn ? s.bubbleRight : s.bubbleLeft,
        { backgroundColor: bubbleBg },
      ]}
      accessibilityLabel={`Voice message, ${displayTime}`}
    >
      {/* Mic icon */}
      <View style={[s.micIcon, { backgroundColor: iconBg }]}>
        <Microphone size={14} color={accentColor} weight="fill" />
      </View>

      {/* Waveform */}
      <View style={s.waveWrap}>
        {BAR_HEIGHTS.slice(0, NUM_BARS).map((baseH, i) => {
          const filled = i / NUM_BARS <= progress;
          return (
            <Animated.View
              key={i}
              style={[
                s.bar,
                {
                  height: baseH,
                  transform: [{ scaleY: isPlaying && filled ? barAnims[i] : 1 }],
                  backgroundColor: filled ? accentColor : dimBarColor,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Duration */}
      <Text style={s.duration}>{displayTime}</Text>

      {/* Download — receiver only */}
      {showDownload && (
        <TouchableOpacity
          style={s.downloadBtn}
          onPress={handleDownload}
          activeOpacity={0.7}
          accessibilityLabel="Save voice note"
        >
          <DownloadSimple size={14} color={T.TEXT_3} weight="regular" />
        </TouchableOpacity>
      )}

      {/* Play / pause */}
      <TouchableOpacity
        style={[s.playBtn, { backgroundColor: accentColor }]}
        onPress={togglePlay}
        activeOpacity={0.8}
        disabled={isLoading}
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      >
        {isLoading ? (
          <View style={s.loadingDot} />
        ) : isPlaying ? (
          <Pause size={13} color="#fff" weight="fill" />
        ) : (
          <Play size={13} color="#fff" weight="fill" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bubble: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderRadius:   T.RADIUS?.pill ?? 24,
    width:          268,
    marginVertical: 1,
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    marginRight: 8,
  },

  micIcon: {
    width:          28,
    height:         28,
    borderRadius:   14,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },

  waveWrap: {
    flex:         1,
    flexDirection: 'row',
    alignItems:   'center',
    gap:           2,
    height:        20,
    overflow:      'hidden',
  },
  bar: {
    width:        2.5,
    borderRadius: 2,
    minHeight:    3,
  },

  duration: {
    fontSize:     11,
    fontFamily:   T.FONT.semibold,
    color:        T.TEXT_2,
    flexShrink:   0,
    minWidth:     32,
    textAlign:    'right',
  },

  downloadBtn: {
    width:          24,
    height:         24,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },

  playBtn: {
    width:          26,
    height:         26,
    borderRadius:   13,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },

  loadingDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
