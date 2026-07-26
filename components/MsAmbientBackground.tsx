import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from '@/constants/theme';

export function MsAmbientBackground({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={[T.AMBIENT, 'rgba(217,106,130,0.025)', 'transparent']}
        locations={[0, 0.32, 0.8]}
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
    height: 420,
  },
});