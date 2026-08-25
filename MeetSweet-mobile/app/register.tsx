import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Spinner } from 'heroui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { T, alpha, AppGradients } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
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
import { GradientText } from '@/components/GradientText';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import {
  ArrowLeft,
  At,
  Camera,
  Calendar,
  Check,
  Eye,
  EyeSlash,
  Lock,
  Envelope,
  Phone,
  User,
  X,
} from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { checkEmailAvailability, checkUsernameAvailability } from '@/services/users';
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
  weak: T.ERROR,
  fair: T.WARNING,
  good: T.WARNING,
  strong: T.SUCCESS,
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
  trailing,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  isError?: boolean;
  /** Fixed-width status slot (spinner / ✓ / ✕) — reserved so the row never
   *  shifts horizontally when the indicator appears or disappears. */
  trailing?: React.ReactNode;
}) {
  return (
    <View style={[styles.inputWrapper, isError && styles.inputWrapperError]}>
      {icon}
      {children}
      {trailing}
    </View>
  );
}

// ─── Live availability state ──────────────────────────────────────────────────

type AvailState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

/**
 * Debounced + race-protected server availability check.
 *
 * • Only fires after the user pauses typing (600 ms)
 * • Every keystroke bumps a sequence counter — a stale response that arrives
 *   after a newer check can never overwrite the current state
 * • Typing resets to 'idle' immediately (no stale ✓/✕ while editing)
 */
function useLiveAvailability(check: (value: string) => Promise<{ available: boolean }>) {
  const [state, setState] = useState<AvailState>('idle');
  const seqRef    = useRef(0);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((value: string) => {
    const seq = ++seqRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('idle');
    if (!value) return;
    timerRef.current = setTimeout(() => {
      setState('checking');
      check(value)
        .then((res) => {
          if (seqRef.current !== seq) return; // stale — a newer keystroke owns the state
          setState(res.available ? 'available' : 'taken');
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          setState('error'); // network hiccup — final submit re-validates server-side
        });
    }, 600);
  }, [check]);

  /** Imperatively set state (e.g. a server-confirmed conflict from submit). */
  const force = useCallback((next: AvailState) => {
    seqRef.current++;
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(next);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { state, update, force };
}

/** Inline trailing indicator: spinner while checking, ✓ available, ✕ taken/invalid. */
function AvailIndicator({ state }: { state: AvailState | 'invalid' }) {
  return (
    <View style={styles.availSlot}>
      {state === 'checking' ? (
        <ActivityIndicator size={16} color="rgba(255,255,255,0.5)" />
      ) : state === 'available' ? (
        <Check size={17} color={T.SUCCESS} weight="bold" />
      ) : state === 'taken' || state === 'invalid' ? (
        <X size={17} color={T.ERROR} weight="bold" />
      ) : null}
    </View>
  );
}

/** Map raw availability state → display state (invalid format beats everything). */
function availDisplay(state: AvailState, formatOk: boolean, hasInput: boolean): AvailState | 'invalid' {
  if (hasInput && !formatOk) return 'invalid';
  return state;
}

// ─── FieldLabel ───────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <Text style={styles.fieldError}>{msg}</Text>;
}

/** Green success status line (e.g. "Username available"). */
function FieldStatusOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <Text style={[styles.fieldError, styles.fieldStatusOk]}>{msg}</Text>;
}

