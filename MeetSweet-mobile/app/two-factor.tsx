import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { ArrowLeft, ShieldCheck } from 'phosphor-react-native';
import OTPInput, { OTPInputRef } from '@/components/OTPInput';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/services/api';
import { shouldShowOnboarding } from '@/services/onboarding';
import { consumePendingShareDestination, routeToShareDestination } from '@/lib/deep-link';
import { MsScreenBackground } from '@/components/MsScreenBackground';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export default function TwoFactorScreen() {
  const insets = useSafeAreaInsets();
  const { completeTwoFactorLogin } = useAuth();
  const { challengeToken } = useLocalSearchParams<{ challengeToken?: string }>();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const otpRef = useRef<OTPInputRef>(null);

  const contentOpacity = useSharedValue(0);
  const contentY = useSharedValue(24);

  useEffect(() => {
    contentOpacity.value = withDelay(80, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    contentY.value = withDelay(80, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));

  const handleVerify = async () => {
    if (!challengeToken) {
      setError('Verification session missing. Please log in again.');
      return;
    }
    if (!completed) {
      setError('Enter the 6-digit code');
      otpRef.current?.shake();
      return;
    }
    setError('');
    setLoading(true);
    try {
      await completeTwoFactorLogin(challengeToken, otp);
      // A share-link recipient who signed in mid-flow returns to the shared
      // content — the destination is never replaced by onboarding.
      const pendingDestination = consumePendingShareDestination();
      if (pendingDestination) {
        routeToShareDestination(pendingDestination, 'replace');
        return;
      }
      const isNewUser = await shouldShowOnboarding('creator_onboarded');
      router.replace(isNewUser ? '/new-user-welcome' : '/(tabs)');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        // Challenge expired or code wrong — send them back to login.
        setError('Verification session expired. Please log in again.');
        setTimeout(() => router.replace('/auth'), 900);
      } else {
        setError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
        otpRef.current?.shake();
        setOtp('');
        setCompleted(false);
        otpRef.current?.clear();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <MsScreenBackground>
      <KeyboardAwareScrollViewCompat
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + (Platform.OS === 'web' ? 72 : 28),
            paddingBottom: insets.bottom + 48,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <Animated.View style={[styles.inner, contentStyle]}>
          <View style={styles.iconCircle}>
            <ShieldCheck size={32} color="#FFFFFF" />
          </View>

          <View style={styles.headerText}>
            <Text style={styles.title}>Two-Factor Authentication</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to your email. Enter it below to finish signing in.
            </Text>
          </View>

          <OTPInput
            ref={otpRef}
            length={6}
            value={otp}
            onChange={(v) => {
              setOtp(v);
              setError('');
              setCompleted(false);
            }}
            onComplete={(code) => {
              setCompleted(true);
              setOtp(code);
              setError('');
            }}
            hasError={!!error}
            autoFocus
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[
              styles.verifyBtn,
              (!completed || loading) && styles.verifyBtnDisabled,
            ]}
            onPress={handleVerify}
            disabled={loading || !completed}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.verifyBtnLabel}>Verify</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
    </MsScreenBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 28,
    gap: 22,
    flexGrow: 1,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    gap: 28,
    justifyContent: 'center',
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 24,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: '#EF4444',
    textAlign: 'center',
  },
  verifyBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 50,
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  verifyBtnLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
