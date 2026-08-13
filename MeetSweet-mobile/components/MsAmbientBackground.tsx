import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T, RoseGradient } from '@/constants/theme';

/**
 * Screen-level background wrapper.
 * Applies the warm rose gradient behind all content — never competes with UI.
 */
export function MsAmbientBackground({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.root, style]}>
      {/* Full-screen rose gradient backdrop */}
      <LinearGradient
        colors={RoseGradient.colors}
        locations={RoseGradient.locations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Soft rose glow concentrated at the top */}
      <LinearGradient
        colors={[T.AMBIENT, 'transparent']}
        locations={[0, 0.6]}
        style={styles.glow}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.BG },
  glow: {
    ...StyleSheet.absoluteFillObject,
    height: 380,
  },
});
