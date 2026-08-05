/**
 * MsTierBadge — custom 3D SVG tier badges for MeetSweet.
 *
 * Each badge is hand-crafted with multi-stop gradients, inner highlights,
 * and edge shadows to give a real 3D metallic/gem feel.
 *
 * Bronze  → warm copper coin with embossed circle
 * Silver  → steel shield pill with metallic sheen
 * Gold    → rich gold crown badge
 * Diamond → aqua gem with faceted faces
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Circle,
  Ellipse,
  Path,
  Rect,
  G,
  Text as SvgText,
} from 'react-native-svg';
import type { ContentTier } from '@/constants/tiers';

interface MsTierBadgeProps {
  tier: ContentTier;
  /** xs = tiny (post card header); sm = standard */
  size?: 'xs' | 'sm';
}

// ─── Bronze Coin ──────────────────────────────────────────────────────────────
function BronzeBadge({ scale }: { scale: number }) {
  const r = 9 * scale;
  const w = r * 2 + 4 * scale;
  const h = w;
  const cx = w / 2;
  const cy = h / 2;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        {/* Main coin face */}
        <RadialGradient id="bronzeFace" cx="38%" cy="32%" r="62%">
          <Stop offset="0%" stopColor="#F4A93E" />
          <Stop offset="40%" stopColor="#CD7F32" />
          <Stop offset="75%" stopColor="#A0522D" />
          <Stop offset="100%" stopColor="#7B3A1E" />
        </RadialGradient>
        {/* Edge/shadow ring */}
        <RadialGradient id="bronzeEdge" cx="50%" cy="50%" r="50%">
          <Stop offset="70%" stopColor="transparent" />
          <Stop offset="85%" stopColor="#5C2A0E" stopOpacity="0.7" />
          <Stop offset="100%" stopColor="#3A1A0A" stopOpacity="0.9" />
        </RadialGradient>
        {/* Top highlight */}
        <RadialGradient id="bronzeShine" cx="40%" cy="25%" r="45%">
          <Stop offset="0%" stopColor="#FFD580" stopOpacity="0.55" />
          <Stop offset="100%" stopColor="#FFD580" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* Drop shadow disc */}
      <Ellipse cx={cx + scale * 0.5} cy={cy + scale * 1.2} rx={r * 0.92} ry={r * 0.35} fill="rgba(0,0,0,0.45)" />
      {/* Coin body */}
      <Circle cx={cx} cy={cy} r={r} fill="url(#bronzeFace)" />
      {/* Edge shading */}
      <Circle cx={cx} cy={cy} r={r} fill="url(#bronzeEdge)" />
      {/* Inner embossed ring */}
      <Circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke="#A0522D" strokeWidth={scale * 0.6} strokeOpacity={0.55} />
      <Circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke="#FFD580" strokeWidth={scale * 0.3} strokeOpacity={0.3} />
      {/* Shine highlight */}
      <Circle cx={cx} cy={cy} r={r} fill="url(#bronzeShine)" />
      {/* Letter B */}
      <SvgText
        x={cx}
        y={cy + scale * 1.1}
        textAnchor="middle"
        fontSize={scale * 7}
        fontWeight="700"
        fill="#7B3A1E"
        fillOpacity={0.6}
        fontFamily="System"
        letterSpacing={0}
      >B</SvgText>
      <SvgText
        x={cx - scale * 0.3}
        y={cy + scale * 0.8}
        textAnchor="middle"
        fontSize={scale * 7}
        fontWeight="700"
        fill="#FFD580"
        fillOpacity={0.9}
        fontFamily="System"
      >B</SvgText>
    </Svg>
  );
}

