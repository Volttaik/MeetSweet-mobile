/**
 * MsChatBackground — subtle premium chat wallpaper.
 *
 * Very dark base with a barely-visible repeating MeetSweet logo motif.
 * The "MS" heart-inspired mark tiles across the background at ~4% opacity.
 * Rendered as pointerEvents="none" so it never blocks touches.
 */
import React, { memo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');

// Tile size for the repeating logo mark
const TILE = 72;
const COLS = Math.ceil(W / TILE) + 1;
const ROWS = Math.ceil(H / TILE) + 1;

// A stylised heart-and-M mark inspired by the MeetSweet brand
// Single-path at 48×48 viewBox, centered
const LOGO_PATH =
  // Outer heart shape
  'M24 42 C24 42 8 31 8 19 C8 13.477 12.477 9 18 9 C20.93 9 23.56 10.244 25.47 12.264 ' +
  'C23.56 10.244 20.93 9 18 9 C12.477 9 8 13.477 8 19 C8 31 24 42 24 42Z ' +
  // M letterform inside
  'M14 22 L14 17 L18 22 L22 17 L22 22 ' +
  // Right heart arc
  'C24 42 40 31 40 19 C40 13.477 35.523 9 30 9 C27.07 9 24.44 10.244 24 12.264';

// Simpler concentric-ring + MS mark — very lightweight SVG
function LogoMark({ size = 28, opacity = 0.045 }: { size?: number; opacity?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" opacity={opacity}>
      {/* Stylised heart */}
      <Path
        d="M24 40 L8.5 26 C5 22 5 15 11 12 C16 9.5 20 12 24 17 C28 12 32 9.5 37 12 C43 15 43 22 39.5 26 Z"
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* M letter */}
      <Path
        d="M15 30 L15 20 L24 28 L33 20 L33 30"
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export const MsChatBackground = memo(function MsChatBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Base fill */}
      <View style={s.base} />

      {/* Repeating logo tile grid */}
      <View style={s.grid}>
        {Array.from({ length: ROWS }, (_, row) => (
          <View key={row} style={[s.row, { height: TILE }]}>
            {Array.from({ length: COLS }, (_, col) => (
              <View
                key={col}
                style={[
                  s.cell,
                  {
                    width: TILE,
                    height: TILE,
                    // Alternate rows offset for diamond/stagger pattern
                    marginLeft: row % 2 === 1 ? TILE / 2 : 0,
                  },
                ]}
              >
                <LogoMark size={30} opacity={0.038} />
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Very subtle ambient vignette — darker at edges */}
      <View style={s.vignetteTop}    pointerEvents="none" />
      <View style={s.vignetteBottom} pointerEvents="none" />
      <View style={s.vignetteLeft}   pointerEvents="none" />
      <View style={s.vignetteRight}  pointerEvents="none" />
    </View>
  );
});

const s = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0C0C0F',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vignetteTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: H * 0.12,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: H * 0.08,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  vignetteLeft: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: W * 0.15,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  vignetteRight: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: W * 0.15,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
});
