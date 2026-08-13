/**
 * MsVideoGesturePlayer — gesture overlay for video players.
 * Handles: double-tap left=rewind 10s, double-tap right=forward 10s,
 * tap center=play/pause, swipe up/down=volume, pinch=zoom toggle.
 * This is a pure gesture overlay — renders on top of the actual player.
 */
import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowCounterClockwise, ArrowClockwise, SpeakerHigh, SpeakerLow } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import * as Haptics from 'expo-haptics';

const SCREEN_W = Dimensions.get('window').width;
const DOUBLE_TAP_DELAY = 280;
const SEEK_SECONDS = 10;
const VOLUME_SWIPE_THRESHOLD = 40;

interface MsVideoGestureOverlayProps {
  /** Called on play/pause tap */
  onPlayPause?: () => void;
  /** Called with +/- seconds to seek */
  onSeek?: (seconds: number) => void;
  /** Called with 0.0-1.0 volume delta */
  onVolumeChange?: (delta: number) => void;
  /** Called when controls visibility should toggle */
  onShowControls?: () => void;
  width?: number;
  height?: number;
}

function SeekFlash({
  visible,
  direction,
}: {
  visible: boolean;
  direction: 'left' | 'right';
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.8)).current;

  React.useEffect(() => {
    if (visible) {
      opacity.setValue(1);
      scale.setValue(0.8);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 260, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View
      style={[
        styles.seekFlash,
        direction === 'left' ? styles.seekFlashLeft : styles.seekFlashRight,
        { opacity, transform: [{ scale }] },
      ]}
      pointerEvents="none"
    >
      {direction === 'left'
        ? <ArrowCounterClockwise size={28} color="#fff" weight="bold" />
        : <ArrowClockwise size={28} color="#fff" weight="bold" />}
      <Text style={styles.seekLabel}>
        {direction === 'left' ? `-${SEEK_SECONDS}s` : `+${SEEK_SECONDS}s`}
      </Text>
    </Animated.View>
  );
}

export function MsVideoGestureOverlay({
  onPlayPause,
  onSeek,
  onVolumeChange,
  onShowControls,
  width,
  height,
}: MsVideoGestureOverlayProps) {
  const [showLeft, setShowLeft]   = useState(false);
  const [showRight, setShowRight] = useState(false);

  const lastTapRef    = useRef(0);
  const lastTapSideRef = useRef<'left' | 'right' | 'center' | null>(null);
  const tapTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStartY   = useRef(0);

  const w = width ?? SCREEN_W;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        swipeStartY.current = e.nativeEvent.pageY;
      },
      onPanResponderRelease: (e, gs) => {
        const x = e.nativeEvent.locationX;
        const dy = gs.dy;
        const dx = gs.dx;

        // Swipe up/down for volume (if significant vertical swipe)
        if (Math.abs(dy) > VOLUME_SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx) * 1.5) {
          const delta = -dy / 200; // swipe up = louder
          onVolumeChange?.(delta);
          return;
        }

        // Tap detection — double tap = seek, single tap = toggle controls
        const zone = x < w * 0.35 ? 'left' : x > w * 0.65 ? 'right' : 'center';
        const now = Date.now();

        if (now - lastTapRef.current < DOUBLE_TAP_DELAY && lastTapSideRef.current === zone) {
          // Double tap
          if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
          lastTapRef.current = 0;
          lastTapSideRef.current = null;

          if (zone === 'left') {
            onSeek?.(-SEEK_SECONDS);
            setShowLeft(true);
            setTimeout(() => setShowLeft(false), 50);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          } else if (zone === 'right') {
            onSeek?.(SEEK_SECONDS);
            setShowRight(true);
            setTimeout(() => setShowRight(false), 50);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          } else {
            onPlayPause?.();
          }
        } else {
          lastTapRef.current = now;
          lastTapSideRef.current = zone;
          tapTimerRef.current = setTimeout(() => {
            onShowControls?.();
          }, DOUBLE_TAP_DELAY + 20);
        }
      },
    }),
  ).current;

  return (
    <View style={[styles.overlay, width ? { width } : null, height ? { height } : null]} {...panResponder.panHandlers}>
      <SeekFlash visible={showLeft}  direction="left" />
      <SeekFlash visible={showRight} direction="right" />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  seekFlash: {
    position: 'absolute',
    top: '30%',
    alignItems: 'center',
    gap: 4,
  },
  seekFlashLeft:  { left: 24 },
  seekFlashRight: { right: 24 },
  seekLabel: {
    fontSize: 13,
    fontFamily: T.FONT.bold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
