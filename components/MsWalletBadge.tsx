/**
 * MsWalletBadge — compact Naira wallet balance indicator for headers.
 * Tapping opens the wallet screen.
 * Animates with a pop on balance change.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Wallet } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { router } from 'expo-router';
import { useWalletBalance } from '@/hooks/useWalletBalance';

function formatBalance(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toLocaleString('en-NG')}`;
}

export function MsWalletBadge({ onPress }: { onPress?: () => void }) {
  const balance = useWalletBalance();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevBalance = useRef(balance);

  useEffect(() => {
    if (prevBalance.current !== balance) {
      prevBalance.current = balance;
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.18, damping: 8, stiffness: 400, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, damping: 12, stiffness: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [balance]);

  const handlePress = () => {
    if (onPress) onPress();
    else router.push('/wallet' as any);
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75}>
      <Animated.View style={[styles.badge, { transform: [{ scale: scaleAnim }] }]}>
        <Wallet size={11} color={T.SUCCESS ?? '#22C55E'} weight="fill" />
        <Text style={styles.label}>{formatBalance(balance)}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE,
  },
  label: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
});
