/**
 * MsVideoPlayer — fullscreen video player.
 *
 * Features:
 * - Play/Pause, Replay, Skip ±10s
 * - Draggable seek bar with time display
 * - Double-tap left/right to skip ±10s (ripple animation)
 * - Single-tap to toggle controls; auto-hide after 3s while playing
 * - Playback speed selector: 0.25×–2× (setRateAsync with pitch correction)
 * - Long press → 2× speed while held, release to restore
 * - Pinch-to-zoom → toggle CONTAIN ↔ COVER resize modes
 * - Buffering ring on centre button + subtle scrubber indicator
 * - Poster frame prevents black flash while buffering
 * - Landscape / portrait orientation support
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  GestureResponderEvent,
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
import {
  ArrowLeft,
  Play,
  Pause,
  ArrowCounterClockwise,
  ArrowClockwise,
  Gauge,
  ArrowsOut,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/constants/theme';
import { MsMediaLoader, MsMediaState, type MediaLoadState } from '@/components/MsMediaLoader';

const SEEK_SECONDS = 10;
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
type SpeedOption = typeof SPEED_OPTIONS[number];

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  visible: boolean;
  uri: string;
  posterUri?: string | null;
  onClose: () => void;
}

export function MsVideoPlayer({ visible, uri, posterUri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [mediaState, setMediaState] = useState<MediaLoadState>('loading');
  const [videoAttempt, setVideoAttempt] = useState(0);

  // Speed
  const [speed, setSpeed] = useState<SpeedOption>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedBeforeLongPress = useRef<SpeedOption>(1);
  const isLongPressingRef = useRef(false);

  // Resize mode toggle (pinch-to-zoom substitute on web/touch)
  const [resizeMode, setResizeMode] = useState<ResizeMode>(ResizeMode.CONTAIN);

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
      setMediaState('loading');
      setVideoAttempt((attempt) => attempt + 1);
      setShowSpeedMenu(false);
      setSpeed(1);
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

  const applySpeed = useCallback(async (s: SpeedOption) => {
    try {
      await videoRef.current?.setRateAsync(s, true); // shouldCorrectPitch: true
    } catch (_) {}
  }, []);

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

  const skip = useCallback(async (seconds: number) => {
    resetHideTimer();
    await seek(position + seconds * 1000);
  }, [position, resetHideTimer, seek]);

  const onScrubStart = useCallback(() => {
    setIsSeeking(true);
    resetHideTimer();
  }, [resetHideTimer]);

  const onScrubEnd = useCallback(async (ratio: number) => {
    setIsSeeking(false);
    await seek(ratio * duration);
  }, [duration, seek]);

  const selectSpeed = useCallback(async (s: SpeedOption) => {
    setSpeed(s);
    setShowSpeedMenu(false);
    resetHideTimer();
    await applySpeed(s);
  }, [applySpeed, resetHideTimer]);

  // Long-press → 2× speed while held.
  // Guard: onPress fires after onPressOut in RN, so keep ref true until after
  // onPress has a chance to read it, then clear it asynchronously.
  const handleCentreLongPress = useCallback(async () => {
    if (isLongPressingRef.current) return;
    isLongPressingRef.current = true;
    speedBeforeLongPress.current = speed;
    await applySpeed(2);
  }, [applySpeed, speed]);

  const handleCentrePressOut = useCallback(async () => {
    if (!isLongPressingRef.current) return;
    await applySpeed(speedBeforeLongPress.current);
    // Defer the ref clear so onPress (which fires after onPressOut) can still
    // read isLongPressingRef.current === true and bail out of togglePlay.
    setTimeout(() => { isLongPressingRef.current = false; }, 80);
  }, [applySpeed]);

  // Separate press handler: skips togglePlay when a long-press just finished.
  const handleCentrePress = useCallback(() => {
    if (isLongPressingRef.current) return;
    togglePlay();
  }, [togglePlay]);

  // Pinch-to-zoom: toggle resize mode
  const pinchStartDistRef = useRef<number | null>(null);
  const handleVideoTouchStart = useCallback((e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 2) {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);
  const handleVideoTouchEnd = useCallback((e: GestureResponderEvent) => {
    const touches = e.nativeEvent.changedTouches;
    if (pinchStartDistRef.current !== null && touches.length >= 1) {
      // Simple toggle on 2-finger interaction end
      setResizeMode((prev) =>
        prev === ResizeMode.CONTAIN ? ResizeMode.COVER : ResizeMode.CONTAIN,
      );
      pinchStartDistRef.current = null;
    }
  }, []);

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
      } else if (!controlsVisible) {
        setControlsVisible(true);
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
      <View
        style={styles.root}
        onStartShouldSetResponder={() => false}
        onTouchStart={handleVideoTouchStart}
        onTouchEnd={handleVideoTouchEnd}
      >
        <StatusBar hidden />

        {/* Poster stays behind the stream, preventing a black flash while it buffers. */}
        {posterUri && (
          <MsMediaLoader
            uri={posterUri}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibleLabel="Video poster"
          />
        )}
        <Video
          key={`${uri}:${videoAttempt}`}
          ref={videoRef}
          source={{ uri }}
          style={[
            StyleSheet.absoluteFill,
            { opacity: mediaState === 'success' ? 1 : 0 },
          ]}
          resizeMode={resizeMode}
          shouldPlay={visible}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          useNativeControls={false}
          onReadyForDisplay={() => setMediaState('success')}
          onError={() => setMediaState('error')}
        />
        <MsMediaState
          state={mediaState}
          onRetry={() => {
            setMediaState('loading');
            setVideoAttempt((attempt) => attempt + 1);
          }}
        />

        {/* Left tap zone */}
        <Pressable style={styles.halfLeft} onPress={() => handleTap('left')} />
        {/* Right tap zone */}
        <Pressable style={styles.halfRight} onPress={() => handleTap('right')} />

        {/* Seek indicators */}
        <Animated.View style={[styles.seekIndicator, styles.seekIndicatorLeft, rewindStyle]} pointerEvents="none">
          <ArrowCounterClockwise size={28} color="#fff" weight="bold" />
          <Text style={styles.seekText}>{SEEK_SECONDS}s</Text>
        </Animated.View>
        <Animated.View style={[styles.seekIndicator, styles.seekIndicatorRight, forwardStyle]} pointerEvents="none">
          <ArrowClockwise size={28} color="#fff" weight="bold" />
          <Text style={styles.seekText}>{SEEK_SECONDS}s</Text>
        </Animated.View>

        {/* Always-visible buffering indicator (subtle dot on scrubber when controls hidden) */}
        {isBuffering && !controlsVisible && (
          <View style={styles.bufferingWrap} pointerEvents="none">
            <View style={styles.bufferingDot} />
          </View>
        )}

        {/* Speed overlay menu — backdrop first (behind), menu second (on top) */}
        {showSpeedMenu && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Backdrop: closes the menu on tap outside */}
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setShowSpeedMenu(false)}
            />
            {/* Menu: rendered after backdrop so it sits on top and receives touches */}
            <View style={styles.speedMenuContainer} pointerEvents="box-none">
              <View style={styles.speedMenu}>
                <Text style={styles.speedMenuTitle}>Playback speed</Text>
                {SPEED_OPTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.speedOption, s === speed && styles.speedOptionActive]}
                    onPress={() => selectSpeed(s)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.speedLabel, s === speed && styles.speedLabelActive]}>
                      {s === 1 ? 'Normal' : `${s}×`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Controls overlay */}
        {controlsVisible && !showSpeedMenu && (
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

              <View style={styles.topRight}>
                {/* Resize mode toggle */}
                <TouchableOpacity
                  style={styles.topIconBtn}
                  onPress={() =>
                    setResizeMode((prev) =>
                      prev === ResizeMode.CONTAIN ? ResizeMode.COVER : ResizeMode.CONTAIN,
                    )
                  }
                  hitSlop={10}
                  accessibilityLabel="Toggle fit / fill"
                >
                  <ArrowsOut size={18} color="#fff" weight="bold" />
                </TouchableOpacity>

                {/* Speed button */}
                <TouchableOpacity
                  style={styles.speedBtn}
                  onPress={() => {
                    setShowSpeedMenu(true);
                    resetHideTimer();
                  }}
                  hitSlop={10}
                  accessibilityLabel="Playback speed"
                >
                  <Gauge size={16} color="#fff" weight="bold" />
                  <Text style={styles.speedBtnLabel}>{speed === 1 ? '1×' : `${speed}×`}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Centre playback controls */}
            <View style={styles.centreControls}>
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => skip(-SEEK_SECONDS)}
                activeOpacity={0.8}
                accessibilityLabel="Skip back 10 seconds"
              >
                <ArrowCounterClockwise size={22} color="#fff" weight="bold" />
              </TouchableOpacity>

              {/* Long press = 2× while held; handleCentrePress guards against
                  onPress firing immediately after a long-press completes. */}
              <TouchableOpacity
                style={styles.centreBtn}
                onPress={handleCentrePress}
                onLongPress={handleCentreLongPress}
                onPressOut={handleCentrePressOut}
                delayLongPress={300}
                activeOpacity={0.8}
              >
                {isBuffering ? (
                  <View style={styles.bufferingRing} />
                ) : isPlaying ? (
                  <Pause size={32} color="#fff" weight="fill" />
                ) : (
                  <Play size={32} color="#fff" weight="fill" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => skip(SEEK_SECONDS)}
                activeOpacity={0.8}
                accessibilityLabel="Skip forward 10 seconds"
              >
                <ArrowClockwise size={22} color="#fff" weight="bold" />
              </TouchableOpacity>
            </View>

            {/* Bottom controls */}
            <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <TouchableOpacity onPress={() => seek(0)} hitSlop={8} accessibilityLabel="Replay video">
                <ArrowCounterClockwise size={18} color="#fff" weight="bold" />
              </TouchableOpacity>
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
                {/* Buffering indicator on track */}
                {isBuffering && (
                  <View style={[styles.scrubBuffering, { left: `${progress * 100}%` as any }]} />
                )}
                <View style={[styles.scrubThumb, { left: `${progress * 100}%` as any }]} />
              </View>

              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          </View>
        )}

        {/* Backdrop is now inside the speed menu block above — no trailing Pressable needed. */}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  speedBtnLabel: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 12,
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
  centreControls: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  skipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
  scrubBuffering: {
    position: 'absolute',
    width: 40,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
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

  // Speed selector menu container — positions the menu top-right.
  // The backdrop Pressable is a sibling rendered before this in JSX (behind it),
  // so touches on menu items reach TouchableOpacity, not the backdrop.
  speedMenuContainer: {
    position: 'absolute',
    top: 70,
    right: 16,
  },
  speedMenu: {
    backgroundColor: 'rgba(18,11,16,0.95)',
    borderRadius: 14,
    paddingVertical: 8,
    minWidth: 160,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  speedMenuTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: T.FONT.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },
  speedOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  speedOptionActive: {
    backgroundColor: T.ACCENT_LIGHT,
  },
  speedLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: T.FONT.medium,
    fontSize: 14,
  },
  speedLabelActive: {
    color: T.ACCENT,
    fontFamily: T.FONT.semibold,
  },
});
