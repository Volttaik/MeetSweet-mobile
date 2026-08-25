import React from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { T } from '@/constants/theme';

/**
 * Card surface wrapper.
 *
 * Renders the solid, rounded card surface. Same API as always, so existing
 * call sites keep working.
 */
export function GradientBorder({
  radius,
  surface = T.SURFACE,
  style,
  children,
}: {
  radius: number;
  surface?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.card, { borderRadius: radius, backgroundColor: surface }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
  card: {
    flex: 1,
    overflow: 'hidden',
  },
});
