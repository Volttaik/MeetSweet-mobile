import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ArrowLeft, Eye, EyeSlash, Lock, Envelope } from 'phosphor-react-native';
import OTPInput, { OTPInputRef } from '@/components/OTPInput';
import { apiFetch } from '@/services/api';
import { MsScreenBackground } from '@/components/MsScreenBackground';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type Step = 'email' | 'code' | 'new_password' | 'done';

const RESEND_DURATION = 60;
const INPUT_BG = 'rgba(255,255,255,0.07)';

// ─── Shared form atoms (same system as Login / Register) ─────────────────────

function InputRow({
  icon,
  children,
  isError,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  isError?: boolean;
}) {
  return (
    <View style={[styles.inputWrapper, isError && styles.inputWrapperError]}>
      {icon}
      {children}
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <Text style={styles.fieldError}>{msg}</Text>;
}

type Strength = 'weak' | 'fair' | 'good' | 'strong';
const STRENGTH_COLOR: Record<Strength, string> = {
  weak: '#EF4444',
  fair: '#F97316',
  good: '#EAB308',
  strong: '#22C55E',
};

function passwordStrength(pw: string): { level: Strength; score: number } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 'weak', score };
  if (score === 2) return { level: 'fair', score };
  if (score === 3) return { level: 'good', score };
  return { level: 'strong', score };
}

// ─── Step 1: Enter email ──────────────────────────────────────────────────────

function StepEmail({ onNext }: { onNext: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!email.includes('@') || !email.includes('.')) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      onNext(email.trim().toLowerCase());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset code';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Forgot Password?</Text>
        <Text style={styles.stepSubtitle}>
          Enter the email address on your account and we'll send you a reset code.
        </Text>
      </View>

      <View style={styles.form}>
        <View>
          <FieldLabel>Email Address</FieldLabel>
          <InputRow icon={<Envelope size={20} color="rgba(255,255,255,0.35)" />} isError={!!error}>
            <TextInput
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="done"
              onSubmitEditing={handleSend}
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              style={styles.input}
              placeholderTextColor="rgba(255,255,255,0.18)"
            />
          </InputRow>
          <FieldErr msg={error} />
        </View>
      </View>

      <MsPressable
        style={[styles.primaryBtn, loading && styles.primaryBtnLoading]}
        onPress={handleSend}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.btnLabel}>Send Reset Code</Text>
        )}
      </MsPressable>
    </View>
  );
}

// ─── Step 2: Verify code ──────────────────────────────────────────────────────

function StepCode({ email, onNext }: { email: string; onNext: (code: string) => void }) {
  const [otp, setOtp] = useState('');
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_DURATION);
  const [canResend, setCanResend] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpRef = useRef<OTPInputRef>(null);

  const startTimer = () => {
    setCountdown(RESEND_DURATION);
    setCanResend(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); setCanResend(true); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleVerify = async () => {
    if (!completed) {
      setError('Enter all 6 digits');
      otpRef.current?.shake();
      return;
    }
    setError('');
    setLoading(true);
    try {
      // The code is validated on the server in the reset-password step.
      onNext(otp);
    } catch {
      setLoading(false);
    }
  };

  const handleComplete = (code: string) => {
    setCompleted(true);
    setOtp(code);
  };

  const handleResend = async () => {
    if (!canResend) return;
    setOtp('');
    setCompleted(false);
    setError('');
    setResendMsg('');
    otpRef.current?.clear();
    startTimer();
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setResendMsg('New code sent!');
      setTimeout(() => setResendMsg(''), 3000);
    } catch {
      // continue
    }
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Check Your Email</Text>
        <Text style={styles.stepSubtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.emailHighlight}>{email}</Text>
        </Text>
      </View>

      <OTPInput
        ref={otpRef}
        length={6}
        value={otp}
        onChange={(v) => { setOtp(v); setCompleted(false); setError(''); }}
        onComplete={handleComplete}
        hasError={!!error}
        autoFocus
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {!!resendMsg && <Text style={styles.successText}>{resendMsg}</Text>}

      <MsPressable
        style={[styles.primaryBtn, (!completed || loading) && styles.primaryBtnDisabled]}
        onPress={handleVerify}
        disabled={!completed || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.btnLabel}>Verify Code</Text>
        )}
      </MsPressable>

      <MsPressable onPress={handleResend} style={styles.resendRow} disabled={!canResend}>
        <Text style={[styles.resendText, !canResend && styles.resendDisabled]}>
          {canResend
            ? 'Resend code'
            : `Resend in 0:${countdown.toString().padStart(2, '0')}`}
        </Text>
      </MsPressable>
    </View>
  );
}

