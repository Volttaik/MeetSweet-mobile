/**
 * MsTierBadge — rock/mineral-inspired SVG tier badges for MeetSweet.
 *
 * Each badge is designed to look like a real physical mineral/gemstone:
 *
 * Bronze  → rough copper-rust stone (compact rounded rock)
 * Silver  → smooth grey river pebble (elongated mineral)
 * Gold    → golden nugget with bright facets
 * Diamond → aqua crystalline gem with cut facets
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Ellipse,
  Text as SvgText,
  Polygon,
} from 'react-native-svg';
import type { ContentTier } from '@/constants/tiers';

interface MsTierBadgeProps {
  tier: ContentTier;
  /** xs = tiny (post card header); sm = standard */
  size?: 'xs' | 'sm';
}

// ─── Bronze Rock ──────────────────────────────────────────────────────────────
// A rough, compact copper-rust stone — irregular organic shape with lit top face
function BronzeBadge({ scale }: { scale: number }) {
  const W = 22 * scale;
  const H = 20 * scale;

  // Rock shape: slightly irregular rounded polygon (organic, not perfect oval)
  const s = scale;
  const rockPath = [
    `M ${4.5 * s} ${1.5 * s}`,
    `Q ${9 * s} ${-0.5 * s} ${14.5 * s} ${1 * s}`,
    `Q ${20 * s} ${2.5 * s} ${21.5 * s} ${7 * s}`,
    `Q ${23 * s} ${12.5 * s} ${20 * s} ${16.5 * s}`,
    `Q ${17 * s} ${21 * s} ${11.5 * s} ${21 * s}`,
    `Q ${6 * s} ${21.5 * s} ${2.5 * s} ${18 * s}`,
    `Q ${-1 * s} ${15 * s} ${0.5 * s} ${9.5 * s}`,
    `Q ${1 * s} ${3.5 * s} ${4.5 * s} ${1.5 * s} Z`,
  ].join(' ');

  // Top-left bright face highlight (flat facet)
  const faceHighlight = [
    `M ${5 * s} ${3 * s}`,
    `L ${14 * s} ${2.5 * s}`,
    `L ${11 * s} ${10 * s}`,
    `L ${4 * s} ${11 * s} Z`,
  ].join(' ');

  // Bottom-right dark face
  const faceDark = [
    `M ${12 * s} ${10.5 * s}`,
    `L ${20 * s} ${8 * s}`,
    `L ${20 * s} ${16 * s}`,
    `L ${12 * s} ${18 * s} Z`,
  ].join(' ');

  return (
    <Svg width={W + 2 * s} height={H + 3 * s} viewBox={`${-1 * s} ${-1 * s} ${W + 3 * s} ${H + 4 * s}`}>
      <Defs>
        {/* Base rock: copper-rust gradient, top-left warm → bottom-right dark */}
        <LinearGradient id="brBase" x1="10%" y1="5%" x2="85%" y2="95%">
          <Stop offset="0%"   stopColor="#E8863A" />
          <Stop offset="25%"  stopColor="#C6631E" />
          <Stop offset="55%"  stopColor="#9B4410" />
          <Stop offset="80%"  stopColor="#6E2A08" />
          <Stop offset="100%" stopColor="#4A1A04" />
        </LinearGradient>
        {/* Bright face — warm golden highlights on lit surface */}
        <LinearGradient id="brFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#FFB850" stopOpacity="0.55" />
          <Stop offset="100%" stopColor="#D47A28" stopOpacity="0.05" />
        </LinearGradient>
        {/* Dark face shadow */}
        <LinearGradient id="brDark" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#000000" stopOpacity="0.08" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
        </LinearGradient>
        {/* Top sheen */}
        <LinearGradient id="brSheen" x1="0%" y1="0%" x2="60%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.35" />
          <Stop offset="50%"  stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Drop shadow */}
      <Ellipse
        cx={11 * s + 1 * s}
        cy={H + 2 * s}
        rx={9 * s}
        ry={2 * s}
        fill="rgba(0,0,0,0.4)"
      />

      {/* Rock body */}
      <Path d={rockPath} fill="url(#brBase)" />

      {/* Lit top-left face */}
      <Path d={faceHighlight} fill="url(#brFace)" />

      {/* Dark bottom-right face */}
      <Path d={faceDark} fill="url(#brDark)" />

      {/* Surface sheen */}
      <Path d={rockPath} fill="url(#brSheen)" />

      {/* Facet edge line (where faces meet) */}
      <Path
        d={`M ${5 * s} ${3 * s} L ${12 * s} ${10 * s} L ${20 * s} ${8 * s}`}
        stroke="rgba(255,200,100,0.35)"
        strokeWidth={0.8 * s}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d={`M ${4 * s} ${11 * s} L ${12 * s} ${10 * s} L ${12 * s} ${18 * s}`}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={0.6 * s}
        fill="none"
        strokeLinecap="round"
      />

      {/* Letter B — engraved shadow */}
      <SvgText
        x={11.5 * s}
        y={13.5 * s}
        textAnchor="middle"
        fontSize={9 * s}
        fontWeight="900"
        fill="#3A1200"
        fillOpacity="0.55"
        fontFamily="System"
      >B</SvgText>
      {/* Letter B — main */}
      <SvgText
        x={11 * s}
        y={13 * s}
        textAnchor="middle"
        fontSize={9 * s}
        fontWeight="900"
        fill="#FFE0A0"
        fillOpacity="0.9"
        fontFamily="System"
      >B</SvgText>
    </Svg>
  );
}

