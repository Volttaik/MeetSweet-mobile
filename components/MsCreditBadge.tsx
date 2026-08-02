/**
 * MsWalletBadge (exported as MsCreditBadge for compatibility) —
 * compact Naira wallet balance indicator for headers.
 * Tapping opens the wallet page.
 * Animates with a pop on balance change.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { Wallet } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { router } from 'expo-router';

interface MsCreditBadgeProps {
  balance?: number;
  onPress?: () => void;
}

export function MsCreditBadge({ balance, onPress }: MsCreditBadgeProps) {
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
    if (onPress) {
      onPress();
    } else {
      router.push('/wallet' as any);
    }
  };

  const displayBalance = balance != null
    ? (balance >= 1000
        ? `₦${(balance / 1000).toFixed(0)}K`
        : `₦${balance.toLocaleString('en-NG')}`)
    : null;

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75}>
      <Animated.View style={[styles.badge, { transform: [{ scale: scaleAnim }] }]}>
        <Wallet size={12} color={T.SUCCESS} weight="fill" />
        {displayBalance != null && (
          <Text style={styles.label}>{displayBalance}</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}
