/**
 * MsChatBackground — subtle premium chat wallpaper.
 *
 * Very dark base with a barely-visible dot grid pattern.
 * Think Telegram wallpaper, but much more restrained.
 * Rendered as pointerEvents="none" so it never blocks touches.
 */
import React, { memo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

// Grid density
const COL_SPACING = 26;
const ROW_SPACING = 26;
const DOT_RADIUS  = 1;

const COLS = Math.ceil(W / COL_SPACING) + 1;
const ROWS = Math.ceil(H / ROW_SPACING) + 1;

export const MsChatBackground = memo(function MsChatBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Base fill */}
      <View style={s.base} />

      {/* Dot grid — 3 % opacity so it's barely a whisper */}
      <View style={s.dotLayer}>
        {Array.from({ length: ROWS }, (_, row) => (
          <View key={row} style={s.dotRow}>
            {Array.from({ length: COLS }, (_, col) => (
              <View
                key={col}
                style={[
                  s.dot,
                  {
                    marginLeft: col === 0 ? 0 : COL_SPACING - DOT_RADIUS * 2,
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>

      {/* Very subtle ambient vignette (darker edges → centre lighter) */}
      <View style={s.vignetteLeft}  pointerEvents="none" />
      <View style={s.vignetteRight} pointerEvents="none" />
    </View>
  );
});

const s = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0C0C0F',
  },
  dotLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  dotRow: {
    flexDirection: 'row',
    height: ROW_SPACING,
    alignItems: 'center',
  },
  dot: {
    width:  DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.028)',
  },
  vignetteLeft: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: W * 0.35,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  vignetteRight: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: W * 0.35,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
});
