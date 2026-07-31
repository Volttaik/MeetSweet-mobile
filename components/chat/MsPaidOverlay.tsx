/**
 * MsPaidOverlay — locked/paid content blur overlay.
 * Shows blur effect + lock icon + price + unlock CTA.
 * Wraps over any media content (image, video, voice, file).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LockSimple } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from '@/constants/theme';

interface Props {
  price: number;
  isUnlocking?: boolean;
  onUnlock: () => void;
}

export function MsPaidOverlay({ price, isUnlocking, onUnlock }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.82)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <View style={styles.lockRing}>
          <LockSimple size={22} color="#fff" weight="fill" />
        </View>
        <Text style={styles.label}>Paid Content</Text>
        <Text style={styles.price}>{price} Credits</Text>
        <Pressable
          onPress={onUnlock}
          style={({ pressed }) => [styles.unlockBtn, pressed && styles.unlockBtnPressed]}
          disabled={isUnlocking}
        >
          <Text style={styles.unlockText}>
            {isUnlocking ? 'Unlocking…' : 'Unlock'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    overflow: 'hidden',
  },
  content: {
    alignItems: 'center',
    gap: 6,
  },
  lockRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(196,90,114,0.3)',
    borderWidth: 1.5,
    borderColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  price: {
    fontSize: 16,
    fontFamily: T.FONT.bold,
    color: '#fff',
  },
  unlockBtn: {
    marginTop: 6,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 50,
    backgroundColor: T.ACCENT,
  },
  unlockBtnPressed: {
    backgroundColor: T.ACCENT_DARK,
  },
  unlockText: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },
});
