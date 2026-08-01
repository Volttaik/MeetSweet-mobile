/**
 * MsSwipeableMessage — wraps a chat bubble to add swipe-right (reply) gesture.
 * Swipe right → shows ArrowBendUpLeft indicator and triggers onReply.
 * Built on PanResponder (no extra deps).
 */
import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import { ArrowBendUpLeft } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import * as Haptics from 'expo-haptics';

interface MsSwipeableMessageProps {
  children: React.ReactNode;
  position: 'left' | 'right';
  onReply?: () => void;
  /** Whether swipe gesture is active (disable while keyboard is open, etc.) */
  enabled?: boolean;
}

const THRESHOLD = 60;
const MAX_DRAG = 90;

export function MsSwipeableMessage({
  children,
  position,
  onReply,
  enabled = true,
}: MsSwipeableMessageProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconScale   = useRef(new Animated.Value(0.6)).current;
  const triggered   = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) =>
        enabled && Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => {
        triggered.current = false;
      },
      onPanResponderMove: (_e, gs) => {
        // Only allow swipe-right (positive dx) regardless of position
        const raw = Math.max(0, gs.dx);
        const clamped = Math.min(raw, MAX_DRAG);
        const damped = clamped > THRESHOLD
          ? THRESHOLD + (clamped - THRESHOLD) * 0.25
          : clamped;
        translateX.setValue(damped);

        const progress = Math.min(1, damped / THRESHOLD);
        iconOpacity.setValue(progress);
        iconScale.setValue(0.6 + progress * 0.4);

        if (raw >= THRESHOLD && !triggered.current) {
          triggered.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      },
      onPanResponderRelease: (_e, gs) => {
        if (gs.dx >= THRESHOLD && onReply) {
          onReply();
        }
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: 0,
            damping: 16,
            stiffness: 300,
            mass: 0.8,
            useNativeDriver: true,
          }),
          Animated.timing(iconOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
          Animated.spring(iconScale, { toValue: 0.6, damping: 16, stiffness: 300, useNativeDriver: true }),
        ]).start();
        triggered.current = false;
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(translateX, { toValue: 0, damping: 16, stiffness: 300, mass: 0.8, useNativeDriver: true }),
          Animated.timing(iconOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
        ]).start();
        triggered.current = false;
      },
    }),
  ).current;

  return (
    <View style={styles.container}>
      {/* Reply icon — appears behind the bubble on swipe */}
      <Animated.View
        style={[
          styles.replyIcon,
          position === 'right' ? styles.replyIconRight : styles.replyIconLeft,
          { opacity: iconOpacity, transform: [{ scale: iconScale }] },
        ]}
        pointerEvents="none"
      >
        <ArrowBendUpLeft size={18} color={T.ACCENT} weight="bold" />
      </Animated.View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  replyIcon: {
    position: 'absolute',
    top: '50%',
    marginTop: -12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  replyIconLeft: { left: 4 },
  replyIconRight: { left: 4 },
});
