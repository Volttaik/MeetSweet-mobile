/**
 * MsReactionStrip — animated reaction pills below a message bubble.
 *
 * Each pill pops in with a scale + fade animation when it first appears.
 * Tap a pill to toggle your own reaction.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { T } from '@/constants/theme';
import type { MessageReaction } from '@kesha-antonov/react-native-chat';

interface Props {
  reactions: MessageReaction[];
  position: 'left' | 'right';
  onPress?: (emoji: string) => void;
}

// ── Animated pill ──────────────────────────────────────────────────────────────
function ReactionPill({
  emoji,
  count,
  onPress,
  delay,
}: {
  emoji: string;
  count: number;
  onPress?: () => void;
  delay: number;
}) {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 200,
        delay,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <TouchableOpacity
        style={s.pill}
        onPress={onPress}
        activeOpacity={0.72}
        hitSlop={4}
      >
        <Text style={s.emoji}>{emoji}</Text>
        {count > 1 ? <Text style={s.count}>{count}</Text> : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Strip ──────────────────────────────────────────────────────────────────────
export function MsReactionStrip({ reactions, position, onPress }: Props) {
  if (!reactions.length) return null;

  // Group by emoji
  const grouped = new Map<string, number>();
  for (const r of reactions) {
    grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + r.userIds.length);
  }

  const isOwn = position === 'right';

  return (
    <View style={[s.row, isOwn ? s.rowRight : s.rowLeft]}>
      {Array.from(grouped.entries()).map(([emoji, count], idx) => (
        <ReactionPill
          key={emoji}
          emoji={emoji}
          count={count}
          delay={idx * 35}
          onPress={() => onPress?.(emoji)}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 4,
  },
  rowLeft:  { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: T.SURFACE_2,
    borderRadius: 50,
    paddingHorizontal: 9,
    paddingVertical: 4,
    ...T.SHADOWS.soft,
  },

  emoji: { fontSize: 13 },
  count: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
  },
});
