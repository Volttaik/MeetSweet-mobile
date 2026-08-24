/**
 * MsRoomCreationLoader — full-screen loading state for MeetSweet creation
 * flows (first-time Chat Room creation, post/album publishing).
 *
 * Design: dark MeetSweet surface language (matches the app, not a white flash).
 *   • Ash/black overlay covering the screen.
 *   • Elevated dark disc centered on screen.
 *   • Rose accent ring rotating around the disc.
 *   • MeetSweet logo inside the disc.
 *   • Status text underneath: "Creating chatroom" / "Uploading…" / …
 *
 * The component is intentionally reusable: pass `status`/`label` for the
 * in-progress copy, or `error`/`success` to render terminal states with
 * retry/done actions. The rotating ring stops once a terminal state is shown.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle, WarningCircle, ArrowCounterClockwise } from 'phosphor-react-native';
import { T } from '@/constants/theme';

const LOGO = require('../../assets/images/logo.png');

interface Props {
  /** When true, the loader is rendered full-screen on top of everything. */
  visible: boolean;
  /** Optional override for the caption (defaults to "Creating chatroom"). */
  label?: string;
  /** Secondary line under the label (defaults to the chatroom hint). */
  hint?: string;
  /** In-progress status line — replaces the hint while a flow is running. */
  status?: string | null;
  /** Error message — renders the terminal error state (with retry/cancel). */
  error?: string | null;
  /** Success state — renders a checkmark in place of the spinner. */
  success?: boolean;
  successTitle?: string;
  successSubtitle?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  onDone?: () => void;
}

export function MsRoomCreationLoader({
  visible,
  label = 'Creating chatroom',
  hint = 'Setting up your conversation…',
  status = null,
  error = null,
  success = false,
  successTitle = 'Done!',
  successSubtitle,
  onRetry,
  onCancel,
  onDone,
}: Props) {
  const spin = useRef(new Animated.Value(0)).current;

  const animate = visible && !success && !error;

  useEffect(() => {
    if (!animate) return;
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
  }, [animate, spin]);

  if (!visible) return null;

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const interactive = Boolean(error || success);

  return (
    <View
      style={styles.overlay}
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      <View style={styles.card}>
        <View style={styles.disc}>
          {/* Rotating ring — a bordered circle with a transparent gap so it
              reads as a spinner orbiting the logo. */}
          {animate && (
            <Animated.View
              style={[
                styles.ring,
                { transform: [{ rotate }] },
              ]}
            />
          )}

          {success ? (
            <CheckCircle size={58} color={T.SUCCESS} weight="fill" />
          ) : error ? (
            <WarningCircle size={58} color={T.ERROR} weight="fill" />
          ) : (
            <Image
              source={LOGO}
              style={styles.logo}
              resizeMode="contain"
              tintColor="#FFFFFF"
              accessibilityLabel="MeetSweet"
            />
          )}
        </View>

        {success ? (
          <>
            <Text style={styles.label}>{successTitle}</Text>
            {successSubtitle ? <Text style={styles.hint}>{successSubtitle}</Text> : null}
          </>
        ) : error ? (
          <>
            <Text style={styles.label}>Something went wrong</Text>
            <Text style={styles.errorText}>{error}</Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.hint}>{status ?? hint}</Text>
          </>
        )}

        {(error || success) && (
          <View style={styles.actions}>
            {error ? (
              <>
                {onRetry ? (
                  <Pressable style={styles.actionBtn} onPress={onRetry} android_ripple={{ color: 'rgba(255,255,255,0.08)' }}>
                    <ArrowCounterClockwise size={16} color="#fff" weight="bold" />
                    <Text style={styles.actionLabel}>Try again</Text>
                  </Pressable>
                ) : null}
                {onCancel ? (
                  <Pressable style={[styles.actionBtn, styles.actionBtnGhost]} onPress={onCancel} android_ripple={{ color: 'rgba(255,255,255,0.08)' }}>
                    <Text style={[styles.actionLabel, { color: T.TEXT_2 }]}>Back to edit</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              onDone ? (
                <Pressable style={styles.actionBtn} onPress={onDone} android_ripple={{ color: 'rgba(255,255,255,0.08)' }}>
                  <Text style={styles.actionLabel}>Done</Text>
                </Pressable>
              ) : null
            )}
          </View>
        )}
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
  errorText: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.ERROR,
    maxWidth: 280,
    textAlign: 'center',
    lineHeight: 18,
  },
  actions: {
    marginTop: 28,
    gap: 10,
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 28,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
  },
  actionBtnGhost: {
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  actionLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },
});
