/**
 * MsCreditBadge — compact credit balance indicator for headers.
 * Tapping opens wallet/credit management.
 * Animates with a pop on balance change.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { Lightning } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { router } from 'expo-router';

interface MsCreditBadgeProps {
  balance: number;
  onPress?: () => void;
}

export function MsCreditBadge({ balance, onPress }: MsCreditBadgeProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevBalance = useRef(balance);

  useEffect(() => {
    if (prevBalance.current !== balance) {
      prevBalance.current = balance;
      // Pop animation on change
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

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75}>
      <Animated.View style={[styles.badge, { transform: [{ scale: scaleAnim }] }]}>
        <Lightning size={11} color={T.ACCENT} weight="fill" />
        <Text style={styles.label}>
          {balance >= 1000 ? `${(balance / 1000).toFixed(1)}K` : String(balance)}
        </Text>
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
