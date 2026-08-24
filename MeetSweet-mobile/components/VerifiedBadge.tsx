/**
 * VerifiedBadge — the application-wide creator verification indicator.
 *
 * Single source of truth: every surface that shows creator verification
 * (album cards, album detail, creator rows) renders this same component, so
 * the shape, size, fill and check glyph are identical everywhere.
 *
 * Rose accent fill with a white check — matches the app's accent language.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'phosphor-react-native';
import { T } from '@/constants/theme';

export function VerifiedBadge() {
  return (
    <View style={styles.badge}>
      <Check size={9} color="#fff" weight="bold" />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
