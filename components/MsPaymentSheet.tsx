import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LockSimple, Sparkle } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsCreditsIcon } from '@/components/MsCreditsIcon';
import { MsModal } from '@/components/MsModal';

export type MsPaymentKind = 'unlock' | 'subscribe' | 'tip' | 'purchase';

export interface MsPaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  kind?: MsPaymentKind;
  title?: string;
  description?: string;
  amount: number;
  balance?: number;
  loading?: boolean;
}

const copy: Record<MsPaymentKind, { title: string; action: string }> = {
  unlock: { title: 'Unlock this drop', action: 'Unlock content' },
  subscribe: { title: 'Subscribe to creator', action: 'Subscribe' },
  tip: { title: 'Send a tip', action: 'Send tip' },
  purchase: { title: 'Complete purchase', action: 'Purchase' },
};

export function MsPaymentSheet({
  visible,
  onClose,
  onConfirm,
  kind = 'unlock',
  title,
  description,
  amount,
  balance,
  loading = false,
}: MsPaymentSheetProps) {
  const labels = copy[kind];
  const insufficient = balance !== undefined && balance < amount;

  return (
    <MsModal
      visible={visible}
      onClose={loading ? () => {} : onClose}
      title={title ?? labels.title}
      subtitle={description ?? 'Use MeetSweet Credits to keep the moment going.'}
      footer={
        <TouchableOpacity
          style={[styles.confirm, (insufficient || loading) && styles.disabled]}
          disabled={insufficient || loading}
          onPress={onConfirm}
          activeOpacity={0.82}
        >
          {loading ? (
            <ActivityIndicator color={T.BG} />
          ) : (
            <Text style={styles.confirmText}>
              {insufficient ? 'Not enough credits' : labels.action}
            </Text>
          )}
        </TouchableOpacity>
      }
    >
      <View style={styles.amountCard}>
        <MsCreditsIcon size={46} />
        <View style={styles.amountCopy}>
          <Text style={styles.amount}>{amount.toLocaleString()}</Text>
          <Text style={styles.unit}>MeetSweet Credits</Text>
        </View>
        <Sparkle size={20} color={T.ACCENT} weight="fill" />
      </View>
      {balance !== undefined && (
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Your balance</Text>
          <Text style={styles.balanceValue}>{balance.toLocaleString()} credits</Text>
        </View>
      )}
      <View style={styles.secureRow}>
        <View style={styles.secureIcon}><LockSimple size={14} color={T.ACCENT} /></View>
        <Text style={styles.secureText}>Secure, one-time confirmation</Text>
      </View>
    </MsModal>
  );
}

const styles = StyleSheet.create({
  amountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE_2,
  },
  amountCopy: { flex: 1 },
  amount: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 24, letterSpacing: -0.6 },
  unit: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, marginTop: 2 },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  balanceLabel: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12 },
  balanceValue: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 12 },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secureIcon: {
    width: 26,
    height: 26,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureText: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12 },
  confirm: {
    height: 50,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  confirmText: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 14 },
});