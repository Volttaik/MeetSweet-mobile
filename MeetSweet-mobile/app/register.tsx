import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { Spinner } from 'heroui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/services/api';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MsScreenBackground } from '@/components/MsScreenBackground';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  ArrowLeft,
  At,
  Camera,
  Calendar,
  Eye,
  EyeSlash,
  Lock,
  Envelope,
  Phone,
  User,
} from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { savePendingAvatar } from '@/lib/pending-avatar';
import { clearPendingReferralCode, getPendingReferralCode, lookupReferral, savePendingReferralCode, type ReferralReferrer } from '@/services/referrals';

// ─── Constants ────────────────────────────────────────────────────────────────

const INPUT_BG = 'rgba(255,255,255,0.07)';

const COUNTRY_CODES = [
  { code: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+1', flag: '🇺🇸', name: 'United States' },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: '+91', flag: '🇮🇳', name: 'India' },
  { code: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+81', flag: '🇯🇵', name: 'Japan' },
  { code: '+55', flag: '🇧🇷', name: 'Brazil' },
  { code: '+27', flag: '🇿🇦', name: 'South Africa' },
];

// Nigeria is the default
const DEFAULT_COUNTRY_IDX = 0;

type StepNum = 1 | 2 | 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Strength = 'weak' | 'fair' | 'good' | 'strong';
const STRENGTH_COLOR: Record<Strength, string> = {
  weak: '#EF4444',
  fair: '#F97316',
  good: '#EAB308',
  strong: '#22C55E',
};

function passwordStrength(pw: string): { level: Strength; score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 'weak', score, label: 'Weak' };
  if (score === 2) return { level: 'fair', score, label: 'Fair' };
  if (score === 3) return { level: 'good', score, label: 'Good' };
  return { level: 'strong', score, label: 'Strong' };
}

function calculateAge(dob: string): number {
  const parts = dob.split('/');
  if (parts.length !== 3) return 0;
  const [m, d, y] = parts.map(Number);
  if (!m || !d || !y || y < 1900) return 0;
  const birth = new Date(y, m - 1, d);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDOB(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// ─── InputRow ─────────────────────────────────────────────────────────────────

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

// ─── FieldLabel ───────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <Text style={styles.fieldError}>{msg}</Text>;
}

// ─── Step bar ─────────────────────────────────────────────────────────────────

const STEP_LABELS = ['About You', 'Password', 'Profile'];

function StepBar({ current }: { current: StepNum }) {
  const idx = current - 1;
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

// ─── Step 1: About You ────────────────────────────────────────────────────────

interface Step1Data {
  name: string;
  username: string;
  email: string;
  phone: string;
  countryCodeIdx: number;
  dob: string;
}

const Step1 = React.memo(function Step1({
  data,
  onChange,
  onNext,
  serverEmailError,
  referralReferrer,
}: {
  data: Step1Data;
  onChange: (d: Partial<Step1Data>) => void;
  onNext: () => void;
  serverEmailError?: string;
  referralReferrer?: ReferralReferrer | null;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const usernameRef = React.useRef<TextInput>(null);
  const emailRef = React.useRef<TextInput>(null);
  const phoneRef = React.useRef<TextInput>(null);
  const dobRef = React.useRef<TextInput>(null);

  const country = COUNTRY_CODES[data.countryCodeIdx] ?? COUNTRY_CODES[DEFAULT_COUNTRY_IDX];

  // Show server-side email error inline
  useEffect(() => {
    if (serverEmailError) {
      setErrors((e) => ({ ...e, email: serverEmailError }));
    }
  }, [serverEmailError]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (data.name.trim().length < 2) e.name = 'Enter your full name';
    if (data.username.trim().length < 3) e.username = 'At least 3 characters required';
    else if (!/^[a-z0-9_.]{3,30}$/i.test(data.username.trim())) e.username = 'Letters, numbers, _ and . only';
    if (!data.email.includes('@') || !data.email.includes('.'))
      e.email = 'Enter a valid email address';
    const phoneDigits = data.phone.replace(/\D/g, '');
    if (phoneDigits.length < 7) e.phone = 'Enter a valid phone number';
    const age = calculateAge(data.dob);
    if (!data.dob || data.dob.length < 10) e.dob = 'Enter your date of birth (MM/DD/YYYY)';
    else if (age < 18) e.dob = 'You must be at least 18 years old to join';
    else if (age > 120) e.dob = 'Please enter a valid date of birth';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>About You</Text>
        <Text style={styles.stepSubtitle}>Tell us a little about yourself to get started.</Text>
      </View>

      {referralReferrer ? (
        <View style={styles.referralNotice}>
          <Text style={styles.referralNoticeLabel}>REFERRED BY</Text>
          <Text style={styles.referralNoticeText}>{referralReferrer.name}</Text>
          <Text style={styles.referralNoticeSub}>Your referral code is attached to this registration.</Text>
        </View>
      ) : null}

      {showCountryPicker ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.fieldLabel}>Select Country</Text>
          <View style={{ backgroundColor: INPUT_BG, borderRadius: 16, overflow: 'hidden' }}>
            {COUNTRY_CODES.map((c, i) => (
              <MsPressable
                key={c.code}
                style={[
                  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 10 },
                  i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
                ]}
                onPress={() => { onChange({ countryCodeIdx: i }); setShowCountryPicker(false); }}
                      >
                <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular', color: '#FFFFFF' }}>{c.name}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Poppins_500Medium', color: 'rgba(255,255,255,0.4)' }}>{c.code}</Text>
              </MsPressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          {/* Full Name */}
          <View>
            <FieldLabel>Full Name</FieldLabel>
            <InputRow icon={<User size={20} color="rgba(255,255,255,0.35)" />} isError={!!errors.name}>
              <TextInput
                placeholder="Jane Smith"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => usernameRef.current?.focus()}
                value={data.name}
                onChangeText={(v) => { onChange({ name: v }); setErrors((e) => ({ ...e, name: '' })); }}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.18)"
              />
            </InputRow>
            <FieldErr msg={errors.name} />
          </View>

          {/* Username */}
          <View>
            <FieldLabel>Username</FieldLabel>
            <InputRow icon={<At size={20} color="rgba(255,255,255,0.35)" />} isError={!!errors.username}>
              <TextInput
                ref={usernameRef}
                placeholder="yourhandle"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                value={data.username}
                onChangeText={(v) => { onChange({ username: v.replace(/\s/g, '') }); setErrors((e) => ({ ...e, username: '' })); }}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.18)"
              />
            </InputRow>
            <FieldErr msg={errors.username} />
          </View>

          {/* Email */}
          <View>
            <FieldLabel>Email</FieldLabel>
            <InputRow icon={<Envelope size={20} color="rgba(255,255,255,0.35)" />} isError={!!errors.email}>
              <TextInput
                ref={emailRef}
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                value={data.email}
                onChangeText={(v) => { onChange({ email: v }); setErrors((e) => ({ ...e, email: '' })); }}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.18)"
              />
            </InputRow>
            <FieldErr msg={errors.email} />
          </View>

          {/* Phone */}
          <View>
            <FieldLabel>Phone Number</FieldLabel>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Country code selector */}
              <MsPressable
                style={[styles.inputWrapper, { width: 90, justifyContent: 'center', gap: 4, paddingHorizontal: 12 }]}
                onPress={() => setShowCountryPicker(true)}
                      >
                <Text style={{ fontSize: 14 }}>{country.flag}</Text>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#FFFFFF' }}>{country.code}</Text>
              </MsPressable>

              {/* Phone digits input — flex:1 keeps the row full-width so it
                  never collapses into the tiny circular pill seen before. */}
              <View style={{ flex: 1 }}>
                <InputRow icon={<Phone size={20} color="rgba(255,255,255,0.35)" />} isError={!!errors.phone}>
                  <TextInput
                    ref={phoneRef}
                    placeholder="Phone number"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    returnKeyType="next"
                    onSubmitEditing={() => dobRef.current?.focus()}
                    value={data.phone}
                    onChangeText={(v) => { onChange({ phone: v.replace(/\D/g, '').slice(0, 15) }); setErrors((e) => ({ ...e, phone: '' })); }}
                    style={styles.input}
                    placeholderTextColor="rgba(255,255,255,0.18)"
                  />
                </InputRow>
              </View>
            </View>
            <FieldErr msg={errors.phone} />
          </View>

          {/* Date of Birth */}
          <View>
            <FieldLabel>Date of Birth</FieldLabel>
            <Text style={styles.fieldHintText}>You must be 18+ to join</Text>
            <InputRow icon={<Calendar size={20} color="rgba(255,255,255,0.35)" />} isError={!!errors.dob}>
              <TextInput
                ref={dobRef}
                placeholder="MM/DD/YYYY"
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => { if (validate()) onNext(); }}
                value={data.dob}
                onChangeText={(v) => { onChange({ dob: formatDOB(v) }); setErrors((e) => ({ ...e, dob: '' })); }}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.18)"
                maxLength={10}
              />
            </InputRow>
            <FieldErr msg={errors.dob} />
          </View>
        </View>
      )}

      {!showCountryPicker && (
        <MsPressable style={styles.primaryBtn} onPress={() => { if (validate()) onNext(); }}>
          <Text style={styles.btnLabel}>Continue</Text>
        </MsPressable>
      )}
    </View>
  );
});

