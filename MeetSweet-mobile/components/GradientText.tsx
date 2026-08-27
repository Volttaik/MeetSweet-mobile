import React, { useId, useState } from 'react';
import {
  View,
  Text as RNText,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { AppGradients } from '@/constants/theme';

/**
 * GradientText — header text painted with the brand gradient.
 *
 * The brand rule: main header text is not a flat colour — it is the gradient
 * itself, flowing left → right like a wave across the letters. RN can't paint
 * a gradient inside a Text glyph, so we render an invisible RN Text purely as
 * the layout/measurement engine (keeps flex, ellipsis and alignment exact),
 * then overlay an SVG Text with a horizontal brand-gradient fill on top.
 */
export function GradientText({
  text,
  style,
  numberOfLines = 1,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  // Measured box of the hidden layout text. Re-measured whenever the size
  // changes (fonts may load late and change metrics), so the gradient paint
  // always matches the real text width.
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  // UNIQUE gradient id per instance. On web every SVG lives in the same DOM
  // document, and `url(#id)` paint references resolve to the FIRST element
  // with that id — previously all instances shared id="gradientTextFill", so
  // an instance whose nearest match sat inside another (hidden) screen could
  // fail to paint entirely and render INVISIBLE.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `gradientTextFill-${uid}`;

  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const textAlign = flat.textAlign ?? 'center';
  const fontFamily = flat.fontFamily;
  const fontSize = flat.fontSize ?? 16;
  const fontWeight = flat.fontWeight;
  const letterSpacing = flat.letterSpacing;

  // Layout-relevant props only (flex, width, alignSelf, margins) — a View can't
  // take font props from a TextStyle.
  const wrapStyle: StyleProp<ViewStyle> = (() => {
    if (!style) return undefined;
    const s = StyleSheet.flatten(style) as TextStyle & { alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch'; width?: number | string; flex?: number; flexShrink?: number; marginTop?: number; marginBottom?: number };
    return {
      flex: s.flex,
      flexShrink: s.flexShrink,
      width: s.width,
      alignSelf: s.alignSelf,
      marginTop: s.marginTop,
      marginBottom: s.marginBottom,
      marginHorizontal: s.marginHorizontal,
    };
  })();

  // A little slack around the paint viewport: the SVG text can render a few
  // px wider than the measured box (font-metric differences between the RN
  // Text and the SVG <text>), and an <svg> clips overflow at its edges by
  // default — which would shave the first/last letters. Padding the viewport
  // (and centering the text on the same point) makes that impossible.
  const PAD = 8;

  // The gradient paint must NEVER be gated on layout events: if onLayout is
  // late or missing on a given platform/context, we still paint using a rough
  // estimate and snap to the exact measured box the moment the hidden layout
  // Text reports it. This guarantees gradient text is never invisible.
  const fallbackHeight = fontSize * (numberOfLines > 1 ? 1.7 : 1.25);
  const fallbackWidth = Math.max(24, (text?.length ?? 4) * fontSize * 0.62);

  const w = box?.width ?? fallbackWidth;
  const h = box?.height ?? fallbackHeight;
  const paintWidth = w + PAD * 2;

  return (
    <View style={[wrapStyle, styles.wrap]} onLayout={(e) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) {
        setBox((prev) =>
          prev && prev.width === width && prev.height === height ? prev : { width, height },
        );
      }
    }}>
      {/* Layout engine — invisible, reserves the exact space */}
      <RNText style={[style, styles.hidden]} numberOfLines={numberOfLines}>
        {text}
      </RNText>
      {/* Gradient paint — overlays the same space */}
      <View
        pointerEvents="none"
        style={[styles.paint, { width: paintWidth, height: h, left: -PAD }]}
      >
        <Svg width={paintWidth} height={h}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={AppGradients.brand[1]} />
              <Stop offset="0.45" stopColor={AppGradients.brand[2]} />
              <Stop offset="0.75" stopColor={AppGradients.brand[3]} />
              <Stop offset="1" stopColor={AppGradients.brand[0]} />
            </LinearGradient>
          </Defs>
          <SvgText
            x={textAlign === 'left' ? PAD : w / 2 + PAD}
            y={h / 2}
            textAnchor={textAlign === 'left' ? 'start' : 'middle'}
            alignmentBaseline="central"
            fill={`url(#${gradId})`}
            fontFamily={fontFamily}
            fontSize={fontSize}
            fontWeight={fontWeight}
            letterSpacing={letterSpacing}
          >
            {text}
          </SvgText>
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    // Never let a tight flex row shrink this below the text's content width —
    // a squeezed measuring Text ellipsizes, which would shrink the paint box
    // and clip the gradient letters at both ends.
    flexShrink: 0,
  },
  hidden: {
    opacity: 0,
    flexShrink: 0,
  },
  paint: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});