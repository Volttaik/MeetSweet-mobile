/**
 * MsTierBadge — custom 3D SVG tier badges for MeetSweet.
 *
 * Hand-crafted with multi-stop LinearGradients (RadialGradient avoided for
 * Android compatibility) and layered shapes for a real 3D metallic / gem feel.
 *
 * Bronze  → warm copper coin with embossed ring and shine
 * Silver  → brushed steel pill with diagonal sheen
 * Gold    → rich gold crown-top badge
 * Diamond → faceted aqua gem pill
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Path,
  Rect,
  Ellipse,
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
  const r = 10 * scale;
  const W = r * 2 + 2 * scale;
  const H = W;
  const cx = W / 2;
  const cy = H / 2;

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        {/* Main coin face: top-left bright → bottom-right dark */}
        <LinearGradient id="bFace" x1="20%" y1="10%" x2="80%" y2="90%">
          <Stop offset="0%"   stopColor="#F4A93E" />
          <Stop offset="35%"  stopColor="#CD7F32" />
          <Stop offset="70%"  stopColor="#A0522D" />
          <Stop offset="100%" stopColor="#6B3318" />
        </LinearGradient>
        {/* Inner rim highlight */}
        <LinearGradient id="bRim" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#FFD580" stopOpacity="0.7" />
          <Stop offset="100%" stopColor="#7B3A1E" stopOpacity="0.3" />
        </LinearGradient>
        {/* Top shine arc */}
        <LinearGradient id="bShine" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.45" />
          <Stop offset="60%"  stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        {/* Bottom shadow */}
        <LinearGradient id="bShadow" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#000000" stopOpacity="0" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
        </LinearGradient>
      </Defs>

      {/* Drop shadow ellipse */}
      <Ellipse cx={cx + scale * 0.5} cy={H - scale * 0.5} rx={r * 0.85} ry={scale * 1.5} fill="rgba(0,0,0,0.35)" />

      {/* Coin body */}
      <Circle cx={cx} cy={cy} r={r} fill="url(#bFace)" />
      {/* Bottom-edge shadow */}
      <Circle cx={cx} cy={cy} r={r} fill="url(#bShadow)" />
      {/* Inner embossed ring */}
      <Circle cx={cx} cy={cy} r={r * 0.75} fill="none" stroke="url(#bRim)" strokeWidth={scale * 0.9} />
      {/* Shine arc (top-left semicircle) */}
      <Circle cx={cx} cy={cy} r={r} fill="url(#bShine)" />

      {/* Letter B — shadow layer */}
      <SvgText
        x={cx + scale * 0.4}
        y={cy + scale * 2.8}
        textAnchor="middle"
        fontSize={scale * 8}
        fontWeight="900"
        fill="#5C2A0E"
        fillOpacity="0.55"
        fontFamily="System"
      >B</SvgText>
      {/* Letter B — main */}
      <SvgText
        x={cx}
        y={cy + scale * 2.5}
        textAnchor="middle"
        fontSize={scale * 8}
        fontWeight="900"
        fill="#FFE0A0"
        fillOpacity="0.95"
        fontFamily="System"
      >B</SvgText>
    </Svg>
  );
}

// ─── Silver Pill ──────────────────────────────────────────────────────────────
function SilverBadge({ scale }: { scale: number }) {
  const W = 52 * scale;
  const H = 18 * scale;
  const R = H / 2;

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        {/* Vertical metallic sweep */}
        <LinearGradient id="sBase" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#E2E2E8" />
          <Stop offset="28%"  stopColor="#B8B8C4" />
          <Stop offset="50%"  stopColor="#888898" />
          <Stop offset="72%"  stopColor="#B0B0C0" />
          <Stop offset="100%" stopColor="#D8D8E2" />
        </LinearGradient>
        {/* Diagonal shine band */}
        <LinearGradient id="sShine" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="30%"  stopColor="#FFFFFF" stopOpacity="0.6" />
          <Stop offset="55%"  stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        {/* Top bright edge */}
        <LinearGradient id="sTopEdge" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.4" />
          <Stop offset="30%"  stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        {/* Bottom dark edge */}
        <LinearGradient id="sBot" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="70%"  stopColor="#000000" stopOpacity="0" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.2" />
        </LinearGradient>
      </Defs>

      {/* Drop shadow */}
      <Rect x={scale} y={scale * 2.5} width={W - scale * 2} height={H - scale * 2} rx={R - scale} fill="rgba(0,0,0,0.3)" />

      {/* Base metallic pill */}
      <Rect x={0} y={0} width={W} height={H} rx={R} fill="url(#sBase)" />
      {/* Top highlight */}
      <Rect x={0} y={0} width={W} height={H} rx={R} fill="url(#sTopEdge)" />
      {/* Diagonal shine */}
      <Rect x={0} y={0} width={W} height={H} rx={R} fill="url(#sShine)" />
      {/* Bottom shadow */}
      <Rect x={0} y={0} width={W} height={H} rx={R} fill="url(#sBot)" />

      {/* Label shadow */}
      <SvgText
        x={W / 2 + scale * 0.5}
        y={H / 2 + scale * 2.5}
        textAnchor="middle"
        fontSize={scale * 7}
        fontWeight="800"
        fill="#444455"
        fillOpacity="0.4"
        fontFamily="System"
        letterSpacing={scale * 0.5}
      >SILVER</SvgText>
      {/* Label */}
      <SvgText
        x={W / 2}
        y={H / 2 + scale * 2.2}
        textAnchor="middle"
        fontSize={scale * 7}
        fontWeight="800"
        fill="#FFFFFF"
        fillOpacity="0.95"
        fontFamily="System"
        letterSpacing={scale * 0.5}
      >SILVER</SvgText>
    </Svg>
  );
}

