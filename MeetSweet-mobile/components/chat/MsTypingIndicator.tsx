/**
 * Compact realtime typing presence. It is rendered outside the message array.
 *
 * The dot bounce runs as Reanimated worklets on the UI thread so it never
 * contends with the JS thread during keyboard/scroll animations.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { T } from '@/constants/theme';

const DOT_COUNT = 3;

function Dot({ anim }: { anim: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: anim.value,
    transform: [{ translateY: (anim.value - 0.45) / 0.55 * -3 }],
  }));
  return <Reanimated.View style={[styles.dot, style]} />;
}

export function MsTypingIndicator() {
  const anims = [
    useSharedValue(0.45),
    useSharedValue(0.45),
    useSharedValue(0.45),
  ];

  useEffect(() => {
    anims.forEach((anim, i) => {
      anim.value = withRepeat(
        withSequence(
          withDelay(i * 100, withTiming(1, { duration: 280, easing: Easing.inOut(Easing.sin) })),
          withTiming(0.45, { duration: 280, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    });
    return () => anims.forEach((anim) => cancelAnimation(anim));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.row} accessible accessibilityLabel="Participant is typing">
      {anims.map((anim, i) => (
        <Dot key={i} anim={anim} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 17,
    paddingBottom: 5,
    height: 20,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.ACCENT,
  },
});
