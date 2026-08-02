import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { T } from '@/constants/theme';

/**
 * Small MeetSweet Credits mark. It intentionally uses a coin + sparkle shape
 * rather than a generic currency glyph so it remains recognizable at 16px.
 */
export function MsCreditsIcon({ size = 32 }: { size?: number }) {
  const inner = Math.max(8, Math.round(size * 0.42));
  return (
    <View
      style={[
        styles.coin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      accessibilityLabel="MeetSweet wallet"
    >
      <View
        style={[
          styles.inner,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
          },
        ]}
      />
      <Text style={[styles.sparkle, { fontSize: Math.max(8, size * 0.32) }]}>✦</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  coin: {
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  inner: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  sparkle: {
    position: 'absolute',
    color: T.TEXT,
    fontFamily: T.FONT.bold,
  },
});