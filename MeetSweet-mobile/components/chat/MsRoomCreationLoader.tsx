/**
 * MsRoomCreationLoader — full-screen loading state for first-time Chat Room
 * creation.
 *
 * Design: dark MeetSweet surface language (matches the app, not a white flash).
 *   • Ash/black overlay covering the screen.
 *   • Elevated dark disc centered on screen.
 *   • Rose accent ring rotating around the disc.
 *   • MeetSweet logo inside the disc.
 *   • Caption underneath: "Creating chatroom".
 *
 * Shown while the frontend verifies messaging eligibility and asks the backend
 * to create/resolve a Chat Room. The frontend never generates the chatRoomId.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { T } from '@/constants/theme';

const LOGO = require('../../assets/images/logo.png');

interface Props {
  /** When true, the loader is rendered full-screen on top of everything. */
  visible: boolean;
  /** Optional override for the caption (defaults to "Creating chatroom"). */
  label?: string;
}

export function MsRoomCreationLoader({ visible, label = 'Creating chatroom' }: Props) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, spin]);

  if (!visible) return null;

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.card}>
        <View style={styles.disc}>
          {/* Rotating ring — a bordered circle with a transparent gap so it
              reads as a spinner orbiting the logo. */}
          <Animated.View
            style={[
              styles.ring,
              { transform: [{ rotate }] },
            ]}
          />
          <Image
            source={LOGO}
            style={styles.logo}
            resizeMode="contain"
            tintColor="#FFFFFF"
            accessibilityLabel="MeetSweet"
          />
        </View>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>Setting up your conversation…</Text>
      </View>
    </View>
  );
}

const DISC = 132;
const RING = DISC + 10;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,12,15,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.BORDER_2,
    // Soft shadow so the disc reads against the dark backdrop.
    shadowColor: '#000000',
    shadowOpacity: 0.55,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: T.ACCENT,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    opacity: 0.9,
  },
  logo: {
    width: 56,
    height: 56,
  },
  label: {
    marginTop: 24,
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    letterSpacing: 0.2,
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
});
