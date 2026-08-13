/**
 * MsDateSeparator — date label between message groups.
 * Floats centered with a pill badge style.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { T } from '@/constants/theme';

interface Props {
  label: string;
}

export function MsDateSeparator({ label }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginVertical: 12,
  },
  badge: {
    backgroundColor: 'rgba(20,17,40,0.88)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
  },
  text: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
    letterSpacing: 0.2,
  },
});
