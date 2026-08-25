import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { T } from '@/constants/theme';

/**
 * MsSwitch — the MeetSweet toggle switch.
 *
 * ON: the track is filled with the same centralised brand gradient used
 * everywhere (BrandGradientFill → AppGradients), with a bright thumb on top
 * for contrast. OFF: neutral dark track, bright thumb. Same geometry as a
 * standard RN Switch; the thumb slides with a spring.
 */
const TRACK_W = 48;
const TRACK_H = 28;
const THUMB = 24;
const THUMB_PAD = (TRACK_H - THUMB) / 2; // 2
const THUMB_OFF = TRACK_W - THUMB - THUMB_PAD * 2; // travel distance

export function MsSwitch({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const x = useSharedValue(value ? THUMB_OFF : 0);

  useEffect(() => {
    x.value = withSpring(value ? THUMB_OFF : 0, {
      damping: 17,
      stiffness: 260,
      mass: 0.6,
    });
  }, [value, x]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <Pressable
      onPress={() => {
        if (!disabled) onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [
        styles.track,
        {
          backgroundColor: value ? undefined : T.SURFACE_2,
          opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {value && (
        <View style={styles.trackFill} pointerEvents="none">
          <BrandGradientFill />
        </View>
      )}
      <Animated.View style={[styles.thumb, thumbStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  trackFill: {
    ...StyleSheet.absoluteFillObject,
  },
  thumb: {
    position: 'absolute',
    left: THUMB_PAD,
    top: THUMB_PAD,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: T.ACCENT_FG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },
});
