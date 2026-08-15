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
// Mirrors the real chat layout: a date chip, then alternating incoming (avatar +
// bubble) and outgoing (bubble, right-aligned) messages. Uses the SAME bubble
// colours as MsTextBubble (#1C1C23 incoming, #28282F outgoing) and the real
// 8px-radius tail-corner shape. Widths are deterministic (no Math.random) so the
// skeleton never flickers between renders.

const CHAT_BUBBLE_COLOR_OWN   = '#28282F'; // outgoing  (MsTextBubble BG_OWN)
const CHAT_BUBBLE_COLOR_OTHER = '#1C1C23'; // incoming  (MsTextBubble BG_OTHER)
// Deterministic bubble widths, cycled per row.
const CHAT_BUBBLE_WIDTHS = [176, 214, 132, 198, 240, 150, 186, 224, 140, 208];

export function MsShimmerChatMessage({
  own = false,
  width,
  lines = 1,
}: {
  own?: boolean;
  width?: number;
  lines?: 1 | 2;
}) {
  const bubbleW = width ?? (own ? 180 : 220);
  const bubbleH = lines === 2 ? 50 : 34;
  const bubbleColor = own ? CHAT_BUBBLE_COLOR_OWN : CHAT_BUBBLE_COLOR_OTHER;
  const tailRadius = own
    ? { borderBottomRightRadius: 3 }
    : { borderBottomLeftRadius: 3 };
  return (
    <View style={[shimStyles.chatMsg, own ? shimStyles.chatMsgOwn : shimStyles.chatMsgOther]}>
      {!own && <MsShimmer width={26} height={26} borderRadius={13} />}
      <MsShimmer
        width={bubbleW}
        height={bubbleH}
        borderRadius={8}
        style={{ backgroundColor: bubbleColor, ...tailRadius }}
      />
    </View>
  );
}

