/**
 * MsShimmer — reusable shimmer skeleton component with reflection animation.
 * The shimmer sweeps left-to-right, matching native app polish standards.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface MsShimmerProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function MsShimmer({ width = '100%', height = 16, borderRadius = 6, style }: MsShimmerProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH * 1.5],
  });

  return (
    <View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: T.SURFACE_2, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.13)', 'rgba(255,255,255,0.07)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: SCREEN_WIDTH, height: '100%' }}
        />
      </Animated.View>
    </View>
  );
}

// ─── Post / feed card skeleton ─────────────────────────────────────────────────

export function MsShimmerPostCard() {
  return (
    <View style={shimStyles.card}>
      <View style={shimStyles.authorRow}>
        <MsShimmer width={36} height={36} borderRadius={18} />
        <View style={{ flex: 1, gap: 7 }}>
          <MsShimmer width="48%" height={11} />
          <MsShimmer width="32%" height={9} />
        </View>
      </View>
      <View style={shimStyles.caption}>
        <MsShimmer width="88%" height={11} />
        <MsShimmer width="65%" height={11} />
      </View>
      <MsShimmer width="100%" height={210} borderRadius={0} />
      <View style={shimStyles.actions}>
        <MsShimmer width={54} height={28} borderRadius={14} />
        <MsShimmer width={54} height={28} borderRadius={14} />
      </View>
    </View>
  );
}

// ─── User row skeleton ─────────────────────────────────────────────────────────

export function MsShimmerUserRow() {
  return (
    <View style={shimStyles.userRow}>
      <MsShimmer width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, gap: 7 }}>
        <MsShimmer width="52%" height={12} />
        <MsShimmer width="36%" height={10} />
      </View>
    </View>
  );
}

// ─── Video card skeleton ───────────────────────────────────────────────────────

export function MsShimmerVideoCard() {
  const cardW = SCREEN_WIDTH - 24;
  return (
    <View style={[shimStyles.card, { paddingBottom: 16 }]}>
      <MsShimmer width={cardW} height={cardW * 0.56} borderRadius={12} />
      <View style={{ paddingHorizontal: 12, paddingTop: 10, gap: 7 }}>
        <View style={shimStyles.authorRow}>
          <MsShimmer width={28} height={28} borderRadius={14} />
          <View style={{ flex: 1, gap: 6 }}>
            <MsShimmer width="55%" height={10} />
            <MsShimmer width="35%" height={9} />
          </View>
        </View>
        <MsShimmer width="70%" height={11} />
        <MsShimmer width="40%" height={9} />
      </View>
    </View>
  );
}

// ─── Explore 2-column grid card skeleton ──────────────────────────────────────

export function MsShimmerGridCard({ size }: { size: number }) {
  return (
    <View style={{ gap: 6 }}>
      <MsShimmer width={size} height={size} borderRadius={10} />
      <MsShimmer width={size * 0.7} height={10} />
      <MsShimmer width={size * 0.45} height={9} />
    </View>
  );
}

export function MsShimmerExploreGrid() {
  const colW = (SCREEN_WIDTH - 28) / 2;
  return (
    <View style={{ paddingHorizontal: 8, paddingTop: 8, gap: 10 }}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={{ flexDirection: 'row', gap: 10 }}>
          <MsShimmerGridCard size={colW} />
          <MsShimmerGridCard size={colW} />
        </View>
      ))}
    </View>
  );
}

// ─── Comment row skeleton ──────────────────────────────────────────────────────

export function MsShimmerCommentRow() {
  return (
    <View style={shimStyles.commentRow}>
      <MsShimmer width={34} height={34} borderRadius={17} />
      <View style={{ flex: 1, gap: 7 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MsShimmer width="28%" height={10} />
          <MsShimmer width="16%" height={9} />
        </View>
        <MsShimmer width="75%" height={32} borderRadius={14} />
        <MsShimmer width="30%" height={9} />
      </View>
    </View>
  );
}

export function MsShimmerCommentsList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 0 }}>
      {Array.from({ length: count }).map((_, i) => (
        <MsShimmerCommentRow key={i} />
      ))}
    </View>
  );
}

// ─── Chat message skeleton ─────────────────────────────────────────────────────

export function MsShimmerChatMessage({ own = false }: { own?: boolean }) {
  const maxW = SCREEN_WIDTH * 0.65;
  return (
    <View style={[shimStyles.chatMsg, own && { alignItems: 'flex-end' }]}>
      {!own && <MsShimmer width={28} height={28} borderRadius={14} />}
      <View style={{ maxWidth: maxW, gap: 4 }}>
        <MsShimmer width={maxW * (0.5 + Math.random() * 0.4)} height={38} borderRadius={16} />
      </View>
    </View>
  );
}

export function MsShimmerChatList() {
  return (
    <View style={{ gap: 12, paddingHorizontal: 12, paddingVertical: 16 }}>
      <MsShimmerChatMessage own={false} />
      <MsShimmerChatMessage own />
      <MsShimmerChatMessage own={false} />
      <MsShimmerChatMessage own />
      <MsShimmerChatMessage own={false} />
    </View>
  );
}

// ─── Search result skeleton ────────────────────────────────────────────────────

export function MsShimmerSearchResult() {
  return (
    <View style={shimStyles.searchRow}>
      <MsShimmer width={42} height={42} borderRadius={21} />
      <View style={{ flex: 1, gap: 7 }}>
        <MsShimmer width="45%" height={12} />
        <MsShimmer width="30%" height={10} />
      </View>
      <MsShimmer width={64} height={28} borderRadius={14} />
    </View>
  );
}

export function MsShimmerSearchList({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <MsShimmerSearchResult key={i} />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const shimStyles = StyleSheet.create({
  card: { backgroundColor: T.BG, paddingBottom: 8 },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  caption: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 7,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  chatMsg: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
});