// ─── Step 3: New password ─────────────────────────────────────────────────────

function StepNewPassword({ email, code, onNext }: { email: string; code: string; onNext: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const confirmRef = useRef<TextInput>(null);

  const strength = password ? passwordStrength(password) : null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (password.length < 8) e.password = 'At least 8 characters required';
    else if (strength && strength.level === 'weak') e.password = 'Choose a stronger password';
    if (confirm !== password) e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleReset = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, password }),
      });
      onNext();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password';
      setErrors({ password: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>New Password</Text>
        <Text style={styles.stepSubtitle}>Choose a strong password of at least 8 characters.</Text>
      </View>

      <View style={styles.form}>
        <View>
          <FieldLabel>New Password</FieldLabel>
          <InputRow icon={<Lock size={18} color="rgba(255,255,255,0.35)" />} isError={!!errors.password}>
            <TextInput
              placeholder="••••••••"
              secureTextEntry={!showPw}
              value={password}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              onChangeText={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: '' })); }}
              style={[styles.input, { flex: 1 }]}
              placeholderTextColor="rgba(255,255,255,0.18)"
            />
            <MsPressable onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {showPw ? <EyeSlash size={20} color="rgba(255,255,255,0.35)" /> : <Eye size={20} color="rgba(255,255,255,0.35)" />}
            </MsPressable>
          </InputRow>
          {password.length > 0 && strength && (
            <View style={styles.strengthRow}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.strengthSeg,
                    { backgroundColor: i < strength.score ? STRENGTH_COLOR[strength.level] : 'rgba(255,255,255,0.1)' },
                  ]}
                />
              ))}
              <Text style={[styles.strengthLabel, { color: STRENGTH_COLOR[strength.level] }]}>
                {strength.level}
              </Text>
            </View>
          )}
          <FieldErr msg={errors.password} />
        </View>

        <View>
          <FieldLabel>Confirm Password</FieldLabel>
          <InputRow icon={<Lock size={18} color="rgba(255,255,255,0.35)" />} isError={!!errors.confirm}>
            <TextInput
              ref={confirmRef}
              placeholder="••••••••"
              secureTextEntry={!showConfirm}
              value={confirm}
              returnKeyType="done"
              onSubmitEditing={handleReset}
              onChangeText={(v) => { setConfirm(v); setErrors((e) => ({ ...e, confirm: '' })); }}
              style={[styles.input, { flex: 1 }]}
              placeholderTextColor="rgba(255,255,255,0.18)"
            />
            <MsPressable onPress={() => setShowConfirm((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {showConfirm ? <EyeSlash size={20} color="rgba(255,255,255,0.35)" /> : <Eye size={20} color="rgba(255,255,255,0.35)" />}
            </MsPressable>
          </InputRow>
          <FieldErr msg={errors.confirm} />
        </View>
      </View>

      <MsPressable
        style={[styles.primaryBtn, loading && styles.primaryBtnLoading]}
        onPress={handleReset}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.btnLabel}>Reset Password</Text>
        )}
      </MsPressable>
    </View>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function StepDone() {
  return (
    <View style={[styles.stepContainer, { alignItems: 'center' }]}>
      <View style={[styles.successIconWrap]}>
        <Text style={styles.successCheck}>✓</Text>
      </View>
      <View style={[styles.stepHeader, { alignItems: 'center' }]}>
        <Text style={[styles.stepTitle, { textAlign: 'center' }]}>Password Reset!</Text>
        <Text style={[styles.stepSubtitle, { textAlign: 'center' }]}>
          Your password has been reset successfully. Log in with your new password.
        </Text>
      </View>
      <MsPressable
        style={styles.primaryBtn}
        onPress={() => router.replace('/auth')}
      >
        <Text style={styles.btnLabel}>Back to Log In</Text>
      </MsPressable>
    </View>
  );
}

// ─── Step bar ─────────────────────────────────────────────────────────────────

const STEP_KEYS: Step[] = ['email', 'code', 'new_password', 'done'];
const STEP_LABELS = ['Email', 'Verify', 'Password', 'Done'];

