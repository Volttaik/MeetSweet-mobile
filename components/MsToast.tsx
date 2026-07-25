/**
 * MsToast — global toast notifications.
 *
 * Usage:
 *   1. Render <MsToastHost /> once, inside the root layout (after SafeAreaProvider).
 *   2. Call toast.show('Message') anywhere in the app.
 *
 * Variants: 'success' | 'error' | 'info' (default: 'info')
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/constants/theme';

// ─── Global imperative API ────────────────────────────────────────────────────

type ToastVariant = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
}

type Listener = (msg: ToastMessage) => void;

let _listener: Listener | null = null;
let _counter = 0;

export const toast = {
  show(text: string, variant: ToastVariant = 'info') {
    _listener?.({ id: ++_counter, text, variant });
  },
  success(text: string) {
    this.show(text, 'success');
  },
  error(text: string) {
    this.show(text, 'error');
  },
  info(text: string) {
    this.show(text, 'info');
  },
};

// ─── Host component ───────────────────────────────────────────────────────────

export function MsToastHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    _listener = (msg) => {
      // Clear any pending hide timer
      if (timerRef.current) clearTimeout(timerRef.current);

      setCurrent(msg);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();

      timerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
        ]).start(() => setCurrent(null));
      }, 2600);
    };

    return () => {
      _listener = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [opacity, translateY]);

  if (!current) return null;

  const bgColor =
    current.variant === 'success'
      ? T.SUCCESS
      : current.variant === 'error'
      ? T.ERROR
      : T.TEXT;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { top: insets.top + 12, opacity, transform: [{ translateY }], pointerEvents: 'none' },
      ]}
    >
      <View style={[styles.pill, { backgroundColor: bgColor }]}>
        <Text style={styles.text} numberOfLines={2}>
          {current.text}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'none' as any,
  },
  pill: {
    maxWidth: 320,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: T.RADIUS.full,
    elevation: 10,
  },
  text: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: '#000000',
    textAlign: 'center',
  },
});
