import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { T } from '@/constants/theme';

interface MsSectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function MsSectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: MsSectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && (
        <MsPressable onPress={onAction} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.action}>{actionLabel}</Text>
        </MsPressable>
      )}
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
