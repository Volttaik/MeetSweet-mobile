import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RoseGradient } from '@/constants/theme';

/**
 * Full-bleed neutral gradient background for auth, onboarding and modal screens.
 * This is the shared backdrop — dark fading to black.
 */
export function MsScreenBackground({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={RoseGradient.colors}
      locations={RoseGradient.locations}
      style={[styles.root, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
