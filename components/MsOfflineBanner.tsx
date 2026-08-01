/**
 * MsOfflineBanner — subtle animated offline indicator.
 * Mount in the root layout to show across all screens.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { T } from '@/constants/theme';

export function MsOfflineBanner() {
  // Offline detection via fetch probe (no extra native dep needed)
  const [offline, setOffline] = useState(false);
  const slideY = useRef(new Animated.Value(-36)).current;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const check = async () => {
      try {
        const res = await fetch('https://1.1.1.1/dns-query', {
          method: 'HEAD',
          signal: AbortSignal.timeout(3000),
        });
        setOffline(!res.ok && res.status !== 204 ? false : false);
      } catch {
        setOffline(true);
      }
    };
    check();
    interval = setInterval(check, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: offline ? 0 : -36,
      damping: 16,
      stiffness: 240,
      useNativeDriver: true,
    }).start();
  }, [offline]);

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideY }] }]}
      pointerEvents="none"
    >
      <Text style={styles.label}>No internet connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: 'rgba(50,50,50,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  label: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    letterSpacing: 0.2,
  },
});