// ─── Gold Crown Badge ─────────────────────────────────────────────────────────
function GoldBadge({ scale }: { scale: number }) {
  const W = 46 * scale;
  const H = 20 * scale;
  const R = H * 0.38;

  // Crown-shaped top edge: three peaks above a pill base
  // The pill base occupies the bottom 60% of H; crown peaks occupy the top 40%
  const baseY  = H * 0.38;
  const botR   = R * 0.65;
  const mid    = W / 2;
  const peakH  = baseY - scale * 1;

  const crownD = [
    `M ${botR} ${H}`,
    `Q 0 ${H} 0 ${H - botR}`,
    `L 0 ${baseY + botR}`,
    `Q 0 ${baseY} ${botR} ${baseY}`,
    `L ${mid * 0.28} ${baseY}`,
    `L ${mid * 0.42} ${peakH}`,
    `L ${mid * 0.56} ${baseY}`,
    `L ${mid * 0.88} ${baseY}`,
    `L ${mid} ${scale * 0.8}`,
    `L ${mid * 1.12} ${baseY}`,
    `L ${mid * 1.44} ${baseY}`,
    `L ${mid * 1.58} ${peakH}`,
    `L ${mid * 1.72} ${baseY}`,
    `Q ${W} ${baseY} ${W} ${baseY + botR}`,
    `L ${W} ${H - botR}`,
    `Q ${W} ${H} ${W - botR} ${H}`,
    'Z',
  ].join(' ');

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="gBase" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#FFE566" />
          <Stop offset="30%"  stopColor="#FFD700" />
          <Stop offset="65%"  stopColor="#D4900A" />
          <Stop offset="100%" stopColor="#B06800" />
        </LinearGradient>
        <LinearGradient id="gShine" x1="5%" y1="0%" x2="65%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFBE0" stopOpacity="0.7" />
          <Stop offset="45%"  stopColor="#FFFBE0" stopOpacity="0.15" />
          <Stop offset="100%" stopColor="#FFFBE0" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="gBot" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="60%"  stopColor="#000000" stopOpacity="0" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </LinearGradient>
      </Defs>

      {/* Drop shadow */}
      <Path d={crownD} fill="rgba(0,0,0,0.38)" transform={`translate(${scale * 0.5},${scale * 1.8})`} />
      {/* Gold fill */}
      <Path d={crownD} fill="url(#gBase)" />
      {/* Shine */}
      <Path d={crownD} fill="url(#gShine)" />
      {/* Bottom edge shadow */}
      <Path d={crownD} fill="url(#gBot)" />

      {/* Label shadow */}
      <SvgText
        x={mid + scale * 0.4}
        y={H - scale * 2.2}
        textAnchor="middle"
        fontSize={scale * 6.5}
        fontWeight="900"
        fill="#7A4000"
        fillOpacity="0.45"
        fontFamily="System"
        letterSpacing={scale * 0.4}
      >GOLD</SvgText>
      {/* Label */}
      <SvgText
        x={mid}
        y={H - scale * 2.5}
        textAnchor="middle"
        fontSize={scale * 6.5}
        fontWeight="900"
        fill="#FFF8D0"
        fillOpacity="0.97"
        fontFamily="System"
        letterSpacing={scale * 0.4}
      >GOLD</SvgText>
    </Svg>
  );
}