// ─── Silver Rock ──────────────────────────────────────────────────────────────
// Smooth elongated river pebble — cool grey mineral with matte facets
function SilverBadge({ scale }: { scale: number }) {
  const W = 52 * scale;
  const H = 18 * scale;
  const s = scale;

  // Elongated rock shape with slight top irregularity (organic stone, not perfect pill)
  const rockPath = [
    `M ${8 * s} ${0.5 * s}`,
    `Q ${18 * s} ${-1 * s} ${28 * s} ${0.5 * s}`,
    `Q ${38 * s} ${-0.5 * s} ${45 * s} ${1 * s}`,
    `Q ${53 * s} ${2 * s} ${53 * s} ${9 * s}`,
    `Q ${53 * s} ${17 * s} ${45 * s} ${18.5 * s}`,
    `Q ${36 * s} ${20 * s} ${26 * s} ${18.5 * s}`,
    `Q ${16 * s} ${20 * s} ${8 * s} ${18.5 * s}`,
    `Q ${-1 * s} ${17 * s} ${-0.5 * s} ${9 * s}`,
    `Q ${-1 * s} ${2 * s} ${8 * s} ${0.5 * s} Z`,
  ].join(' ');

  // Top face (light catches on the flat top)
  const topFace = [
    `M ${8 * s} ${1 * s}`,
    `L ${45 * s} ${1 * s}`,
    `L ${40 * s} ${8 * s}`,
    `L ${12 * s} ${8 * s} Z`,
  ].join(' ');

  return (
    <Svg width={W + 2 * s} height={H + 3 * s} viewBox={`${-1 * s} ${-1 * s} ${W + 3 * s} ${H + 4 * s}`}>
      <Defs>
        {/* Rock body: steely grey mineral */}
        <LinearGradient id="svBase" x1="0%" y1="0%" x2="20%" y2="100%">
          <Stop offset="0%"   stopColor="#C8C8D2" />
          <Stop offset="20%"  stopColor="#A0A0B0" />
          <Stop offset="50%"  stopColor="#6E6E7E" />
          <Stop offset="75%"  stopColor="#525262" />
          <Stop offset="100%" stopColor="#35353F" />
        </LinearGradient>
        {/* Top face: bright lit surface */}
        <LinearGradient id="svTop" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#E8E8F2" stopOpacity="0.7" />
          <Stop offset="100%" stopColor="#A0A0B8" stopOpacity="0.1" />
        </LinearGradient>
        {/* Diagonal sheen band */}
        <LinearGradient id="svSheen" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="25%"  stopColor="#FFFFFF" stopOpacity="0.45" />
          <Stop offset="55%"  stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        {/* Bottom shadow */}
        <LinearGradient id="svBot" x1="0%" y1="50%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#000000" stopOpacity="0" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
        </LinearGradient>
      </Defs>

      {/* Drop shadow */}
      <Ellipse
        cx={26 * s + 0.5 * s}
        cy={H + 2 * s}
        rx={22 * s}
        ry={2.5 * s}
        fill="rgba(0,0,0,0.35)"
      />

      {/* Rock body */}
      <Path d={rockPath} fill="url(#svBase)" />

      {/* Top lit face */}
      <Path d={topFace} fill="url(#svTop)" />

      {/* Diagonal sheen */}
      <Path d={rockPath} fill="url(#svSheen)" />

      {/* Bottom shadow */}
      <Path d={rockPath} fill="url(#svBot)" />

      {/* Facet edge line */}
      <Path
        d={`M ${12 * s} ${8 * s} L ${40 * s} ${8 * s}`}
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={0.7 * s}
        fill="none"
      />

      {/* Label shadow */}
      <SvgText
        x={26.5 * s}
        y={14 * s}
        textAnchor="middle"
        fontSize={7 * s}
        fontWeight="800"
        fill="#1A1A28"
        fillOpacity="0.45"
        fontFamily="System"
        letterSpacing={0.6 * s}
      >SILVER</SvgText>
      {/* Label */}
      <SvgText
        x={26 * s}
        y={13.5 * s}
        textAnchor="middle"
        fontSize={7 * s}
        fontWeight="800"
        fill="#F0F0FF"
        fillOpacity="0.97"
        fontFamily="System"
        letterSpacing={0.6 * s}
      >SILVER</SvgText>
    </Svg>
  );
}

