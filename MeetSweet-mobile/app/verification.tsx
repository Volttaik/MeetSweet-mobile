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
import { ArrowLeft, Lock } from 'phosphor-react-native';
import OTPInput, { OTPInputRef } from '@/components/OTPInput';
import { MsScreenBackground } from '@/components/MsScreenBackground';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

// ─── Constants ────────────────────────────────────────────────────────────────

const RESEND_DURATION = 60;

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function VerificationScreen() {
  const insets = useSafeAreaInsets();
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(RESEND_DURATION);
  const [canResend, setCanResend] = useState(false);
  const [loading, setLoading] = useState(false);

  const otpRef = useRef<OTPInputRef>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Entrance animations
  const contentOpacity = useSharedValue(0);
  const contentY = useSharedValue(20);

  useEffect(() => {
    contentOpacity.value = withDelay(80, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
    contentY.value = withDelay(80, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));
  }, []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));

  const startTimer = () => {
    setCountdown(RESEND_DURATION);
    setCanResend(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const maskedPhone = phone
    ? phone.replace(/\D/g, '').replace(/(\d{3})(\d+)(\d{3})/, '+1 (***) ***-$3')
    : '+1 (***) ***-**78';

  const handleVerify = async () => {
    router.replace('/verify-email');
  };

  const handleOtpComplete = (code: string) => {
    setOtp(code);
    setError('');
  };

  const handleResend = () => {
    if (!canResend) return;
    setOtp('');
    setError('');
    otpRef.current?.clear();
    startTimer();
  };

  const isReady = otp.replace(/\s/g, '').length === 4;

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
        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Center content */}
        <Animated.View style={[styles.body, contentStyle]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Lock size={32} color="#FFFFFF" />
            </View>

            <View style={styles.headerText}>
              <Text style={styles.title}>Verify Your Number</Text>
              <Text style={styles.subtitle}>
                We sent a 4-digit code to{'\n'}
                <Text style={styles.phoneHighlight}>{maskedPhone}</Text>
              </Text>
            </View>
          </View>

          {/* OTP inputs */}
          <View style={styles.otpSection}>
            <OTPInput
              ref={otpRef}
              length={4}
              value={otp}
              onChange={(v) => {
                setOtp(v);
                setError('');
              }}
              onComplete={handleOtpComplete}
              hasError={!!error}
              autoFocus
            />

            {!!error && (
              <Text style={styles.errorText}>{error}</Text>
            )}
          </View>

          {/* Resend */}
          <View style={styles.resendRow}>
            {canResend ? (
              <TouchableOpacity onPress={handleResend} activeOpacity={0.65}>
                <Text style={styles.resendActive}>Resend Code</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.resendTimer}>
                Resend in{' '}
                <Text style={styles.resendCount}>
                  0:{countdown.toString().padStart(2, '0')}
                </Text>
              </Text>
            )}
          </View>
        </Animated.View>

        {/* Verify button */}
        <TouchableOpacity
          style={[
            styles.verifyBtn,
            (!isReady || loading) && styles.verifyBtnDisabled,
          ]}
          onPress={handleVerify}
          disabled={loading || !isReady}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.verifyBtnLabel}>Verify & Continue</Text>
          )}
        </TouchableOpacity>
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

  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },

  header: {
    alignItems: 'center',
    gap: 20,
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
  phoneHighlight: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },

  otpSection: {
    alignItems: 'center',
    gap: 14,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: '#EF4444',
    textAlign: 'center',
  },

  resendRow: {
    alignItems: 'center',
  },
  resendTimer: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.35)',
  },
  resendCount: {
    fontFamily: 'Poppins_600SemiBold',
    color: 'rgba(255,255,255,0.55)',
  },
  resendActive: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF',
    paddingVertical: 6,
  },

  verifyBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 50,
    height: 56,
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