// ─── Silver Shield Pill ───────────────────────────────────────────────────────
function SilverBadge({ scale }: { scale: number }) {
  const W = 50 * scale;
  const H = 18 * scale;
  const R = H / 2;
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        {/* Main metallic gradient — left to right + angled sheen */}
        <LinearGradient id="silverBase" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#E8E8EC" />
          <Stop offset="22%" stopColor="#C8C8D0" />
          <Stop offset="50%" stopColor="#9A9AA8" />
          <Stop offset="78%" stopColor="#B8B8C4" />
          <Stop offset="100%" stopColor="#D4D4DC" />
        </LinearGradient>
        {/* Edge bevel — subtle dark border */}
        <LinearGradient id="silverBevel" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
        </LinearGradient>
        {/* Diagonal shine band */}
        <LinearGradient id="silverShine" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {/* Drop shadow */}
      <Rect x={scale} y={scale * 2} width={W - scale * 2} height={H - scale * 2} rx={R - scale} fill="rgba(0,0,0,0.35)" />
      {/* Base pill */}
      <Rect x={0} y={0} width={W} height={H} rx={R} fill="url(#silverBase)" />
      {/* Bevel overlay */}
      <Rect x={0} y={0} width={W} height={H} rx={R} fill="url(#silverBevel)" />
      {/* Shine band */}
      <Rect x={0} y={0} width={W} height={H} rx={R} fill="url(#silverShine)" />
      {/* Dark bottom edge line */}
      <Rect x={scale * 0.5} y={H - scale * 1.5} width={W - scale} height={scale * 0.8} rx={scale * 0.4} fill="rgba(0,0,0,0.18)" />
      {/* Label */}
      <SvgText
        x={W / 2 + scale * 0.3}
        y={H / 2 + scale * 2.2}
        textAnchor="middle"
        fontSize={scale * 7.5}
        fontWeight="800"
        fill="#4A4A5A"
        fillOpacity={0.5}
        fontFamily="System"
        letterSpacing={scale * 0.8}
      >SILVER</SvgText>
      <SvgText
        x={W / 2}
        y={H / 2 + scale * 1.9}
        textAnchor="middle"
        fontSize={scale * 7.5}
        fontWeight="800"
        fill="#FFFFFF"
        fillOpacity={0.9}
        fontFamily="System"
        letterSpacing={scale * 0.8}
      >SILVER</SvgText>
    </Svg>
  );
}

// ─── Gold Crown Badge ─────────────────────────────────────────────────────────
function GoldBadge({ scale }: { scale: number }) {
  const W = 46 * scale;
  const H = 20 * scale;
  // Pill shape with crown notches cut from top
  const R = H * 0.42;
  const crownH = H * 0.38;
  // Crown path: pill rect base + 3 peaks cut upward
  const bY = crownH;
  const bH = H - crownH;
  // Pill base bottom path
  const botR = R * 0.7;
  const peakW = W / 5;
  const crownPath = [
    `M ${botR} ${H}`,
    `Q 0 ${H} 0 ${H - botR}`,
    `L 0 ${bY + botR}`,
    `Q 0 ${bY} ${botR} ${bY}`,
    // left valley
    `L ${peakW} ${bY}`,
    // left peak
    `L ${peakW * 1.5} ${scale * 1.5}`,
    // left valley 2
    `L ${peakW * 2} ${bY}`,
    // center peak
    `L ${W / 2} ${0}`,
    // right valley
    `L ${peakW * 3} ${bY}`,
    // right peak
    `L ${peakW * 3.5} ${scale * 1.5}`,
    // right valley 2
    `L ${peakW * 4} ${bY}`,
    `Q ${W} ${bY} ${W} ${bY + botR}`,
    `L ${W} ${H - botR}`,
    `Q ${W} ${H} ${W - botR} ${H}`,
    'Z',
  ].join(' ');

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="goldBase" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFE566" />
          <Stop offset="30%" stopColor="#FFD700" />
          <Stop offset="60%" stopColor="#E6A000" />
          <Stop offset="85%" stopColor="#C87800" />
          <Stop offset="100%" stopColor="#B86000" />
        </LinearGradient>
        <LinearGradient id="goldShine" x1="10%" y1="0%" x2="70%" y2="100%">
          <Stop offset="0%" stopColor="#FFFBE0" stopOpacity="0.7" />
          <Stop offset="40%" stopColor="#FFFBE0" stopOpacity="0.3" />
          <Stop offset="100%" stopColor="#FFFBE0" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="goldBevel" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.3" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.2" />
        </LinearGradient>
      </Defs>
      {/* Drop shadow */}
      <Path d={crownPath} fill="rgba(0,0,0,0.4)" transform={`translate(${scale * 0.5},${scale * 1.5})`} />
      {/* Gold body */}
      <Path d={crownPath} fill="url(#goldBase)" />
      {/* Bevel */}
      <Path d={crownPath} fill="url(#goldBevel)" />
      {/* Shine */}
      <Path d={crownPath} fill="url(#goldShine)" />
      {/* Label */}
      <SvgText
        x={W / 2 + scale * 0.3}
        y={H - scale * 2.5 + scale * 0.3}
        textAnchor="middle"
        fontSize={scale * 7}
        fontWeight="800"
        fill="#7A4000"
        fillOpacity={0.45}
        fontFamily="System"
        letterSpacing={scale * 0.6}
      >GOLD</SvgText>
      <SvgText
        x={W / 2}
        y={H - scale * 2.5}
        textAnchor="middle"
        fontSize={scale * 7}
        fontWeight="800"
        fill="#FFF8D0"
        fillOpacity={0.95}
        fontFamily="System"
        letterSpacing={scale * 0.6}
      >GOLD</SvgText>
    </Svg>
  );
}

