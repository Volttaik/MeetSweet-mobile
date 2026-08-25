/**
 * MsOfflineBanner — slim persistent banner for degraded connectivity.
 *
 * Renders the app's connectivity state from useNetwork:
 *   slow         → subtle coral warning (still online, just slow)
 *   reconnecting → blue "Reconnecting…" transition
 *   offline      → red "You're offline" (only after a sustained ~1 min outage)
 *
 * Slides in from the top and auto-hides when connectivity is restored.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { ArrowsClockwise, WifiSlash, Warning } from 'phosphor-react-native';
import { useNetwork, type NetworkStatus } from '@/hooks/useNetwork';
import { T } from '@/constants/theme';

type BannerKind = Exclude<NetworkStatus, 'online'>;

const CONFIG: Record<BannerKind, { text: string; bg: string }> = {
  slow: {
    text: 'Slow internet — find a better connection',
    bg: T.WARNING,
  },
  reconnecting: {
    text: 'Reconnecting…',
    bg: T.INFO,
  },
  offline: {
    text: "You're offline — check your connection",
    bg: T.ERROR,
  },
};

function BannerIcon({ kind }: { kind: BannerKind }) {
  // Banner fills are coral/grey/red; dark icons read on all of them.
  if (kind === 'offline') return <WifiSlash size={14} color={T.ON_AMBER} weight="bold" />;
  if (kind === 'reconnecting') return <ArrowsClockwise size={14} color={T.ON_AMBER} weight="bold" />;
  return <Warning size={14} color={T.ON_AMBER} weight="fill" />;
}

export function MsOfflineBanner() {
  const { status } = useNetwork();
  const kind: BannerKind | null = status === 'online' ? null : status;

  const translateY = useRef(new Animated.Value(-56)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (kind) {
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
  }, [kind, translateY, opacity]);

  const config = kind ? CONFIG[kind] : null;

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: config?.bg ?? CONFIG.offline.bg, transform: [{ translateY }], opacity },
      ]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        {kind ? <BannerIcon kind={kind} /> : null}
        <Text style={styles.text}>{config?.text ?? ''}</Text>
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
    color: T.ON_AMBER,
    fontFamily: T.FONT.medium,
    fontSize: 12,
    letterSpacing: 0.1,
  },
});
