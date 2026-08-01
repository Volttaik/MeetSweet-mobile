/**
 * MsNetworkBanner — subtle offline/slow-network indicator.
 * Shows at the top of the screen when network is unavailable.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { T } from '@/constants/theme';
import { WifiNone } from 'phosphor-react-native';

export function MsNetworkBanner() {
  const [offline, setOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-40)).current;

  useEffect(() => {
    // Try to use NetInfo if available, otherwise skip
    try {
      const unsub = NetInfo.addEventListener((state) => {
        const isOffline = state.isConnected === false;
        setOffline(isOffline);
      });
      return unsub;
    } catch {
      return () => {};
    }
  }, []);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: offline ? 0 : -40,
      damping: 16,
      stiffness: 260,
      useNativeDriver: true,
    }).start();
  }, [offline]);

  if (!offline) return null;

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <WifiNone size={13} color="#fff" weight="bold" />
      <Text style={styles.label}>No internet connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#333',
    paddingVertical: 6,
    paddingHorizontal: 12,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  label: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: '#fff',
  },
});
