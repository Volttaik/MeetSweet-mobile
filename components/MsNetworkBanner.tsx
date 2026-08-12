/**
 * MsNetworkBanner — subtle offline/slow-network indicator.
 * Uses the app's own useNetwork hook (no external netinfo dependency).
 * @deprecated Use MsOfflineBanner instead.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { T } from '@/constants/theme';
import { useNetwork } from '@/hooks/useNetwork';

export function MsNetworkBanner() {
  const { isOnline } = useNetwork();
  const slideAnim = useRef(new Animated.Value(-40)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOnline ? -40 : 0,
      useNativeDriver: true,
      damping: 15,
      stiffness: 200,
    }).start();
  }, [isOnline, slideAnim]);

  if (isOnline) return null;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents="none"
    >
      <Text style={styles.text}>No internet connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9998,
    backgroundColor: '#C0392B',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontFamily: T.FONT.medium,
    fontSize: 12,
  },
});
