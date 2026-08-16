/**
 * MsFeedbackModal — styled center modal for IMPORTANT success/error/info
 * outcomes (album unlocked, purchase completed, subscription actions, price
 * updated, …). Replaces the default system Alert/toast for these flows so the
 * feedback stays inside the app's visual language.
 *
 * Usage: render with `visible`, `variant`, `title`, `message` and a confirm
 * action. Tap-outside / confirm both dismiss via onClose.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CheckCircle, XCircle, Info, Lock } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { notifyError, notifySuccess } from '@/lib/haptics';

export type FeedbackVariant = 'success' | 'error' | 'info';

interface MsFeedbackModalProps {
  visible: boolean;
  variant?: FeedbackVariant;
  title: string;
  message?: string;
  confirmLabel?: string;
  onClose: () => void;
  /** Optional secondary action rendered under the primary button. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const VARIANT_CONFIG: Record<FeedbackVariant, { icon: React.ReactNode; color: string; bg: string }> = {
  success: { icon: <CheckCircle size={30} color={T.SUCCESS} weight="fill" />, color: T.SUCCESS, bg: 'rgba(52,201,123,0.12)' },
  error:   { icon: <XCircle size={30} color={T.DANGER} weight="fill" />, color: T.DANGER, bg: 'rgba(239,68,68,0.12)' },
  info:    { icon: <Info size={30} color={T.PURPLE} weight="fill" />, color: T.PURPLE, bg: 'rgba(155,110,202,0.14)' },
};

export function MsFeedbackModal({
  visible,
  variant = 'info',
  title,
  message,
  confirmLabel = 'Done',
  onClose,
  secondaryLabel,
  onSecondary,
}: MsFeedbackModalProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    scale.setValue(0.88);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 15,
        stiffness: 250,
        mass: 1,
      }),
    ]).start();
    if (variant === 'success') notifySuccess();
    if (variant === 'error') notifyError();
  }, [visible, variant, opacity, scale]);

  if (!visible) return null;

  const cfg = VARIANT_CONFIG[variant];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>{cfg.icon}</View>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryLabel}>{confirmLabel}</Text>
          </TouchableOpacity>

          {secondaryLabel && onSecondary ? (
            <TouchableOpacity style={styles.secondaryBtn} onPress={onSecondary} activeOpacity={0.7}>
              <Text style={styles.secondaryLabel}>{secondaryLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,5,8,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: T.SURFACE,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 6,
    shadowColor: T.SHADOW,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 18,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 18,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  message: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 2,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryLabel: {
    color: T.BG,
    fontFamily: T.FONT.bold,
    fontSize: 14,
  },
  secondaryBtn: {
    alignSelf: 'stretch',
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 13,
  },
});
