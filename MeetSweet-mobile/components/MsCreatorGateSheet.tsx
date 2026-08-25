/**
 * MsCreatorGateSheet — styled bottom modal shown when a non-creator tries to
 * use a creator-only feature.
 *
 * The SERVER is the authority on creator status: the "Become a Creator" action
 * POSTs /creator/become, waits for confirmation, then refreshes the auth user
 * from the server so every creator-gated button disappears immediately — no
 * logout/login or manual refresh needed.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkle } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { GradientTopFade } from '@/components/GradientTopFade';
import { becomeCreator } from '@/services/creator';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/MsToast';
import { tapLight } from '@/lib/haptics';

interface MsCreatorGateSheetProps {
  visible: boolean;
  /** Optional contextual copy, e.g. "Albums are a creator feature." */
  message?: string;
  onClose: () => void;
  /** Runs after the server confirms the account is now a creator. */
  onSuccess?: () => void;
}

export function MsCreatorGateSheet({
  visible,
  message,
  onClose,
  onSuccess,
}: MsCreatorGateSheetProps) {
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleBecomeCreator = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await becomeCreator();
      await refreshUser();
      setSubmitting(false);
      toast.success('You are now a creator!');
      onClose();
      onSuccess?.();
    } catch (e) {
      setSubmitting(false);
      setError((e as Error).message ?? 'Could not activate your creator account. Please try again.');
    }
  }, [submitting, refreshUser, onClose, onSuccess]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <GradientTopFade height={56} radius={24} />
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <BrandGradientFill />
            <Sparkle size={26} color="#FFFFFF" weight="fill" />
          </View>
          <Text style={styles.title}>Creator access required</Text>
          <Text style={styles.message}>
            {message ?? 'This feature is available to creators.'}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleBecomeCreator}
            disabled={submitting}
          >
            <BrandGradientFill />
            {submitting ? (
              <ActivityIndicator size="small" color={T.ACCENT_FG} />
            ) : (
              <Text style={styles.primaryLabel}>Become a Creator</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => { tapLight(); onClose(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryLabel}>Not now</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 8,
  },
  error: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.ERROR,
    textAlign: 'center',
    marginBottom: 6,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryLabel: {
    color: T.ACCENT_FG,
    fontFamily: T.FONT.bold,
    fontSize: 15,
  },
  secondaryBtn: {
    alignSelf: 'stretch',
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 14,
  },
});
