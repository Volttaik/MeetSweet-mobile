import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T, alpha, RoseGradient } from '@/constants/theme';

/**
 * Screen-level background wrapper.
 * Applies the dark neutral gradient behind all content — never competes with UI.
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
      {/* Full-screen neutral gradient backdrop */}
      <LinearGradient
        colors={RoseGradient.colors}
        locations={RoseGradient.locations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Brand glow concentrated at the top — subtle purple wash */}
      <LinearGradient
        colors={[T.AMBIENT, alpha(T.PRIMARY, 0.05), 'transparent']}
        locations={[0, 0.45, 1]}
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
