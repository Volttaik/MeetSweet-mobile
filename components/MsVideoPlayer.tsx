/**
 * MsVideoPlayer — fullscreen video player.
 * Features: play/pause, seek bar, time display, double-tap ±10s, landscape support.
 * Audio plays only in this expanded view.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { ArrowLeft, Play, Pause, ArrowCounterClockwise, ArrowClockwise } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/constants/theme';

const SEEK_SECONDS = 10;

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  visible: boolean;
  uri: string;
  onClose: () => void;
}

export function MsVideoPlayer({ visible, uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);

  // Double-tap indicators
  const rewindOpacity = useSharedValue(0);
  const forwardOpacity = useSharedValue(0);
  const rewindScale = useSharedValue(1);
  const forwardScale = useSharedValue(1);

  // Auto-hide controls after 3s
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying) setControlsVisible(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    if (!visible) {
      videoRef.current?.pauseAsync().catch(() => {});
      setIsPlaying(false);
      setPosition(0);
      setControlsVisible(true);
    } else {
      resetHideTimer();
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: any) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying ?? false);
    setIsBuffering(status.isBuffering ?? false);
    if (!isSeeking) setPosition(status.positionMillis ?? 0);
    if (status.durationMillis) setDuration(status.durationMillis);
    if (status.didJustFinish) {
      setIsPlaying(false);
      setControlsVisible(true);
    }
  }, [isSeeking]);

  const togglePlay = useCallback(async () => {
    resetHideTimer();
    if (isPlaying) {
      await videoRef.current?.pauseAsync();
    } else {
      await videoRef.current?.playAsync();
    }
  }, [isPlaying, resetHideTimer]);

  const seek = useCallback(async (ms: number) => {
    const clamped = Math.max(0, Math.min(ms, duration));
    setPosition(clamped);
    await videoRef.current?.setPositionAsync(clamped);
  }, [duration]);

  const onScrubStart = useCallback(() => {
    setIsSeeking(true);
    resetHideTimer();
  }, [resetHideTimer]);

  const onScrubEnd = useCallback(async (ratio: number) => {
    setIsSeeking(false);
    const ms = ratio * duration;
    await seek(ms);
  }, [duration, seek]);

  // Double-tap tracking
  const tapCountRef = useRef(0);
  const tapSideRef = useRef<'left' | 'right'>('left');
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSeekIndicator = useCallback((side: 'left' | 'right') => {
    const opacityAnim = side === 'left' ? rewindOpacity : forwardOpacity;
    const scaleAnim = side === 'left' ? rewindScale : forwardScale;
    opacityAnim.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(1, { duration: 600 }),
      withTiming(0, { duration: 200 }),
    );
    scaleAnim.value = withSequence(
      withTiming(1.3, { duration: 150 }),
      withTiming(1, { duration: 200 }),
    );
  }, []);

  const handleTap = useCallback((side: 'left' | 'right') => {
    resetHideTimer();
    if (tapSideRef.current !== side) {
      tapCountRef.current = 0;
    }
    tapSideRef.current = side;
    tapCountRef.current += 1;

    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(async () => {
      if (tapCountRef.current >= 2) {
        const delta = SEEK_SECONDS * 1000 * (side === 'left' ? -1 : 1);
        await seek(position + delta);
        showSeekIndicator(side);
      } else {
        togglePlay();
      }
      tapCountRef.current = 0;
    }, 220);
  }, [position, seek, showSeekIndicator, togglePlay, resetHideTimer]);

  // Seek bar scrubbing
  const scrubBarRef = useRef<View>(null);
  const screenWidth = Dimensions.get('window').width;

  const rewindStyle = useAnimatedStyle(() => ({
    opacity: rewindOpacity.value,
    transform: [{ scale: rewindScale.value }],
  }));
  const forwardStyle = useAnimatedStyle(() => ({
    opacity: forwardOpacity.value,
    transform: [{ scale: forwardScale.value }],
  }));

  const progress = duration > 0 ? position / duration : 0;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.root}>
        <StatusBar hidden />

        {/* Video */}
        <Video
          ref={videoRef}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={visible}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          useNativeControls={false}
        />

        {/* Left tap zone */}
        <Pressable
          style={styles.halfLeft}
          onPress={() => handleTap('left')}
        />

        {/* Right tap zone */}
        <Pressable
          style={styles.halfRight}
          onPress={() => handleTap('right')}
        />

        {/* Seek indicators */}
        <Animated.View style={[styles.seekIndicator, styles.seekIndicatorLeft, rewindStyle]} pointerEvents="none">
          <ArrowCounterClockwise size={28} color="#fff" weight="bold" />
          <Text style={styles.seekText}>{SEEK_SECONDS}s</Text>
        </Animated.View>
        <Animated.View style={[styles.seekIndicator, styles.seekIndicatorRight, forwardStyle]} pointerEvents="none">
          <ArrowClockwise size={28} color="#fff" weight="bold" />
          <Text style={styles.seekText}>{SEEK_SECONDS}s</Text>
        </Animated.View>

        {/* Buffering indicator */}
        {isBuffering && !controlsVisible && (
          <View style={styles.bufferingWrap} pointerEvents="none">
            <View style={styles.bufferingDot} />
          </View>
        )}

        {/* Controls overlay */}
        {controlsVisible && (
          <View style={styles.controls}>
            {/* Top bar */}
            <View style={[styles.topBar, { paddingTop: insets.top + (Platform.OS === 'android' ? 20 : 8) }]}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <ArrowLeft size={22} color="#fff" weight="bold" />
              </TouchableOpacity>
            </View>

            {/* Centre play/pause */}
            <TouchableOpacity style={styles.centreBtn} onPress={togglePlay} activeOpacity={0.8}>
              {isBuffering ? (
                <View style={styles.bufferingRing} />
              ) : isPlaying ? (
                <Pause size={32} color="#fff" weight="fill" />
              ) : (
                <Play size={32} color="#fff" weight="fill" />
              )}
            </TouchableOpacity>

            {/* Bottom controls */}
            <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>

              {/* Seek bar */}
              <View
                ref={scrubBarRef}
                style={styles.scrubTrack}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(e) => {
                  onScrubStart();
                  const ratio = e.nativeEvent.locationX / (screenWidth - 80 - 16);
                  setPosition(ratio * duration);
                }}
                onResponderMove={(e) => {
                  const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / (screenWidth - 80 - 16)));
                  setPosition(ratio * duration);
                }}
                onResponderRelease={(e) => {
                  const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / (screenWidth - 80 - 16)));
                  onScrubEnd(ratio);
                }}
              >
                <View style={[styles.scrubFill, { width: `${progress * 100}%` }]} />
                <View style={[styles.scrubThumb, { left: `${progress * 100}%` as any }]} />
              </View>

              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  halfLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '50%',
    bottom: 0,
  },
  halfRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '50%',
    bottom: 0,
  },

  seekIndicator: {
    position: 'absolute',
    top: '45%',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    pointerEvents: 'none',
  },
  seekIndicatorLeft: { left: 24 },
  seekIndicatorRight: { right: 24 },
  seekText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 13,
  },

  bufferingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bufferingDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    borderTopColor: '#fff',
  },
  bufferingRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
  },

  controls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  topBar: {
    paddingHorizontal: 16,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreBtn: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  timeText: {
    color: '#fff',
    fontFamily: T.FONT.medium,
    fontSize: 12,
    minWidth: 36,
    textAlign: 'center',
  },
  scrubTrack: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  scrubFill: {
    height: 3,
    backgroundColor: T.ACCENT,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -1.5,
  },
  scrubThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    top: '50%',
    marginTop: -7,
    marginLeft: -7,
  },
});
