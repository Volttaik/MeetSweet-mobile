import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { AppGradients } from '@/constants/theme';

// The full approved brand mesh — amber → magenta → purple → deep violet.
// The active icon is painted with EXACTLY this gradient (same stops,
// locations and direction as every other brand surface in the app).
const BRAND_COLORS = AppGradients.brand;
const BRAND_LOCS = AppGradients.brandLocs;

// A whisper-thin light edge on the gradient glyph keeps the icon's silhouette
// sharply defined against dark surfaces — the gradient still fills the shape,
// the shape just never dissolves into the background.
const GLYPH_EDGE = 'rgba(255,255,255,0.30)';
const GLYPH_EDGE_WIDTH = 5; // viewBox units ≈ 0.4px at 22pt

/**
 * Fill-weight glyph paths (Phosphor icons, viewBox 0 0 256 256) for the
 * bottom-navigation active icons. They are the exact `fill`-weight geometry
 * the tab renders, so the gradient sits precisely INSIDE the icon's shape —
 * nothing outside the glyph ever receives the gradient.
 */
const ICON_PATHS = {
  house:
    'M224 120v96a8 8 0 0 1-8 8h-56a8 8 0 0 1-8-8v-52a4 4 0 0 0-4-4h-40a4 4 0 0 0-4 4v52a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8v-96a16 16 0 0 1 4.69-11.31l80-80a16 16 0 0 1 22.62 0l80 80A16 16 0 0 1 224 120',
  'magnifying-glass':
    'M168 112a56 56 0 1 1-56-56 56 56 0 0 1 56 56m61.66 117.66a8 8 0 0 1-11.32 0l-50.06-50.07a88 88 0 1 1 11.32-11.31l50.06 50.06a8 8 0 0 1 0 11.32M112 184a72 72 0 1 0-72-72 72.08 72.08 0 0 0 72 72',
  envelope:
    'M224 48H32a8 8 0 0 0-8 8v136a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a8 8 0 0 0-8-8M98.71 128 40 181.81V74.19Zm11.84 10.85 12 11.05a8 8 0 0 0 10.82 0l12-11.05 58 53.15H52.57ZM157.29 128 216 74.18v107.64Z',
  user:
    'M230.93 220a8 8 0 0 1-6.93 4H32a8 8 0 0 1-6.92-12c15.23-26.33 38.7-45.21 66.09-54.16a72 72 0 1 1 73.66 0c27.39 8.95 50.86 27.83 66.09 54.16a8 8 0 0 1 .01 8',
} as const;

export type GradientIconName = keyof typeof ICON_PATHS;

/**
 * GradientIcon — a Phosphor icon whose glyph is filled entirely with the
 * brand gradient. The gradient is applied as the path fill, so it is clipped
 * to the icon's exact shape by construction: no gradient background, no
 * container fill, no blob — just the icon, painted in the brand mesh.
 *
 * When `motion` (a 0→1→0 signal driven by the parent on tap) is provided, a
 * second gradient layer with a slightly shifted direction crossfades in and
 * out, so the gradient reads as gently flowing inside the icon on interaction
 * — fast, subtle, and still clipped strictly to the glyph.
 */
export function GradientIcon({
  name,
  size,
  motion,
}: {
  name: GradientIconName;
  size: number;
  /** 0→1→0 tap signal; when present the gradient subtly shifts on tap. */
  motion?: SharedValue<number>;
}) {
  // Unique ids — gradient defs must never collide on web.
  const gradId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradShiftId = useId().replace(/[^a-zA-Z0-9]/g, '');

  const shiftStyle = useAnimatedStyle(() => ({
    opacity: motion ? motion.value * 0.55 : 0,
  }));

  return (
    <View>
      <Svg width={size} height={size} viewBox="0 0 256 256">
        <Defs>
          <LinearGradient id={gradId} x1="1" y1="0" x2="0" y2="1">
            {BRAND_COLORS.map((c, i) => (
              <Stop key={i} offset={BRAND_LOCS[i]} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Path
          d={ICON_PATHS[name]}
          fill={`url(#${gradId})`}
          stroke={GLYPH_EDGE}
          strokeWidth={GLYPH_EDGE_WIDTH}
        />
      </Svg>
      {motion ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, shiftStyle]}
        >
          {/* Same glyph, gradient flowing vertically instead of diagonally —
              crossfading it reads as the gradient gliding inside the icon. */}
          <Svg width={size} height={size} viewBox="0 0 256 256">
            <Defs>
              <LinearGradient id={gradShiftId} x1="0.5" y1="0" x2="0.5" y2="1">
                {BRAND_COLORS.map((c, i) => (
                  <Stop key={i} offset={BRAND_LOCS[i]} stopColor={c} />
                ))}
              </LinearGradient>
            </Defs>
            <Path
              d={ICON_PATHS[name]}
              fill={`url(#${gradShiftId})`}
              stroke={GLYPH_EDGE}
              strokeWidth={GLYPH_EDGE_WIDTH}
            />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}