function StepBar({ current }: { current: Step }) {
  const idx = STEP_KEYS.indexOf(current);
  return (
    <View style={bar.row}>
      {STEP_LABELS.map((label, i) => (
        <React.Fragment key={label}>
          <View style={bar.step}>
            <View style={[bar.dot, i <= idx && bar.dotActive]}>
              <Text style={[bar.num, i <= idx && bar.numActive]}>
                {i < idx ? '✓' : String(i + 1)}
              </Text>
            </View>
            <Text style={[bar.label, i <= idx && bar.labelActive]}>{label}</Text>
          </View>
          {i < STEP_LABELS.length - 1 && (
            <View style={[bar.connector, i < idx && bar.connectorActive]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const contentOpacity = useSharedValue(1);
  const contentY = useSharedValue(0);

  const advance = (to: Step) => {
    contentOpacity.value = withTiming(0, { duration: 130, easing: Easing.in(Easing.cubic) });
    contentY.value = withTiming(-10, { duration: 130, easing: Easing.in(Easing.cubic) });
    setTimeout(() => {
      setCurrentStep(to);
      contentY.value = 14;
      contentOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      contentY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    }, 110);
  };

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));

  const stepNum = STEP_KEYS.indexOf(currentStep) + 1;

  return (
    <MsScreenBackground>
      <KeyboardAwareScrollViewCompat
        key={currentStep}
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 28,
            paddingBottom: insets.bottom + 48,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        {currentStep !== 'done' && (
          <MsPressable
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <ArrowLeft size={22} color="#FFFFFF" />
          </MsPressable>
        )}

        {/* Screen title */}
        <View style={styles.screenHead}>
          <Text style={styles.screenTitle}>Reset Password</Text>
          <Text style={styles.screenSubtitle}>Step {stepNum} of 4</Text>
        </View>

        {/* Step bar */}
        <StepBar current={currentStep} />

        {/* Animated step content */}
        <Animated.View style={[contentStyle, { width: '100%' }]}>
          {currentStep === 'email' && (
            <StepEmail onNext={(e) => { setEmail(e); advance('code'); }} />
          )}
          {currentStep === 'code' && (
            <StepCode
              email={email}
              onNext={(c) => { setCode(c); advance('new_password'); }}
            />
          )}
          {currentStep === 'new_password' && (
            <StepNewPassword
              email={email}
              code={code}
              onNext={() => advance('done')}
            />
          )}
          {currentStep === 'done' && <StepDone />}
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
    </MsScreenBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 26,
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

  screenHead: { gap: 2 },
  screenTitle: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.35)',
  },

  // Step content
  stepContainer: { gap: 24, width: '100%' },
  stepHeader: { gap: 6 },
  stepTitle: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 22,
  },
  emailHighlight: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_500Medium',
  },

  form: { gap: 18 },

  fieldLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 50,
    paddingHorizontal: 18,
    height: 54,
    gap: 12,
  },
  inputWrapperError: {
    backgroundColor: 'rgba(239,68,68,0.09)',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    height: '100%',
    backgroundColor: 'transparent',
    // Vertically centre the caret + text inside the input row on Android.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',

  },
  fieldError: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
    paddingHorizontal: 4,
  },

  errorText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: '#EF4444',
    textAlign: 'center',
  },
  successText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: '#22C55E',
    textAlign: 'center',
  },

  // Password strength
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  strengthSeg: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    marginLeft: 4,
    textTransform: 'capitalize',
  },

  // Buttons
  primaryBtn: {
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
  primaryBtnLoading: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  primaryBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  btnLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  resendRow: { alignItems: 'center', paddingVertical: 4 },
  resendText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF',
  },
  resendDisabled: { color: 'rgba(255,255,255,0.25)' },

  successIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  successCheck: {
    fontSize: 40,
    fontFamily: 'Poppins_700Bold',
    color: '#22C55E',
  },
});

// ─── Step bar styles ──────────────────────────────────────────────────────────

const bar = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  step: { alignItems: 'center', gap: 5 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  num: {
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.25)',
  },
  numActive: { color: '#FFFFFF' },
  label: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.25)',
  },
  labelActive: { color: '#FFFFFF', fontFamily: 'Poppins_500Medium' },
  connector: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
  },
  connectorActive: { backgroundColor: 'rgba(255,255,255,0.4)' },
});
