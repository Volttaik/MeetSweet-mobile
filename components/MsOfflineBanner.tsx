/**
 * MsOfflineBanner — slim persistent banner shown when the device is offline.
 * Slides in from the top and auto-hides when connectivity is restored.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { WifiSlash } from 'phosphor-react-native';
import { useNetwork } from '@/hooks/useNetwork';
import { T } from '@/constants/theme';

export function MsOfflineBanner() {
  const { isOnline } = useNetwork();
  const translateY = useRef(new Animated.Value(-56)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isOnline) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 260,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -56,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOnline]);

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY }], opacity }]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        <WifiSlash size={14} color="#fff" weight="bold" />
        <Text style={styles.text}>You're offline — showing cached content</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#C0392B',
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    color: '#fff',
    fontFamily: T.FONT.medium,
    fontSize: 12,
    letterSpacing: 0.1,
  },
});
