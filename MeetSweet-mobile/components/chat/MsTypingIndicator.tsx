/**
 * MsTypingIndicator — single compact animated typing indicator.
 * Three small synchronized bouncing dots inside a small pill.
 * Never renders as a message bubble with text.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { T } from '@/constants/theme';

const DOT_COUNT = 3;
const DOT_SIZE = 8;
const ANIMATION_DURATION = 380;
const STAGGER = 130;

export function MsTypingIndicator() {
  const anims = useRef(
    Array.from({ length: DOT_COUNT }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * STAGGER),
          Animated.timing(anim, {
            toValue: 1,
            duration: ANIMATION_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: ANIMATION_DURATION,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    Animated.parallel(animations).start();
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        {anims.map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                transform: [
                  {
                    translateY: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -3],
                    }),
                  },
                ],
                opacity: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.45, 1],
                }),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingBottom: 6,
    alignItems: 'flex-start',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: T.SURFACE_2,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: T.TEXT,
  },
});
