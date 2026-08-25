import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppGradients, alpha } from '@/constants/theme';

/**
 * GradientTopFade — a soft brand-gradient wash at the TOP edge of a card or
 * bottom sheet, using the exact approved MeetSweet palette.
 *
 * The brand mesh (amber → magenta → purple → deep violet) bleeds in at the
 * top edge at a whisper of opacity and dissolves to transparent well before
 * the bottom of the band — a calm atmospheric tint, never a border or line.
 * It rounds its own top corners (`radius`) so it hugs the sheet/card shape
 * even when the parent doesn't clip with overflow: hidden.
 */
export function GradientTopFade({
  height = 56,
  radius = 0,
  style,
}: {
  /** How far the wash extends down from the top edge (px). */
  height?: number;
  /** Top-corner radius to match the host surface. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={[
        alpha(AppGradients.brand[0], 0.14),
        alpha(AppGradients.brand[1], 0.14),
        alpha(AppGradients.brand[2], 0.10),
        alpha(AppGradients.brand[3], 0.06),
        'transparent',
      ]}
      locations={[0, 0.25, 0.5, 0.75, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        StyleSheet.absoluteFillObject,
        { height, borderTopLeftRadius: radius, borderTopRightRadius: radius },
        style,
      ]}
      pointerEvents="none"
    />
  );
}
