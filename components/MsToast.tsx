/**
 * MsToast — global toast notifications.
 *
 * Usage:
 *   1. Render <MsToastHost /> once inside the root layout.
 *   2. Call toast.show('Message') / toast.success() / toast.error() anywhere.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, XCircle, Info } from 'phosphor-react-native';
import { T } from '@/constants/theme';

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
  success: { bg: 'rgba(52,201,123,0.14)', icon: <CheckCircle size={16} color={T.SUCCESS} weight="fill" /> },
  error:   { bg: 'rgba(239,68,68,0.14)',  icon: <XCircle    size={16} color={T.DANGER}  weight="fill" /> },
  info:    { bg: 'rgba(155,110,202,0.18)', icon: <Info       size={16} color={T.PURPLE}  weight="fill" /> },
};

const ICON_COLOR: Record<ToastVariant, string> = {
  success: T.SUCCESS,
  error:   T.DANGER,
  info:    T.TEXT_2,
};

export function MsToastHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;
  const scale      = useRef(new Animated.Value(0.9)).current;
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    _listener = (msg) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrent(msg);
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.spring(scale,      { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
      ]).start();

      timerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -16, duration: 200, useNativeDriver: true }),
          Animated.timing(scale,      { toValue: 0.9, duration: 200, useNativeDriver: true }),
        ]).start(() => setCurrent(null));
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
        { top: insets.top + 14, opacity, transform: [{ translateY }, { scale }] },
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
    borderWidth: 1,
    borderColor: T.BORDER_2,
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
