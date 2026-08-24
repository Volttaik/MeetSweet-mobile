import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChatCircle,
  CurrencyDollar,
  Lock,
  Sparkle,
  X,
} from 'phosphor-react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import * as Linking from 'expo-linking';
import { T } from '@/constants/theme';
import { becomeCreator, initiateActivation, verifyActivation } from '@/services/creator';
import { toast } from '@/components/MsToast';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/services/api';

const FEATURES: { Icon: React.ComponentType<{ size: number; color: string }>; title: string; desc: string }[] = [
  { Icon: Lock,            title: 'Exclusive Content', desc: 'Subscriber-only posts and videos' },
  { Icon: CurrencyDollar,  title: 'Subscriptions',     desc: 'Earn monthly recurring revenue' },
  { Icon: ChatCircle,      title: 'Private Messaging', desc: 'Chat directly with your community' },
];

function FeatureCard({ Icon, title, desc }: { Icon: React.ComponentType<{ size: number; color: string }>; title: string; desc: string }) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIconWrap}>
        <Icon size={20} color={T.TEXT} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDesc}>{desc}</Text>
    </View>
  );
}

export default function BecomeCreatorScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const [paying, setPaying] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  const handleBecomeCreator = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      // Step 1: Initiate the ₦1,000 activation payment. Forward the signed-in
      // user's email so the Paystack checkout is created against a real email
      // (the backend rejects the request without one).
      const init = await initiateActivation(user?.email);
      setTransactionId(init.transactionId);
      setPaymentRef(init.reference);
      setPaying(true);
      setSubmitting(false);

      // Step 2: Open Paystack checkout
      const supported = await Linking.canOpenURL(init.authorizationUrl);
      if (supported) {
        await Linking.openURL(init.authorizationUrl);
      } else {
        setError('Could not open payment page. Please try again.');
        setPaying(false);
      }
    } catch (e) {
      setSubmitting(false);
      // Already a creator (409) — the user is ahead of us; refresh and leave.
      if (e instanceof ApiError && e.status === 409) {
        try { await refreshUser(); } catch { /* keep screen state */ }
        goBack();
        return;
      }
      // 402 = activation payment required — show the activation flow
      if (e instanceof ApiError && e.status === 402) {
        setError('A one-time creator activation fee of ₦1,000 is required.');
        return;
      }
      setError((e as Error).message ?? 'Could not activate your creator account. Please try again.');
    }
  };

  // Step 3: Verify the payment (called by user after they return from Paystack)
  const handleVerifyPayment = async () => {
    if (!transactionId || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await verifyActivation(transactionId, paymentRef);
      if (result.activated && result.is_creator) {
        await refreshUser();
        toast.success('You are now a creator!');
        goBack();
        return;
      }
      setError('Payment verification failed. Please try again or contact support.');
    } catch (e) {
      setError((e as Error).message ?? 'Payment verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.bg, { paddingTop: insets.top + 8 }]}>
      {/* Drag handle */}
      <View style={styles.handle} />

      {/* Close button */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => goBack()}
          style={styles.closeBtn}
          activeOpacity={0.7}
        >
          <X size={18} color={T.TEXT} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Sparkle size={40} color={T.ACCENT} weight="fill" />
          </View>
          <Text style={styles.heroTitle}>Become a Creator</Text>
          <Text style={styles.heroSubtitle}>
            Unlock subscriber tools — exclusive posts, private messaging, and
            more — for your community.
          </Text>
        </View>

        {/* Activation payment info */}
        <View style={styles.activationCard}>
          <Text style={styles.activationTitle}>Become a MeetSweet creator and unlock subscriber content tools.</Text>
          <View style={styles.activationPriceRow}>
            <Text style={styles.activationPrice}>One-time activation fee</Text>
            <Text style={styles.activationPriceAmount}>₦1,000</Text>
          </View>
          <Text style={styles.activationNote}>
            Pay once. Create forever. You will not be charged again for creating posts, albums, or setting subscriber content.
          </Text>
        </View>

        {/* Features */}
        <Text style={styles.featuresHeading}>What you get</Text>
        <View style={styles.featureGrid}>
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </View>

        {/* CTAs */}
        <View style={styles.ctaSection}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {paying && transactionId ? (
            <>
              <TouchableOpacity
                style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
                activeOpacity={0.85}
                onPress={handleVerifyPayment}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={T.BG} />
                ) : (
                  <Text style={styles.primaryBtnLabel}>Verify Payment & Activate</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.paymentHint}>
                After completing the Paystack payment, tap above to verify and activate your creator account.
              </Text>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
              activeOpacity={0.85}
              onPress={handleBecomeCreator}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={T.BG} />
              ) : (
                <Text style={styles.primaryBtnLabel}>Pay ₦1,000 & Become a Creator</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnLabel}>Maybe Later</Text>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            One-time fee · Earn 80% of every subscription
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: T.BG },

  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center',
    marginBottom: 6,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollContent: { paddingTop: 8 },

  hero: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 28,
    gap: 12,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,90,114,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,90,114,0.22)',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  heroSubtitle: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 23,
  },

  featuresHeading: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 16,
  },

  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 8,
  },
  featureCard: {
    width: '47%',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    padding: 16,
    gap: 6,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  featureTitle: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    lineHeight: 18,
  },
  featureDesc: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 16,
  },

  ctaSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 12,
    alignItems: 'center',
  },
  primaryBtn: {
    width: '100%',
    height: 50,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
  secondaryBtn: {
    width: '100%',
    height: 46,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnLabel: {
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  disclaimer: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  errorText: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: '#E5484D',
    textAlign: 'center',
    marginBottom: 4,
  },
  // Activation card
  activationCard: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    padding: 20,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.ACCENT,
    gap: 12,
    alignItems: 'center',
  },
  activationTitle: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    textAlign: 'center',
    lineHeight: 21,
  },
  activationPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
  },
  activationPrice: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  activationPriceAmount: {
    fontSize: 22,
    fontFamily: T.FONT.bold,
    color: T.ACCENT,
  },
  activationNote: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    lineHeight: 18,
  },
  paymentHint: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
});