export function MsShimmerChatList({ count = 8 }: { count?: number }) {
  // A natural conversation rhythm: incoming/outgoing with 1–2 line bubbles.
  const rhythm = [
    { own: false, lines: 2 },
    { own: true,  lines: 1 },
    { own: false, lines: 1 },
    { own: true,  lines: 2 },
    { own: false, lines: 2 },
    { own: true,  lines: 1 },
    { own: false, lines: 1 },
    { own: true,  lines: 1 },
  ] as const;
  return (
    <View style={shimStyles.chatList}>
      {/* Date separator chip */}
      <View style={shimStyles.chatDateChip}>
        <MsShimmer width={104} height={16} borderRadius={8} />
      </View>
      {Array.from({ length: count }).map((_, i) => {
        const r = rhythm[i % rhythm.length];
        return (
          <MsShimmerChatMessage
            key={i}
            own={r.own}
            lines={r.lines}
            width={CHAT_BUBBLE_WIDTHS[i % CHAT_BUBBLE_WIDTHS.length]}
          />
        );
      })}
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

// ─── Creator profile skeleton ─────────────────────────────────────────────────

export function MsShimmerCreatorProfile() {
  return (
    <View style={{ backgroundColor: 'transparent' }}>
      {/* Banner */}
      <MsShimmer width="100%" height={160} borderRadius={0} />
      {/* Avatar + subscribe row */}
      <View style={{ paddingHorizontal: 20, marginTop: -36, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <MsShimmer width={72} height={72} borderRadius={36} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          <MsShimmer width={72} height={32} borderRadius={16} />
          <MsShimmer width={90} height={32} borderRadius={16} />
        </View>
      </View>
      {/* Name + handle */}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 8 }}>
        <MsShimmer width="44%" height={16} />
        <MsShimmer width="28%" height={11} />
        <MsShimmer width="80%" height={10} />
        <MsShimmer width="60%" height={10} />
      </View>
      {/* Metrics row */}
      <View style={{ paddingHorizontal: 20, paddingTop: 18, flexDirection: 'row', gap: 28 }}>
        <View style={{ gap: 6 }}>
          <MsShimmer width={44} height={16} />
          <MsShimmer width={64} height={10} />
        </View>
        <View style={{ gap: 6 }}>
          <MsShimmer width={36} height={16} />
          <MsShimmer width={48} height={10} />
        </View>
      </View>
      {/* Tab bar */}
      <View style={{ flexDirection: 'row', gap: 0, marginTop: 24, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
        {[72, 56, 60, 52].map((w, i) => (
          <View key={i} style={{ paddingHorizontal: 12, paddingBottom: 14 }}>
            <MsShimmer width={w} height={11} borderRadius={6} />
          </View>
        ))}
      </View>
      {/* Content grid */}
      <View style={{ paddingHorizontal: 10, paddingTop: 12, gap: 10 }}>
        {[0, 1].map((row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 10 }}>
            {[0, 1].map((col) => {
              const w = (SCREEN_WIDTH - 30) / 2;
              return (
                <View key={col} style={{ gap: 6 }}>
                  <MsShimmer width={w} height={w} borderRadius={10} />
                  <MsShimmer width={w * 0.7} height={10} />
                  <MsShimmer width={w * 0.45} height={9} />
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Profile page skeleton (personal profile) ─────────────────────────────────

export function MsShimmerProfileHeader() {
  return (
    <View style={{ backgroundColor: 'transparent' }}>
      {/* Banner */}
      <MsShimmer width="100%" height={130} borderRadius={0} />
      {/* Avatar row */}
      <View style={{ paddingHorizontal: 16, marginTop: -40, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <MsShimmer width={80} height={80} borderRadius={40} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          <MsShimmer width={36} height={36} borderRadius={18} />
          <MsShimmer width={36} height={36} borderRadius={18} />
        </View>
      </View>
      {/* Name + stats */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        <MsShimmer width="50%" height={17} />
        <MsShimmer width="30%" height={11} />
        <MsShimmer width="75%" height={10} />
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 4 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ gap: 5 }}>
              <MsShimmer width={32} height={14} />
              <MsShimmer width={52} height={9} />
            </View>
          ))}
        </View>
      </View>
      {/* Tab bar */}
      <View style={{ flexDirection: 'row', marginTop: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', paddingBottom: 14 }}>
            <MsShimmer width={20} height={20} borderRadius={10} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Video watch page skeleton ─────────────────────────────────────────────────

export function MsShimmerVideoWatch() {
  return (
    <View style={{ backgroundColor: 'transparent' }}>
      {/* Player area (16:9) */}
      <MsShimmer width="100%" height={Math.round(SCREEN_WIDTH * 9 / 16)} borderRadius={0} />
      {/* Video metadata */}
      <View style={{ padding: 16, gap: 10 }}>
        <MsShimmer width="88%" height={16} />
        <MsShimmer width="64%" height={13} />
        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
          <MsShimmer width={56} height={10} />
          <MsShimmer width={44} height={10} />
          <MsShimmer width={60} height={10} />
        </View>
      </View>
      {/* Creator row */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MsShimmer width={42} height={42} borderRadius={21} />
        <View style={{ flex: 1, gap: 7 }}>
          <MsShimmer width="38%" height={12} />
          <MsShimmer width="24%" height={10} />
        </View>
        <MsShimmer width={86} height={32} borderRadius={16} />
      </View>
      {/* Action bar */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 20, gap: 8 }}>
        {[64, 64, 64, 64].map((w, i) => (
          <MsShimmer key={i} width={w} height={36} borderRadius={18} />
        ))}
      </View>
      {/* Divider */}
      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 12 }} />
      {/* Related videos */}
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingBottom: 14 }}>
          <MsShimmer width={120} height={68} borderRadius={8} />
          <View style={{ flex: 1, gap: 7, paddingTop: 2 }}>
            <MsShimmer width="85%" height={12} />
            <MsShimmer width="60%" height={12} />
            <MsShimmer width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── DM chat room list skeleton ──────────────────────────────────────────────

export function MsShimmerDmList({ count = 5 }: { count?: number }) {
  return (
    <View style={{ paddingTop: 4 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 }}>
          <MsShimmer width={48} height={48} borderRadius={24} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <MsShimmer width="38%" height={12} />
              <MsShimmer width={32} height={10} />
            </View>
            <MsShimmer width="65%" height={10} />
          </View>
        </View>
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
  chatMsgOwn: {
    justifyContent: 'flex-end',
  },
  chatMsgOther: {
    justifyContent: 'flex-start',
  },
  chatList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  chatDateChip: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
});