// ─── Diamond Gem Pill ─────────────────────────────────────────────────────────
function DiamondBadge({ scale }: { scale: number }) {
  const W = 64 * scale;
  const H = 20 * scale;
  const R = H / 2;

  // Facet points
  const cx    = W / 2;
  const cy    = H / 2;
  const fTop  = scale * 3.5;
  const fBot  = H - scale * 3.5;
  const fL    = scale * 8;
  const fR    = W - scale * 8;

  // Pill shape as path
  const pillD = `M ${R} 0 L ${W - R} 0 Q ${W} 0 ${W} ${R} L ${W} ${H - R} Q ${W} ${H} ${W - R} ${H} L ${R} ${H} Q 0 ${H} 0 ${H - R} L 0 ${R} Q 0 0 ${R} 0 Z`;

  // Facet polygons
  const topLeft    = `${fL},${fTop} ${cx},${fTop} ${cx},${cy}`; // top-left panel
  const topRight   = `${cx},${fTop} ${fR},${fTop} ${cx},${cy}`; // top-right panel
  const botLeft    = `${fL},${fBot} ${cx},${fBot} ${cx},${cy}`; // bottom-left
  const botRight   = `${cx},${fBot} ${fR},${fBot} ${cx},${cy}`; // bottom-right

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        {/* Base gem gradient: bright cyan → deep teal */}
        <LinearGradient id="dBase" x1="0%" y1="0%" x2="30%" y2="100%">
          <Stop offset="0%"   stopColor="#A8FFF0" />
          <Stop offset="35%"  stopColor="#5FE8C8" />
          <Stop offset="65%"  stopColor="#00B894" />
          <Stop offset="100%" stopColor="#006B5A" />
        </LinearGradient>
        {/* Top facet highlight */}
        <LinearGradient id="dTopL" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#D0FFF8" stopOpacity="0.75" />
          <Stop offset="100%" stopColor="#5FE8C8" stopOpacity="0.05" />
        </LinearGradient>
        {/* Bottom shadow facets */}
        <LinearGradient id="dBot" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#000000" stopOpacity="0.05" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
        </LinearGradient>
        {/* Overall top shine */}
        <LinearGradient id="dShine" x1="0%" y1="0%" x2="60%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.65" />
          <Stop offset="40%"  stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        {/* Bevel edge */}
        <LinearGradient id="dBevel" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.2" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
        </LinearGradient>
      </Defs>

      {/* Drop shadow */}
      <Rect x={scale} y={scale * 2.5} width={W - scale * 2} height={H - scale * 2} rx={R - scale} fill="rgba(0,0,0,0.38)" />

      {/* Gem body */}
      <Path d={pillD} fill="url(#dBase)" />
      {/* Bevel */}
      <Path d={pillD} fill="url(#dBevel)" />

      {/* Facet panels — drawn as polygons inside the pill */}
      {/* Top-left: bright */}
      <Path d={`M ${topLeft.split(' ').join(' L ')} Z`} fill="url(#dTopL)" />
      {/* Top-right: slightly darker */}
      <Path d={`M ${topRight.split(' ').join(' L ')} Z`} fill="rgba(0,180,150,0.25)" />
      {/* Bottom-left: shadow */}
      <Path d={`M ${botLeft.split(' ').join(' L ')} Z`} fill="url(#dBot)" />
      {/* Bottom-right: deeper shadow */}
      <Path d={`M ${botRight.split(' ').join(' L ')} Z`} fill="rgba(0,0,0,0.22)" />

      {/* Facet divider lines */}
      <Path d={`M ${fL} ${fTop} L ${cx} ${cy} L ${fR} ${fTop}`} stroke="rgba(255,255,255,0.25)" strokeWidth={scale * 0.5} fill="none" />
      <Path d={`M ${fL} ${fBot} L ${cx} ${cy} L ${fR} ${fBot}`} stroke="rgba(0,0,0,0.2)"       strokeWidth={scale * 0.5} fill="none" />
      <Path d={`M ${fL} ${fTop} L ${cx} ${cy} L ${fL} ${fBot}`} stroke="rgba(255,255,255,0.15)" strokeWidth={scale * 0.4} fill="none" />
      <Path d={`M ${fR} ${fTop} L ${cx} ${cy} L ${fR} ${fBot}`} stroke="rgba(0,0,0,0.15)"       strokeWidth={scale * 0.4} fill="none" />

      {/* Top shine */}
      <Path d={pillD} fill="url(#dShine)" />

      {/* Label shadow */}
      <SvgText
        x={cx + scale * 0.4}
        y={H / 2 + scale * 2.5}
        textAnchor="middle"
        fontSize={scale * 6.5}
        fontWeight="800"
        fill="#003830"
        fillOpacity="0.4"
        fontFamily="System"
        letterSpacing={scale * 0.35}
      >DIAMOND</SvgText>
      {/* Label */}
      <SvgText
        x={cx}
        y={H / 2 + scale * 2.2}
        textAnchor="middle"
        fontSize={scale * 6.5}
        fontWeight="800"
        fill="#E0FFF8"
        fillOpacity="0.97"
        fontFamily="System"
        letterSpacing={scale * 0.35}
      >DIAMOND</SvgText>
    </Svg>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function MsTierBadge({ tier, size = 'sm' }: MsTierBadgeProps) {
  const scale = size === 'xs' ? 0.72 : 1;

  if (tier === 'bronze')  return <BronzeBadge  scale={scale} />;
  if (tier === 'silver')  return <View style={s.wrap}><SilverBadge  scale={scale} /></View>;
  if (tier === 'gold')    return <View style={s.wrap}><GoldBadge    scale={scale} /></View>;
  return                         <View style={s.wrap}><DiamondBadge scale={scale} /></View>;
}

const s = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
});