// ─── Gold Rock ────────────────────────────────────────────────────────────────
// Golden mineral nugget — warm faceted stone with rich gold tones
function GoldBadge({ scale }: { scale: number }) {
  const W = 46 * scale;
  const H = 20 * scale;
  const s = scale;

  // Nugget shape: slightly bulging organic rock (top has small bumps)
  const rockPath = [
    `M ${7 * s} ${1 * s}`,
    `Q ${14 * s} ${-1.5 * s} ${20 * s} ${0.5 * s}`,
    `Q ${26 * s} ${-1 * s} ${32 * s} ${0.5 * s}`,
    `Q ${40 * s} ${1 * s} ${45 * s} ${5 * s}`,
    `Q ${48 * s} ${10 * s} ${45 * s} ${16 * s}`,
    `Q ${41 * s} ${21 * s} ${33 * s} ${21.5 * s}`,
    `Q ${23 * s} ${22.5 * s} ${13 * s} ${21 * s}`,
    `Q ${4 * s} ${20 * s} ${1 * s} ${15 * s}`,
    `Q ${-2 * s} ${9 * s} ${2 * s} ${5 * s}`,
    `Q ${4 * s} ${2 * s} ${7 * s} ${1 * s} Z`,
  ].join(' ');

  // Upper-left lit facet
  const litFacet = [
    `M ${7 * s} ${1.5 * s}`,
    `L ${32 * s} ${1 * s}`,
    `L ${26 * s} ${9.5 * s}`,
    `L ${8 * s} ${10 * s} Z`,
  ].join(' ');

  // Right shadow facet
  const darkFacet = [
    `M ${27 * s} ${10 * s}`,
    `L ${45 * s} ${5.5 * s}`,
    `L ${45 * s} ${16 * s}`,
    `L ${27 * s} ${19 * s} Z`,
  ].join(' ');

  return (
    <Svg width={W + 2 * s} height={H + 4 * s} viewBox={`${-2 * s} ${-1.5 * s} ${W + 4 * s} ${H + 5 * s}`}>
      <Defs>
        {/* Rock body: deep gold mineral */}
        <LinearGradient id="gdBase" x1="5%" y1="0%" x2="85%" y2="100%">
          <Stop offset="0%"   stopColor="#FFD84A" />
          <Stop offset="22%"  stopColor="#EDB820" />
          <Stop offset="50%"  stopColor="#C88E00" />
          <Stop offset="78%"  stopColor="#9A6600" />
          <Stop offset="100%" stopColor="#6A4200" />
        </LinearGradient>
        {/* Lit facet: warm bright gold */}
        <LinearGradient id="gdLit" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFAAA" stopOpacity="0.65" />
          <Stop offset="100%" stopColor="#FFD84A" stopOpacity="0.05" />
        </LinearGradient>
        {/* Shadow facet */}
        <LinearGradient id="gdDark" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#000000" stopOpacity="0.05" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.42" />
        </LinearGradient>
        {/* Surface sheen */}
        <LinearGradient id="gdSheen" x1="0%" y1="0%" x2="70%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.4" />
          <Stop offset="45%"  stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Drop shadow */}
      <Ellipse
        cx={23 * s + 0.5 * s}
        cy={H + 3 * s}
        rx={19 * s}
        ry={2.5 * s}
        fill="rgba(0,0,0,0.38)"
      />

      {/* Rock body */}
      <Path d={rockPath} fill="url(#gdBase)" />

      {/* Lit upper-left facet */}
      <Path d={litFacet} fill="url(#gdLit)" />

      {/* Dark right facet */}
      <Path d={darkFacet} fill="url(#gdDark)" />

      {/* Surface sheen */}
      <Path d={rockPath} fill="url(#gdSheen)" />

      {/* Facet divider lines */}
      <Path
        d={`M ${8 * s} ${10 * s} L ${27 * s} ${9.5 * s} L ${45 * s} ${5.5 * s}`}
        stroke="rgba(255,220,100,0.4)"
        strokeWidth={0.8 * s}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d={`M ${8 * s} ${10 * s} L ${27 * s} ${10 * s} L ${27 * s} ${19 * s}`}
        stroke="rgba(0,0,0,0.22)"
        strokeWidth={0.6 * s}
        fill="none"
        strokeLinecap="round"
      />

      {/* Label shadow */}
      <SvgText
        x={23.5 * s}
        y={16 * s}
        textAnchor="middle"
        fontSize={7 * s}
        fontWeight="900"
        fill="#3C2200"
        fillOpacity="0.5"
        fontFamily="System"
        letterSpacing={0.5 * s}
      >GOLD</SvgText>
      {/* Label */}
      <SvgText
        x={23 * s}
        y={15.5 * s}
        textAnchor="middle"
        fontSize={7 * s}
        fontWeight="900"
        fill="#FFFBC8"
        fillOpacity="0.97"
        fontFamily="System"
        letterSpacing={0.5 * s}
      >GOLD</SvgText>
    </Svg>
  );
}

