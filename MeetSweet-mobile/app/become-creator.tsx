import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, CurrencyNgn, Sparkle, X } from 'phosphor-react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { T } from '@/constants/theme';
import { initiateActivation, verifyActivation } from '@/services/creator';
import { toast } from '@/components/MsToast';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/services/api';

export default function BecomeCreatorScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [error, setError] = useState('');

  const startPayment = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const init = await initiateActivation(user?.email);
      setTransactionId(init.transactionId);
      setPaymentRef(init.reference);
      setPaying(true);
      const supported = await Linking.canOpenURL(init.authorizationUrl);
      if (!supported) throw new Error('Could not open the payment page.');
      await Linking.openURL(init.authorizationUrl);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : null;
      if (apiError?.code === 'EMAIL_REQUIRED' || apiError?.code === 'EMAIL_NOT_VERIFIED') {
        setError(apiError.message);
      } else if (apiError?.status === 409) {
        await refreshUser().catch(() => {});
        router.back();
      } else {
        setError(cause instanceof Error ? cause.message : 'Could not start payment.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const verifyPayment = async () => {
    if (!transactionId || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await verifyActivation(transactionId, paymentRef);
      if (!result.activated || !result.is_creator) throw new Error('Payment verification is not complete yet.');
      await refreshUser();
      toast.success('You are now a creator.');
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.handle} />
      <View style={styles.topBar}>
        <View style={styles.topBarSpacer} />
        <MsPressable onPress={() => router.back()} style={styles.close} accessibilityLabel="Close">
          <X size={18} color={T.TEXT} />
        </MsPressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.iconWrap}>
          <Sparkle size={30} color={T.ACCENT} weight="fill" />
        </View>
        <Text style={styles.title}>Become a Creator</Text>
        <Text style={styles.subtitle}>
          Create subscriber content, offer albums, and earn from your MeetSweet audience.
        </Text>

        <View style={styles.summary}>
          <View style={styles.summaryIcon}>
            <CurrencyNgn size={20} color={T.ACCENT} weight="bold" />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>One-time activation</Text>
            <Text style={styles.summaryText}>A single payment unlocks creator tools and subscriptions.</Text>
          </View>
          <Text style={styles.amount}>₦1,000</Text>
        </View>

        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>Payment account</Text>
          <Text style={styles.accountEmail} numberOfLines={1}>{user?.email || 'Verified email required'}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {paying && transactionId ? (
          <>
            <MsPressable style={[styles.primary, submitting && styles.disabled]} onPress={verifyPayment} disabled={submitting}>
              {submitting ? <ActivityIndicator color={T.BG} /> : <><CheckCircle size={18} color={T.BG} weight="fill" /><Text style={styles.primaryText}>Verify Payment</Text></>}
            </MsPressable>
            <Text style={styles.hint}>Complete the hosted payment, then return here to verify activation.</Text>
          </>
        ) : (
          <MsPressable style={[styles.primary, submitting && styles.disabled]} onPress={startPayment} disabled={submitting}>
            {submitting ? <ActivityIndicator color={T.BG} /> : <><CurrencyNgn size={18} color={T.BG} weight="bold" /><Text style={styles.primaryText}>Continue to Payment</Text></>}
          </MsPressable>
        )}

        <MsPressable style={styles.secondary} onPress={() => router.back()}>
          <Text style={styles.secondaryText}>Maybe Later</Text>
        </MsPressable>
        <Text style={styles.disclaimer}>Payment is processed securely by Paystack.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.BORDER_2, alignSelf: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  topBarSpacer: { flex: 1 },
  close: { width: 36, height: 36, borderRadius: T.RADIUS.md, backgroundColor: T.SURFACE, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 28, alignItems: 'center' },
  iconWrap: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(196,90,114,0.12)', marginBottom: 16 },
  title: { fontSize: 25, fontFamily: T.FONT.bold, color: T.TEXT, textAlign: 'center' },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 21, fontFamily: T.FONT.regular, color: T.TEXT_2, textAlign: 'center', maxWidth: 330 },
  summary: { width: '100%', marginTop: 28, padding: 16, borderRadius: T.RADIUS.lg, backgroundColor: T.SURFACE, borderWidth: 1, borderColor: T.BORDER_2, flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${T.ACCENT}18` },
  summaryCopy: { flex: 1 },
  summaryTitle: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  summaryText: { marginTop: 3, fontSize: 11, lineHeight: 16, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  amount: { fontSize: 17, fontFamily: T.FONT.bold, color: T.ACCENT },
  accountRow: { width: '100%', marginTop: 14, paddingHorizontal: 2, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  accountLabel: { fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT_3 },
  accountEmail: { flex: 1, textAlign: 'right', fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  error: { width: '100%', marginTop: 16, fontSize: 12, lineHeight: 18, fontFamily: T.FONT.medium, color: T.ERROR, textAlign: 'center' },
  primary: { width: '100%', height: 50, marginTop: 26, borderRadius: T.RADIUS.md, backgroundColor: T.TEXT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.BG },
  disabled: { opacity: 0.65 },
  hint: { marginTop: 10, fontSize: 11, lineHeight: 17, fontFamily: T.FONT.regular, color: T.TEXT_2, textAlign: 'center' },
  secondary: { width: '100%', height: 46, marginTop: 10, borderRadius: T.RADIUS.md, borderWidth: 1, borderColor: T.BORDER_2, backgroundColor: T.SURFACE, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  disclaimer: { marginTop: 16, fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3 },
});
