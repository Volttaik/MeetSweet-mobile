import React, { type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { T } from '@/constants/theme';

interface MsSectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Custom element rendered on the right side — takes precedence over the
   *  text `actionLabel` slot (e.g. a gradient Shorts button). */
  actionElement?: ReactNode;
  style?: ViewStyle;
}

export function MsSectionHeader({
  title,
  actionLabel,
  onAction,
  actionElement,
  style,
}: MsSectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title}>{title}</Text>
      {actionElement ? (
        actionElement
      ) : actionLabel ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
  },
  action: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
});
