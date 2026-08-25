/**
 * MsToast — global toast notifications.
 *
 * Physics upgrade:
 *   - Spring entry with slight overshoot (underdamped)
 *   - Spring + fade exit
 *   - Haptic on error variant
 *
 * Usage:
 *   1. Render <MsToastHost /> once inside the root layout.
 *   2. Call toast.show('Message') / toast.success() / toast.error() anywhere.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, XCircle, Info } from 'phosphor-react-native';
import { T, alpha } from '@/constants/theme';
import { notifyError, notifySuccess } from '@/lib/haptics';

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
  success(text: string) { this.show(text, 'success'); },
  error(text: string)   { this.show(text, 'error'); },
  info(text: string)    { this.show(text, 'info'); },
};

const VARIANT_CONFIG: Record<ToastVariant, { bg: string; icon: React.ReactNode }> = {
  success: { bg: alpha(T.SUCCESS, 0.14), icon: <CheckCircle size={16} color={T.SUCCESS} weight="fill" /> },
  error:   { bg: alpha(T.ERROR, 0.14),  icon: <XCircle    size={16} color={T.DANGER}  weight="fill" /> },
  info:    { bg: alpha(T.PURPLE, 0.18), icon: <Info       size={16} color={T.PURPLE}  weight="fill" /> },
};

export function MsToastHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-24)).current;
  const scale      = useRef(new Animated.Value(0.88)).current;
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    _listener = (msg) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrent(msg);

      // Haptics on show
      if (msg.variant === 'success') notifySuccess();
      if (msg.variant === 'error')   notifyError();

      // Spring entry — underdamped for a satisfying pop
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 14,   // underdamped — slight overshoot
          stiffness: 260,
          mass: 1,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 260,
          mass: 1,
        }),
      ]).start();

      timerRef.current = setTimeout(() => {
        // Spring out — pull up and fade
        Animated.parallel([
          Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: -20, useNativeDriver: true, damping: 22, stiffness: 300, mass: 1 }),
          Animated.spring(scale,      { toValue: 0.9,  useNativeDriver: true, damping: 22, stiffness: 300, mass: 1 }),
        ]).start(() => {
          setCurrent(null);
          // Reset for next toast
          translateY.setValue(-24);
          scale.setValue(0.88);
        });
      }, 2800);
    };

    return () => {
      _listener = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [opacity, translateY, scale]);

  if (!current) return null;

  const cfg = VARIANT_CONFIG[current.variant];

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          top: insets.top + 14,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
        <View style={styles.iconWrap}>{cfg.icon}</View>
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
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 340,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: T.RADIUS.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  iconWrap: {},
  text: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    flexShrink: 1,
  },
});
