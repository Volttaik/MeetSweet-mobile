/**
 * MsRoomCreationLoader — full-screen loading state for first-time Chat Room
 * creation.
 *
 * Design: clean and minimal.
 *   • White circular background centered on screen.
 *   • MeetSweet black logo inside the circle.
 *   • Black spinner ring rotating around the logo.
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
            tintColor="#000000"
            accessibilityLabel="MeetSweet"
          />
        </View>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const DISC = 132;
const RING = DISC + 10;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.96)',
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    // Soft shadow so the white disc reads against the white backdrop.
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    // Thick black arc: full border, mostly transparent, with a solid segment
    // produced via a conic-like gradient approximation. We use a border with a
    // large transparent gap and a solid quarter to create the orbiting mark.
    borderWidth: 4,
    borderColor: '#000000',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  logo: {
    width: 56,
    height: 56,
  },
  label: {
    marginTop: 22,
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: '#000000',
    letterSpacing: 0.2,
  },
});