// ─── Diamond Rock ─────────────────────────────────────────────────────────────
// Crystalline aqua gem-rock — sharp facets with deep brilliant tones
function DiamondBadge({ scale }: { scale: number }) {
  const W = 64 * scale;
  const H = 20 * scale;
  const s = scale;

  // Crystal rock shape: elongated with slight angular irregularity suggesting cut facets
  const rockPath = [
    `M ${9 * s} ${1 * s}`,
    `Q ${22 * s} ${-1 * s} ${34 * s} ${0.5 * s}`,
    `Q ${46 * s} ${-1 * s} ${57 * s} ${1 * s}`,
    `Q ${65 * s} ${2 * s} ${65 * s} ${10 * s}`,
    `Q ${65 * s} ${18 * s} ${57 * s} ${19.5 * s}`,
    `Q ${44 * s} ${21 * s} ${32 * s} ${19.5 * s}`,
    `Q ${20 * s} ${21 * s} ${9 * s} ${19.5 * s}`,
    `Q ${-1 * s} ${18 * s} ${-0.5 * s} ${10 * s}`,
    `Q ${-1 * s} ${2 * s} ${9 * s} ${1 * s} Z`,
  ].join(' ');

  // Four facet planes of the cut gem
  const topLeft  = `${9 * s},${1.5 * s} ${34 * s},${1 * s} ${30 * s},${9 * s} ${13 * s},${9.5 * s}`;
  const topRight = `${34 * s},${1 * s} ${57 * s},${1.5 * s} ${51 * s},${9 * s} ${30 * s},${9 * s}`;
  const botLeft  = `${13 * s},${9.5 * s} ${30 * s},${9.5 * s} ${28 * s},${18 * s} ${9 * s},${18.5 * s}`;
  const botRight = `${30 * s},${9.5 * s} ${51 * s},${9 * s} ${57 * s},${18.5 * s} ${28 * s},${18 * s}`;

  return (
    <Svg width={W + 2 * s} height={H + 3 * s} viewBox={`${-1 * s} ${-1 * s} ${W + 3 * s} ${H + 4 * s}`}>
      <Defs>
        {/* Base gem: bright aqua → deep teal */}
        <LinearGradient id="dmBase" x1="0%" y1="0%" x2="35%" y2="100%">
          <Stop offset="0%"   stopColor="#9DFFE8" />
          <Stop offset="30%"  stopColor="#4CD9C0" />
          <Stop offset="60%"  stopColor="#00A884" />
          <Stop offset="100%" stopColor="#005F4C" />
        </LinearGradient>
        {/* Top-left facet: brighter (light source) */}
        <LinearGradient id="dmTL" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#E0FFFA" stopOpacity="0.75" />
          <Stop offset="100%" stopColor="#4CD9C0" stopOpacity="0.08" />
        </LinearGradient>
        {/* Top-right facet: medium */}
        <LinearGradient id="dmTR" x1="100%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#60D8C0" stopOpacity="0.4" />
          <Stop offset="100%" stopColor="#00A884" stopOpacity="0.05" />
        </LinearGradient>
        {/* Bot-left facet: medium shadow */}
        <LinearGradient id="dmBL" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#000000" stopOpacity="0.05" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
        </LinearGradient>
        {/* Bot-right facet: deepest shadow */}
        <LinearGradient id="dmBR" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#000000" stopOpacity="0.1" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
        </LinearGradient>
        {/* Overall sheen */}
        <LinearGradient id="dmSheen" x1="0%" y1="0%" x2="55%" y2="100%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.5" />
          <Stop offset="35%"  stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Drop shadow */}
      <Ellipse
        cx={32 * s + 0.5 * s}
        cy={H + 2.5 * s}
        rx={27 * s}
        ry={2.5 * s}
        fill="rgba(0,0,0,0.38)"
      />

      {/* Gem body */}
      <Path d={rockPath} fill="url(#dmBase)" />

      {/* Facet planes */}
      <Polygon points={topLeft}  fill="url(#dmTL)" />
      <Polygon points={topRight} fill="url(#dmTR)" />
      <Polygon points={botLeft}  fill="url(#dmBL)" />
      <Polygon points={botRight} fill="url(#dmBR)" />

      {/* Surface sheen */}
      <Path d={rockPath} fill="url(#dmSheen)" />

      {/* Facet divider lines — the cut edges of the gem */}
      <Path
        d={`M ${13 * s} ${9.5 * s} L ${30 * s} ${9.5 * s} L ${51 * s} ${9 * s}`}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={0.7 * s}
        fill="none"
      />
      <Path
        d={`M ${30 * s} ${9.5 * s} L ${28 * s} ${18 * s}`}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={0.5 * s}
        fill="none"
      />
      <Path
        d={`M ${9 * s} ${1.5 * s} L ${13 * s} ${9.5 * s} L ${9 * s} ${18.5 * s}`}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={0.5 * s}
        fill="none"
      />
      <Path
        d={`M ${57 * s} ${1.5 * s} L ${51 * s} ${9 * s} L ${57 * s} ${18.5 * s}`}
        stroke="rgba(0,0,0,0.18)"
        strokeWidth={0.5 * s}
        fill="none"
      />

      {/* Label shadow */}
      <SvgText
        x={32.5 * s}
        y={14.5 * s}
        textAnchor="middle"
        fontSize={6.5 * s}
        fontWeight="800"
        fill="#003028"
        fillOpacity="0.45"
        fontFamily="System"
        letterSpacing={0.4 * s}
      >DIAMOND</SvgText>
      {/* Label */}
      <SvgText
        x={32 * s}
        y={14 * s}
        textAnchor="middle"
        fontSize={6.5 * s}
        fontWeight="800"
        fill="#E0FFF8"
        fillOpacity="0.97"
        fontFamily="System"
        letterSpacing={0.4 * s}
      >DIAMOND</SvgText>
    </Svg>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function MsTierBadge({ tier, size = 'sm' }: MsTierBadgeProps) {
  const scale = size === 'xs' ? 0.72 : 1;

  if (tier === 'bronze')  return <View style={s.wrap}><BronzeBadge  scale={scale} /></View>;
  if (tier === 'silver')  return <View style={s.wrap}><SilverBadge  scale={scale} /></View>;
  if (tier === 'gold')    return <View style={s.wrap}><GoldBadge    scale={scale} /></View>;
  return                         <View style={s.wrap}><DiamondBadge scale={scale} /></View>;
}

const s = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
});
