/**
 * Compact realtime recording presence. This is deliberately not a message
 * bubble and does not carry a participant label.
 *
 * The pulse runs as a Reanimated worklet on the UI thread.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Microphone } from 'phosphor-react-native';
import { T } from '@/constants/theme';

export function MsRecordingIndicator() {
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.55, { duration: 520, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const barStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.row} accessible accessibilityLabel="Participant is recording a voice message">
      <Reanimated.View style={[styles.dot, dotStyle]} />
      <Microphone size={12} color={T.ACCENT} weight="fill" />
      <View style={styles.bars}>
        {[0, 1, 2, 3].map((i) => (
          <Reanimated.View
            key={i}
            style={[styles.bar, barStyle, { height: 5 + i * 2 }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 16,
    paddingBottom: 5,
    height: 24,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 14,
  },
  bar: {
    width: 2,
    borderRadius: 2,
    backgroundColor: T.ACCENT,
  },
});
