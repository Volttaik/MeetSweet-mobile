import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import { AppGradients } from '@/constants/theme';

/**
 * BrandGradientFill — the MeetSweet brand gradient as an absolute-fill layer.
 *
 * The brand rule: every coloured UI element (buttons, badges, chips, icon
 * containers, premium fills) is a continuous smooth blend of
 *   AMBER #FF8C00 → top right,  MAGENTA #FF1493 → left,  VIOLET #800080 → bottom
 * Nothing coloured is ever a flat single-colour fill. Drop this inside any
 * container that has `overflow: 'hidden'` (plus borderRadius) and it becomes
 * the mesh gradient, with pure-white bold content on top.
 */
export function BrandGradientFill({
  colors = AppGradients.brand,
  locations = AppGradients.brandLocs,
  style,
}: {
  colors?: LinearGradientProps['colors'];
  locations?: LinearGradientProps['locations'];
  style?: object;
}) {
  return (
    <LinearGradient
      colors={colors}
      locations={locations}
      start={AppGradients.brandStart}
      end={AppGradients.brandEnd}
      style={[styles.fill, style]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});
