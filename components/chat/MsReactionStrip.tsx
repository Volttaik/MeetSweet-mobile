/**
 * MsReactionStrip — reaction pills displayed below a message bubble.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { T } from '@/constants/theme';
import type { MessageReaction } from '@kesha-antonov/react-native-chat';

interface Props {
  reactions: MessageReaction[];
  position: 'left' | 'right';
  onPress?: (emoji: string) => void;
}

export function MsReactionStrip({ reactions, position, onPress }: Props) {
  if (!reactions.length) return null;

  // Group by emoji
  const grouped = new Map<string, number>();
  for (const r of reactions) {
    grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + r.userIds.length);
  }

  const isOwn = position === 'right';

  return (
    <View style={[styles.row, isOwn ? styles.rowRight : styles.rowLeft]}>
      {Array.from(grouped.entries()).map(([emoji, count]) => (
        <TouchableOpacity
          key={emoji}
          style={styles.pill}
          onPress={() => onPress?.(emoji)}
          activeOpacity={0.75}
          hitSlop={4}
        >
          <Text style={styles.emoji}>{emoji}</Text>
          {count > 1 ? <Text style={styles.count}>{count}</Text> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 4,
  },
  rowLeft: { justifyContent: 'flex-start' },
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

  emoji: {
    fontSize: 14,
  },
  count: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
  },
});