/** Neutral "Checking availability…" line — same reserved slot, no layout shift. */
function FieldStatusInfo({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <Text style={[styles.fieldError, styles.fieldStatusInfo]}>{msg}</Text>;
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
              {/* Active/completed steps wear the platform-gradient circle */}
              {i <= idx && <BrandGradientFill />}
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

  // ── Live server availability (debounced + race-protected) ────────────────
  const usernameAvail = useLiveAvailability(checkUsernameAvailability);
  const emailAvail    = useLiveAvailability(checkEmailAvailability);

  // The step remounts on every transition, so pre-filled values (returning to
  // this step with a valid email/username) need their availability re-checked.
  useEffect(() => {
    if (usernameOk) usernameAvail.update(data.username.trim());
    if (emailOk)    emailAvail.update(data.email.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show server-side email error inline (e.g. 409 discovered at submit).
  // The email is known-taken at that point, so block Continue until edited.
  useEffect(() => {
    if (serverEmailError) {
      setErrors((e) => ({ ...e, email: serverEmailError }));
      emailAvail.force('taken');
    }
  }, [serverEmailError]);

  // ── Format rules (mirror the server's register schema exactly) ────────────
  const nameOk     = data.name.trim().length >= 2;
  // Server: /^[a-zA-Z0-9_]{3,30}$/ — letters, numbers, underscores only.
  const usernameOk = /^[a-zA-Z0-9_]{3,30}$/.test(data.username.trim());
  const emailOk    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim());
  const phoneDigits = data.phone.replace(/\D/g, '');
  const phoneOk    = phoneDigits.length >= 7;
  const age        = calculateAge(data.dob);
  const dobOk      = data.dob.length === 10 && age >= 18 && age <= 120;

  // Availability is authoritative once resolved; a transient network 'error'
  // does NOT block (the final submit re-validates server-side).
  const usernameReady = usernameOk && (usernameAvail.state === 'available' || usernameAvail.state === 'error');
  const emailReady    = emailOk    && (emailAvail.state === 'available'    || emailAvail.state === 'error');
  const step1Valid = nameOk && usernameReady && emailReady && phoneOk && dobOk;

  const usernameHasInput = data.username.trim().length > 0;
  const emailHasInput    = data.email.trim().length > 0;
  const usernameDisplay  = availDisplay(usernameAvail.state, usernameOk, usernameHasInput);
  const emailDisplay     = availDisplay(emailAvail.state, emailOk, emailHasInput);

  // Live local errors for the non-availability fields — show as the user types.
  const liveErrName  = data.name.trim().length > 0 && !nameOk ? 'Enter your full name' : '';
  const liveErrPhone = data.phone.length > 0 && !phoneOk ? 'Enter a valid phone number' : '';
  const liveErrDob   = data.dob.length === 10 && !dobOk
    ? (age < 18 ? 'You must be at least 18 years old to join' : 'Please enter a valid date of birth')
    : '';

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <GradientText text="About You" style={styles.stepTitle} />
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
              <TouchableOpacity
                key={c.code}
                style={[
                  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 10 },
                  i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
                ]}
                onPress={() => { onChange({ countryCodeIdx: i }); setShowCountryPicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular', color: T.ACCENT_FG }}>{c.name}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Poppins_500Medium', color: 'rgba(255,255,255,0.4)' }}>{c.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          {/* Full Name */}
          <View>
            <FieldLabel>Full Name</FieldLabel>
            <InputRow icon={<User size={20} color="rgba(255,255,255,0.35)" />} isError={!!(errors.name || liveErrName)}>
              <TextInput
                placeholder="Jane Smith"
                selectionColor={T.CARET}
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
            <FieldErr msg={errors.name || liveErrName} />
          </View>

          {/* Username — live server availability check */}
          <View>
            <FieldLabel>Username</FieldLabel>
            <InputRow
              icon={<At size={20} color="rgba(255,255,255,0.35)" />}
              isError={usernameDisplay === 'invalid' || usernameDisplay === 'taken'}
              trailing={<AvailIndicator state={usernameDisplay} />}
            >
              <TextInput
                ref={usernameRef}
                placeholder="yourhandle"
                selectionColor={T.CARET}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                value={data.username}
                onChangeText={(v) => {
                  const clean = v.replace(/\s/g, '');
                  onChange({ username: clean });
                  // Only query the server once the value is format-valid — no
                  // wasted requests on clearly-invalid input.
                  if (/^[a-zA-Z0-9_]{3,30}$/.test(clean.trim())) {
                    usernameAvail.update(clean.trim());
                  } else {
                    usernameAvail.force('idle');
                  }
                  setErrors((e) => ({ ...e, username: '' }));
                }}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.18)"
              />
            </InputRow>
            {usernameDisplay === 'invalid' ? (
              <FieldErr msg={usernameHasInput ? 'Letters, numbers and underscores only (3–30)' : 'At least 3 characters required'} />
            ) : usernameDisplay === 'checking' ? (
              <FieldStatusInfo msg="Checking availability…" />
            ) : usernameDisplay === 'available' ? (
              <FieldStatusOk msg="Username available" />
            ) : usernameDisplay === 'taken' ? (
              <FieldErr msg="Username already exists" />
            ) : usernameDisplay === 'error' ? (
              <FieldStatusInfo msg="Couldn't verify — will check on submit" />
            ) : null}
          </View>

          {/* Email — live server availability check */}
          <View>
            <FieldLabel>Email</FieldLabel>
            <InputRow
              icon={<Envelope size={20} color="rgba(255,255,255,0.35)" />}
              isError={emailDisplay === 'invalid' || emailDisplay === 'taken'}
              trailing={<AvailIndicator state={emailDisplay} />}
            >
              <TextInput
                ref={emailRef}
                placeholder="your@email.com"
                selectionColor={T.CARET}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                value={data.email}
                onChangeText={(v) => {
                  onChange({ email: v });
                  // Only query the server once the value is format-valid.
                  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) {
                    emailAvail.update(v.trim());
                  } else {
                    emailAvail.force('idle');
                  }
                  setErrors((e) => ({ ...e, email: '' }));
                }}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.18)"
              />
            </InputRow>
            {emailDisplay === 'invalid' ? (
              <FieldErr msg="Enter a valid email address" />
            ) : emailDisplay === 'checking' ? (
              <FieldStatusInfo msg="Checking availability…" />
            ) : emailDisplay === 'available' ? (
              <FieldStatusOk msg="Email available" />
            ) : emailDisplay === 'taken' ? (
              <FieldErr msg={errors.email || 'Email already in use'} />
            ) : emailDisplay === 'error' ? (
              <FieldStatusInfo msg="Couldn't verify — will check on submit" />
            ) : null}
          </View>

          {/* Phone */}
          <View>
            <FieldLabel>Phone Number</FieldLabel>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Country code selector */}
              <TouchableOpacity
                style={[styles.inputWrapper, { width: 90, justifyContent: 'center', gap: 4, paddingHorizontal: 12 }]}
                onPress={() => setShowCountryPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14 }}>{country.flag}</Text>
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: T.ACCENT_FG }}>{country.code}</Text>
              </TouchableOpacity>

              {/* Phone digits input — flex:1 keeps the row full-width so it
                  never collapses into the tiny circular pill seen before. */}
              <View style={{ flex: 1 }}>
                <InputRow icon={<Phone size={20} color="rgba(255,255,255,0.35)" />} isError={!!(errors.phone || liveErrPhone)}>
                  <TextInput
                    ref={phoneRef}
                    placeholder="Phone number"
                    selectionColor={T.CARET}
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
            <FieldErr msg={errors.phone || liveErrPhone} />
          </View>

          {/* Date of Birth */}
          <View>
            <FieldLabel>Date of Birth</FieldLabel>
            <Text style={styles.fieldHintText}>You must be 18+ to join</Text>
            <InputRow icon={<Calendar size={20} color="rgba(255,255,255,0.35)" />} isError={!!(errors.dob || liveErrDob)}>
              <TextInput
                ref={dobRef}
                placeholder="MM/DD/YYYY"
                selectionColor={T.CARET}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => { if (step1Valid) onNext(); }}
                value={data.dob}
                onChangeText={(v) => { onChange({ dob: formatDOB(v) }); setErrors((e) => ({ ...e, dob: '' })); }}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.18)"
                maxLength={10}
              />
            </InputRow>
            <FieldErr msg={errors.dob || liveErrDob} />
          </View>
        </View>
      )}

      {!showCountryPicker && (
        <TouchableOpacity
          style={[styles.primaryBtn, !step1Valid && styles.primaryBtnDisabled]}
          onPress={() => { if (step1Valid) onNext(); }}
          disabled={!step1Valid}
          activeOpacity={0.85}
        >
          <LinearGradient colors={AppGradients.brand} locations={AppGradients.brandLocs} start={AppGradients.brandStart} end={AppGradients.brandEnd} style={StyleSheet.absoluteFill} />
          <Text style={styles.btnLabel}>Continue</Text>
        </TouchableOpacity>
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

  // ── Live validation — the Continue button stays disabled until valid ─────
  const pwHasInput = data.password.length > 0;
  const pwOk       = data.password.length >= 8 && strength !== null && strength.level !== 'weak';
  const confirmOk  = data.confirm.length > 0 && data.confirm === data.password;
  const step2Valid = pwOk && confirmOk;
  const liveErrPw      = pwHasInput && !pwOk ? (data.password.length < 8 ? 'At least 8 characters required' : 'Choose a stronger password') : '';
  const liveErrConfirm = data.confirm.length > 0 && !confirmOk ? 'Passwords do not match' : '';

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <GradientText text="Secure Password" style={styles.stepTitle} />
        <Text style={styles.stepSubtitle}>Create a strong password to protect your account.</Text>
      </View>

      <View style={styles.form}>
        {/* Password */}
        <View>
          <FieldLabel>Password</FieldLabel>
          <InputRow icon={<Lock size={18} color="rgba(255,255,255,0.35)" />} isError={!!(errors.password || liveErrPw)}>
            <TextInput
              placeholder="••••••••"
              selectionColor={T.CARET}
              secureTextEntry={!showPw}
              value={data.password}
              onChangeText={(v) => { onChange({ password: v }); setErrors((e) => ({ ...e, password: '' })); }}
              style={[styles.input, { flex: 1 }]}
              placeholderTextColor="rgba(255,255,255,0.18)"
            />
            <TouchableOpacity onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {showPw ? <EyeSlash size={20} color="rgba(255,255,255,0.35)" /> : <Eye size={20} color="rgba(255,255,255,0.35)" />}
            </TouchableOpacity>
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
          <FieldErr msg={errors.password || liveErrPw} />
        </View>

        {/* Confirm Password */}
        <View>
          <FieldLabel>Confirm Password</FieldLabel>
          <InputRow icon={<Lock size={18} color="rgba(255,255,255,0.35)" />} isError={!!(errors.confirm || liveErrConfirm)}>
            <TextInput
              placeholder="••••••••"
              selectionColor={T.CARET}
              secureTextEntry={!showConfirm}
              value={data.confirm}
              onChangeText={(v) => { onChange({ confirm: v }); setErrors((e) => ({ ...e, confirm: '' })); }}
              style={[styles.input, { flex: 1 }]}
              placeholderTextColor="rgba(255,255,255,0.18)"
            />
            <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {showConfirm ? <EyeSlash size={20} color="rgba(255,255,255,0.35)" /> : <Eye size={20} color="rgba(255,255,255,0.35)" />}
            </TouchableOpacity>
          </InputRow>
          <FieldErr msg={errors.confirm || liveErrConfirm} />
        </View>

        <View style={styles.passwordHints}>
          {[
            { label: 'At least 8 characters', valid: data.password.length >= 8 },
            { label: 'One uppercase letter', valid: /[A-Z]/.test(data.password) },
            { label: 'One number', valid: /[0-9]/.test(data.password) },
            { label: 'One special character', valid: /[^A-Za-z0-9]/.test(data.password) },
          ].map((item) => (
            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={{ color: item.valid ? T.SUCCESS : T.TEXT_3, fontSize: 13, fontWeight: '700' }}>
                {item.valid ? '✓' : '•'}
              </Text>
              <Text style={{ color: item.valid ? T.SUCCESS : T.TEXT_3, fontSize: 12 }}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, !step2Valid && styles.primaryBtnDisabled]}
        onPress={() => { if (step2Valid) onNext(); }}
        disabled={!step2Valid}
        activeOpacity={0.85}
      >
        <LinearGradient colors={AppGradients.brand} locations={AppGradients.brandLocs} start={AppGradients.brandStart} end={AppGradients.brandEnd} style={StyleSheet.absoluteFill} />
        <Text style={styles.btnLabel}>Continue</Text>
      </TouchableOpacity>
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
        <GradientText text="Your Profile" style={styles.stepTitle} />
        <Text style={styles.stepSubtitle}>Add a photo and a short bio so others can get to know you.</Text>
      </View>

      {/* Avatar picker */}
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={pickImage} style={styles.avatarWrap} activeOpacity={0.8}>
          {data.avatarUri ? (
            <Image source={{ uri: data.avatarUri }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials || '?'}</Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            <Camera size={16} color={T.TEXT} />
          </View>
        </TouchableOpacity>
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
              selectionColor={T.CARET}
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

      <TouchableOpacity
        style={[styles.primaryBtn, loading && styles.primaryBtnLoading]}
        onPress={onNext}
        disabled={loading}
        activeOpacity={0.85}
      >
        <LinearGradient colors={AppGradients.brand} locations={AppGradients.brandLocs} start={AppGradients.brandStart} end={AppGradients.brandEnd} style={StyleSheet.absoluteFill} />
        {loading ? (
          <Spinner size="sm" color={T.ACCENT_FG} />
        ) : (
          <Text style={styles.btnLabel}>Complete</Text>
        )}
      </TouchableOpacity>
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
            paddingTop: insets.top + (Platform.OS === 'web' ? 72 : 28),
            paddingBottom: insets.bottom + 48,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity
          onPress={() => (step === 1 ? goBack() : transitionTo((step - 1) as StepNum))}
          style={styles.backBtn}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <ArrowLeft size={22} color={T.ACCENT_FG} />
        </TouchableOpacity>

        {/* Screen title */}
        <View style={styles.screenHead}>
          <GradientText text="Create Account" style={styles.screenTitle} />
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
            <TouchableOpacity onPress={() => router.push('/auth')} activeOpacity={0.7}>
              <Text style={styles.signinLink}>Log In</Text>
            </TouchableOpacity>
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
    color: T.ACCENT_FG,
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
    color: T.ACCENT_FG,
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
    backgroundColor: alpha(T.ERROR, 0.09),
  },
  input: {
    flex: 1,
    color: T.ACCENT_FG,
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    height: '100%',
    backgroundColor: 'transparent',
    // Vertically centre the caret + text inside the input row on Android.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    ...(Platform.OS === 'web'
      ? { outlineStyle: 'none' as never, outlineWidth: 0 }
      : {}),
  },
  fieldError: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: T.ERROR,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  fieldStatusOk: {
    color: T.SUCCESS,
  },
  fieldStatusInfo: {
    color: 'rgba(255,255,255,0.4)',
  },
  // Fixed-width trailing slot inside input rows — reserves the space for the
  // spinner/✓/✕ so the field never shifts horizontally between states.
  availSlot: {
    width: 20,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: T.SURFACE,
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
    backgroundColor: T.ACCENT_FG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: T.BORDER_2,
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
    color: T.ACCENT_FG,
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    textAlignVertical: 'top',
    minHeight: 92,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web'
      ? { outlineStyle: 'none' as never, outlineWidth: 0 }
      : {}),
  },
  charCount: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'right',
    marginTop: 6,
  },

  referralNotice: {
    backgroundColor: alpha(T.ACCENT, 0.12),
    borderWidth: 1,
    borderColor: alpha(T.ACCENT, 0.28),
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
    color: T.ACCENT_FG,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
  },
  referralNoticeSub: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },

  primaryBtn: {
    borderRadius: 50,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: T.ACCENT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnLoading: {
    opacity: 0.6,
  },
  primaryBtnDisabled: {
    opacity: 0.35,
  },
  serverErrorBox: {
    backgroundColor: alpha(T.ERROR, 0.1),
    borderRadius: 12,
    padding: 14,
  },
  serverError: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: T.ERROR,
    textAlign: 'center',
  },
  btnLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: T.ACCENT_FG,
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
    color: T.SECONDARY,
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
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    // The brand gradient fill paints the whole circle; drop the white ring so
    // the active step reads as a solid gradient disc with a white number.
    borderColor: 'transparent',
    backgroundColor: T.SURFACE_2,
  },
  num: {
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.25)',
  },
  numActive: { color: T.ACCENT_FG },
  label: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.25)',
  },
  labelActive: { color: T.ACCENT_FG, fontFamily: 'Poppins_500Medium' },
  connector: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
  },
  connectorActive: { backgroundColor: 'rgba(255,255,255,0.4)' },
});