// ─── Step 2: Password ─────────────────────────────────────────────────────────

interface Step2Data {
  password: string;
  confirm: string;
}

const Step2 = React.memo(function Step2({
  data,
  onChange,
  onNext,
}: {
  data: Step2Data;
  onChange: (d: Partial<Step2Data>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = data.password ? passwordStrength(data.password) : null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (data.password.length < 8) e.password = 'At least 8 characters required';
    if (strength && strength.level === 'weak') e.password = 'Choose a stronger password';
    if (data.confirm !== data.password) e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Secure Password</Text>
        <Text style={styles.stepSubtitle}>Create a strong password to protect your account.</Text>
      </View>

      <View style={styles.form}>
        {/* Password */}
        <View>
          <FieldLabel>Password</FieldLabel>
          <InputRow icon={<Lock size={18} color="rgba(255,255,255,0.35)" />} isError={!!errors.password}>
            <TextInput
              placeholder="••••••••"
              secureTextEntry={!showPw}
              value={data.password}
              onChangeText={(v) => { onChange({ password: v }); setErrors((e) => ({ ...e, password: '' })); }}
              style={[styles.input, { flex: 1 }]}
              placeholderTextColor="rgba(255,255,255,0.18)"
            />
            <MsPressable onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {showPw ? <EyeSlash size={20} color="rgba(255,255,255,0.35)" /> : <Eye size={20} color="rgba(255,255,255,0.35)" />}
            </MsPressable>
          </InputRow>
          {data.password.length > 0 && strength && (
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
                {strength.label}
              </Text>
            </View>
          )}
          <FieldErr msg={errors.password} />
        </View>

        {/* Confirm Password */}
        <View>
          <FieldLabel>Confirm Password</FieldLabel>
          <InputRow icon={<Lock size={18} color="rgba(255,255,255,0.35)" />} isError={!!errors.confirm}>
            <TextInput
              placeholder="••••••••"
              secureTextEntry={!showConfirm}
              value={data.confirm}
              onChangeText={(v) => { onChange({ confirm: v }); setErrors((e) => ({ ...e, confirm: '' })); }}
              style={[styles.input, { flex: 1 }]}
              placeholderTextColor="rgba(255,255,255,0.18)"
            />
            <MsPressable onPress={() => setShowConfirm((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {showConfirm ? <EyeSlash size={20} color="rgba(255,255,255,0.35)" /> : <Eye size={20} color="rgba(255,255,255,0.35)" />}
            </MsPressable>
          </InputRow>
          <FieldErr msg={errors.confirm} />
        </View>

        <View style={styles.passwordHints}>
          {[
            { label: 'At least 8 characters', valid: data.password.length >= 8 },
            { label: 'One uppercase letter', valid: /[A-Z]/.test(data.password) },
            { label: 'One number', valid: /[0-9]/.test(data.password) },
            { label: 'One special character', valid: /[^A-Za-z0-9]/.test(data.password) },
          ].map((item) => (
            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={{ color: item.valid ? '#10B981' : 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '700' }}>
                {item.valid ? '✓' : '•'}
              </Text>
              <Text style={{ color: item.valid ? '#10B981' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <MsPressable style={styles.primaryBtn} onPress={() => { if (validate()) onNext(); }}>
        <Text style={styles.btnLabel}>Continue</Text>
      </MsPressable>
    </View>
  );
});

// ─── Step 3: Profile ──────────────────────────────────────────────────────────

interface Step3Data {
  bio: string;
  avatarUri: string | null;
  avatarMimeType?: string;
  avatarFileName?: string;
}

const Step3 = React.memo(function Step3({
  data,
  step1Name,
  onChange,
  onNext,
  isLoading,
  serverError,
}: {
  data: Step3Data;
  step1Name: string;
  onChange: (d: Partial<Step3Data>) => void;
  onNext: () => void;
  onBack: () => void;
  isLoading?: boolean;
  serverError?: string;
}) {
  const loading = isLoading ?? false;

  const initials = step1Name
    .trim()
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      onChange({
        avatarUri: result.assets[0].uri,
        avatarMimeType: result.assets[0].mimeType ?? 'image/jpeg',
        avatarFileName: result.assets[0].fileName ?? 'avatar.jpg',
      });
    }
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Your Profile</Text>
        <Text style={styles.stepSubtitle}>Add a photo and a short bio so others can get to know you.</Text>
      </View>

      {/* Avatar picker */}
      <View style={styles.avatarSection}>
        <MsPressable onPress={pickImage} style={styles.avatarWrap}>
          {data.avatarUri ? (
            <Image source={{ uri: data.avatarUri }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials || '?'}</Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            <Camera size={16} color="#000000" />
          </View>
        </MsPressable>
        <Text style={styles.avatarHint}>Tap to add a profile photo</Text>
      </View>

      {/* Bio */}
      <View style={styles.form}>
        <View>
          <Text style={styles.fieldLabel}>Bio</Text>
          <Text style={styles.fieldHintText}>Tell the community who you are  (optional)</Text>
          <View style={styles.bioWrapper}>
            <TextInput
              placeholder="A little about yourself…"
              multiline
              numberOfLines={4}
              value={data.bio}
              onChangeText={(v) => onChange({ bio: v })}
              style={styles.bioInput}
              placeholderTextColor="rgba(255,255,255,0.18)"
              maxLength={160}
            />
          </View>
          <Text style={styles.charCount}>{data.bio.length}/160</Text>
        </View>
      </View>

      {!!serverError && (
        <View style={styles.serverErrorBox}>
          <Text style={styles.serverError}>{serverError}</Text>
        </View>
      )}

      <MsPressable
        style={[styles.primaryBtn, loading && styles.primaryBtnLoading]}
        onPress={onNext}
        disabled={loading}
      >
        {loading ? (
          <Spinner size="sm" color="#FFFFFF" />
        ) : (
          <Text style={styles.btnLabel}>Complete</Text>
        )}
      </MsPressable>
    </View>
  );
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const { referral: referralParam } = useLocalSearchParams<{ referral?: string }>();
  const [step, setStep] = useState<StepNum>(1);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralReferrer, setReferralReferrer] = useState<ReferralReferrer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState('');
  // Surface email-in-use errors back to Step 1 for inline display
  const [emailError, setEmailError] = useState('');


  const opacity = useSharedValue(1);

  const [step1, setStep1] = useState<Step1Data>({ name: '', username: '', email: '', phone: '', countryCodeIdx: DEFAULT_COUNTRY_IDX, dob: '' });
  const [step2, setStep2] = useState<Step2Data>({ password: '', confirm: '' });
  const [step3, setStep3] = useState<Step3Data>({ bio: '', avatarUri: null });

  // The referral code is persisted independently of the form so it survives
  // navigation, email verification, and a closed/reopened registration flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const code = referralParam || await getPendingReferralCode();
      if (!code) return;
      await savePendingReferralCode(code);
      // Keep the raw normalized code available immediately so a user can
      if (!cancelled) setReferralCode(code.trim().toUpperCase());
      try {
        const resolved = await lookupReferral(code);
        if (!cancelled) {
          setReferralCode(resolved.code);
          setReferralReferrer(resolved.referrer);
        }
      } catch {
        if (!cancelled) setReferralCode(code.trim().toUpperCase());
      }
    })();
    return () => { cancelled = true; };
  }, [referralParam]);

  // Scroll resets to the top automatically on step change via key={step} on
  // the keyboard-aware scroll view (remount starts at the top).

  // Fade-only transition — clean, no layout jank
  const transitionTo = useCallback((nextStep: StepNum) => {
    opacity.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }, () => {
      runOnJS(setStep)(nextStep);
    });
  }, [opacity]);

  // After step changes, fade back in
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [step]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Memoized step callbacks — prevents Step components from re-rendering during animation
  const handleStep1Change = useCallback((d: Partial<Step1Data>) => {
    setStep1((s) => ({ ...s, ...d }));
    if (d.email !== undefined) setEmailError('');
  }, []);
  const handleStep2Change = useCallback((d: Partial<Step2Data>) => setStep2((s) => ({ ...s, ...d })), []);
  const handleStep3Change = useCallback((d: Partial<Step3Data>) => setStep3((s) => ({ ...s, ...d })), []);

  const handleStep1Next = useCallback(() => transitionTo(2), [transitionTo]);
  const handleStep2Next = useCallback(() => transitionTo(3), [transitionTo]);
  const handleStep2Back = useCallback(() => transitionTo(1), [transitionTo]);
  const handleStep3Back = useCallback(() => transitionTo(2), [transitionTo]);

  const handleStep3Complete = useCallback(async () => {
    setSubmitting(true);
    setRegisterError('');
    try {
      // The avatar is a device-local file URI and cannot be uploaded before the
      // account exists. Stash it keyed by email; it is uploaded after first login.
      if (step3.avatarUri) {
        await savePendingAvatar(step1.email.trim().toLowerCase(), {
          uri: step3.avatarUri,
          mimeType: step3.avatarMimeType,
          fileName: step3.avatarFileName,
        });
      }
      const country = COUNTRY_CODES[step1.countryCodeIdx] ?? COUNTRY_CODES[DEFAULT_COUNTRY_IDX];
      const phoneDigits = step1.phone.replace(/\D/g, '');
      const fullPhone = phoneDigits ? `${country.code}${phoneDigits}` : undefined;
      await register({
        full_name: step1.name.trim(),
        username: step1.username.trim().toLowerCase(),
        email: step1.email.trim().toLowerCase(),
        password: step2.password,
        confirm_password: step2.confirm,
        phone: fullPhone,
        bio: step3.bio.trim() || undefined,
        date_of_birth: step1.dob || undefined,
        dob: step1.dob || undefined,
        referral_code: referralCode || undefined,
      });
      await clearPendingReferralCode();
      router.replace({ pathname: '/verify-email', params: { email: step1.email.trim() } });
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = err.message ?? '';
        const lower = msg.toLowerCase();
        // 1. Unverified account — most specific; send to verify screen
        if (err.status === 409 && (lower.includes('unverified') || lower.includes('not verified') || lower.includes('verify'))) {
          router.replace({ pathname: '/verify-email', params: { email: step1.email.trim() } });
          return;
        }
        // 2. Username taken
        if (err.status === 409 && (lower.includes('username') || lower.includes('handle'))) {
          setRegisterError('That username is already taken. Please choose another.');
          transitionTo(1);
          return;
        }
        // 3. Email already registered (catches remaining 409s + any explicit email conflict)
        if (err.status === 409 || (lower.includes('email') && lower.includes('already'))) {
          setEmailError('This email is already registered. Try logging in instead.');
          transitionTo(1);
          return;
        }
        setRegisterError(msg || 'Registration failed. Please try again.');
      } else {
        setRegisterError('Registration failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [step1, step2, referralCode, register, transitionTo]);

  return (
    <MsScreenBackground>
      <KeyboardAwareScrollViewCompat
        key={step}
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
        <MsPressable
          onPress={() => (step === 1 ? router.back() : transitionTo((step - 1) as StepNum))}
          style={styles.backBtn}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </MsPressable>

        {/* Screen title */}
        <View style={styles.screenHead}>
          <Text style={styles.screenTitle}>Create Account</Text>
          <Text style={styles.screenSubtitle}>Step {step} of 3</Text>
        </View>

        {/* Step bar */}
        <StepBar current={step} />



        {/* Animated step content */}
        <Animated.View style={[contentStyle, { width: '100%' }]}>
          {step === 1 && (
            <Step1
              data={step1}
              onChange={handleStep1Change}
              onNext={handleStep1Next}
              serverEmailError={emailError || undefined}
              referralReferrer={referralReferrer}
            />
          )}
          {step === 2 && (
            <Step2
              data={step2}
              onChange={handleStep2Change}
              onNext={handleStep2Next}
              onBack={handleStep2Back}
            />
          )}
          {step === 3 && (
            <Step3
              data={step3}
              step1Name={step1.name}
              onChange={handleStep3Change}
              onNext={handleStep3Complete}
              onBack={handleStep3Back}
              isLoading={submitting}
              serverError={registerError}
            />
          )}
        </Animated.View>

        {/* Sign in link */}
        {step === 1 && (
          <View style={styles.signinRow}>
            <Text style={styles.signinText}>Already have an account? </Text>
            <MsPressable onPress={() => router.push('/auth')}>
              <Text style={styles.signinLink}>Log In</Text>
            </MsPressable>
          </View>
        )}
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

  form: { gap: 18 },

  fieldLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 8,
  },
  fieldHintText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.3)',
    marginTop: -4,
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
  },

  // Password hints
  passwordHints: {
    gap: 4,
    paddingHorizontal: 4,
  },
  passwordHint: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.3)',
    lineHeight: 20,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
    width: 100,
    height: 100,
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1A1A1A',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 32,
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.5)',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  avatarHint: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.35)',
  },

  // Bio
  bioWrapper: {
    backgroundColor: INPUT_BG,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 120,
  },
  bioInput: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    textAlignVertical: 'top',
    minHeight: 92,
    backgroundColor: 'transparent',

  },
  charCount: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'right',
    marginTop: 6,
  },

  referralNotice: {
    backgroundColor: 'rgba(196,90,114,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,90,114,0.28)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 3,
  },
  referralNoticeLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  referralNoticeText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
  },
  referralNoticeSub: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },

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
  serverErrorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12,
    padding: 14,
  },
  serverError: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: '#EF4444',
    textAlign: 'center',
  },
  btnLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  // Sign in link
  signinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 4,
  },
  signinText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.4)',
  },
  signinLink: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF',
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