// ─── Diamond Gem Badge ────────────────────────────────────────────────────────
function DiamondBadge({ scale }: { scale: number }) {
  const W = 60 * scale;
  const H = 20 * scale;
  const R = H / 2;

  // Pill outline
  const pillPath = `
    M ${R} 0
    L ${W - R} 0
    Q ${W} 0 ${W} ${R}
    L ${W} ${R}
    Q ${W} ${H} ${W - R} ${H}
    L ${R} ${H}
    Q 0 ${H} 0 ${R}
    Q 0 0 ${R} 0
    Z
  `;

  // Facet lines — diamond cut effect inside the pill
  const cx = W / 2;
  const cy = H / 2;
  const topY = scale * 2.5;
  const botY = H - scale * 2.5;
  const leftX = scale * 5;
  const rightX = W - scale * 5;

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="gemBase" x1="0%" y1="0%" x2="30%" y2="100%">
          <Stop offset="0%" stopColor="#B8FFF0" />
          <Stop offset="25%" stopColor="#7FFFD4" />
          <Stop offset="55%" stopColor="#00CFA8" />
          <Stop offset="80%" stopColor="#009080" />
          <Stop offset="100%" stopColor="#006860" />
        </LinearGradient>
        <LinearGradient id="gemFacetL" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#E0FFFA" stopOpacity="0.6" />
          <Stop offset="100%" stopColor="#00CFA8" stopOpacity="0.1" />
        </LinearGradient>
        <LinearGradient id="gemFacetR" x1="100%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#004A42" stopOpacity="0.5" />
          <Stop offset="100%" stopColor="#007060" stopOpacity="0.05" />
        </LinearGradient>
        <LinearGradient id="gemShine" x1="0%" y1="0%" x2="60%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
          <Stop offset="45%" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="gemBevel" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
        </LinearGradient>
      </Defs>
      {/* Drop shadow */}
      <Rect x={scale * 0.5} y={scale * 2} width={W - scale} height={H - scale * 2} rx={R - scale * 0.5} fill="rgba(0,0,0,0.4)" />
      {/* Gem body */}
      <Path d={pillPath} fill="url(#gemBase)" />
      {/* Bevel edge */}
      <Path d={pillPath} fill="url(#gemBevel)" />
      {/* Left facet */}
      <Path
        d={`M ${leftX} ${cy} L ${cx - scale * 3} ${topY} L ${cx} ${cy} Z`}
        fill="url(#gemFacetL)"
      />
      {/* Right facet */}
      <Path
        d={`M ${rightX} ${cy} L ${cx + scale * 3} ${topY} L ${cx} ${cy} Z`}
        fill="url(#gemFacetR)"
      />
      {/* Bottom-left facet */}
      <Path
        d={`M ${leftX} ${cy} L ${cx - scale * 3} ${botY} L ${cx} ${cy} Z`}
        fill="rgba(0,0,0,0.15)"
      />
      {/* Bottom-right facet */}
      <Path
        d={`M ${rightX} ${cy} L ${cx + scale * 3} ${botY} L ${cx} ${cy} Z`}
        fill="rgba(0,0,0,0.25)"
      />
      {/* Top shine */}
      <Path d={pillPath} fill="url(#gemShine)" />
      {/* Label */}
      <SvgText
        x={W / 2 + scale * 0.3}
        y={H / 2 + scale * 2.3}
        textAnchor="middle"
        fontSize={scale * 7}
        fontWeight="800"
        fill="#003830"
        fillOpacity={0.4}
        fontFamily="System"
        letterSpacing={scale * 0.5}
      >DIAMOND</SvgText>
      <SvgText
        x={W / 2}
        y={H / 2 + scale * 2}
        textAnchor="middle"
        fontSize={scale * 7}
        fontWeight="800"
        fill="#E0FFF8"
        fillOpacity={0.95}
        fontFamily="System"
        letterSpacing={scale * 0.5}
      >DIAMOND</SvgText>
    </Svg>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function MsTierBadge({ tier, size = 'sm' }: MsTierBadgeProps) {
  const scale = size === 'xs' ? 0.72 : 1;

  if (tier === 'bronze') {
    return <BronzeBadge scale={scale} />;
  }
  if (tier === 'silver') {
    return (
      <View style={styles.wrapper}>
        <SilverBadge scale={scale} />
      </View>
    );
  }
  if (tier === 'gold') {
    return (
      <View style={styles.wrapper}>
        <GoldBadge scale={scale} />
      </View>
    );
  }
  // diamond
  return (
    <View style={styles.wrapper}>
      <DiamondBadge scale={scale} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // Badges are self-sizing via SVG viewBox
    alignSelf: 'flex-start',
  },
});
