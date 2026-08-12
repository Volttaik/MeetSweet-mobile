import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Checkbox,
} from 'heroui-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { At, Eye, EyeSlash, Lock } from 'phosphor-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/services/api';
import { MsScreenBackground } from '@/components/MsScreenBackground';
import { T } from '@/constants/theme';

// ─── Input row ────────────────────────────────────────────────────────────────

const INPUT_BG = 'rgba(255,255,255,0.07)';
const INPUT_BORDER_ERROR = '#EF4444';

function InputRow({
  icon,
  children,
  isError,
  isFocused,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  isError?: boolean;
  isFocused?: boolean;
}) {
  return (
    <View style={[styles.inputWrapper, isError && styles.inputWrapperError, isFocused && styles.inputWrapperFocused]}>
      <View style={styles.inputIcon}>{icon}</View>
      {children}
    </View>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = 'Enter your email address';
    if (password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    setServerError('');
    try {
      await login({ email: email.trim().toLowerCase(), password });
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof ApiError) {
        // Backend returns 403 + code EMAIL_NOT_VERIFIED when account exists but
        // the email has never been confirmed — take the user straight to verify.
        if (err.code === 'EMAIL_NOT_VERIFIED' || err.status === 403) {
          router.push({
            pathname: '/verify-email',
            params: { email: email.trim().toLowerCase() },
          });
          return;
        }
        setServerError(err.message);
      } else {
        setServerError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <MsScreenBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + (Platform.OS === 'web' ? 72 : 32),
              paddingBottom: insets.bottom + 48,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('../assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
              tintColor="#FFFFFF"
            />
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to continue to MeetSweet</Text>
          </View>

          {/* Server error */}
          {!!serverError && (
            <View style={styles.serverError}>
              <Text style={styles.serverErrorText}>{serverError}</Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            {/* Email */}
            <View>
              <Text style={styles.fieldLabel}>Email Address</Text>
              <InputRow
                icon={<At size={20} color="rgba(255,255,255,0.35)" />}
                isError={!!errors.email}
              >
                <TextInput
                  placeholder="you@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setErrors((e) => ({ ...e, email: '' }));
                    setServerError('');
                  }}
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </InputRow>
              {!!errors.email && (
                <Text style={styles.fieldError}>{errors.email}</Text>
              )}
            </View>

            {/* Password */}
            <View>
              <Text style={styles.fieldLabel}>Password</Text>
              <InputRow
                icon={<Lock size={20} color="rgba(255,255,255,0.35)" />}
                isError={!!errors.password}
              >
                <TextInput
                  placeholder="••••••••"
                  secureTextEntry={!showPw}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setErrors((e) => ({ ...e, password: '' }));
                    setServerError('');
                  }}
                  style={[styles.input, { flex: 1 }]}
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
                <TouchableOpacity
                  onPress={() => setShowPw((v) => !v)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.eyeBtn}
                >
                  {showPw ? (
                    <EyeSlash size={20} color="rgba(255,255,255,0.4)" />
                  ) : (
                    <Eye size={20} color="rgba(255,255,255,0.4)" />
                  )}
                </TouchableOpacity>
              </InputRow>
              {!!errors.password && (
                <Text style={styles.fieldError}>{errors.password}</Text>
              )}
            </View>

            {/* Remember me + Forgot */}
            <View style={styles.loginMeta}>
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => setRememberMe((v) => !v)}
                activeOpacity={0.7}
              >
                <Checkbox isSelected={rememberMe} onSelectedChange={setRememberMe} />
                <Text style={styles.checkLabel}>Remember me</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/forgot-password')}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* Login button */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnLoading]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnLabel}>Log In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Create account link */}
          <View style={styles.createRow}>
            <Text style={styles.createText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/register')} activeOpacity={0.7}>
              <Text style={styles.createLink}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </MsScreenBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 28,
    gap: 28,
    flexGrow: 1,
  },

  header: { alignItems: 'center', gap: 12 },
  logo: { width: 52, height: 52 },
  title: {
    fontSize: 28,
    fontFamily: T.FONT.bold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
  },

  serverError: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: T.RADIUS.md,
    padding: 14,
  },
  serverErrorText: {
    color: '#EF4444',
    fontFamily: T.FONT.regular,
    fontSize: 13,
    textAlign: 'center',
  },

  form: { gap: 20 },

  fieldLabel: {
    fontFamily: T.FONT.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 18,
    height: 54,
    gap: 12,
  },
  inputWrapperFocused: {
    backgroundColor: 'rgba(255,255,255,0.085)',
  },
  inputWrapperError: {
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  inputIcon: { width: 22, alignItems: 'center' },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: T.FONT.regular,
    height: '100%',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web'
      ? { outlineStyle: 'none' as never, outlineWidth: 0 }
      : {}),
  },
  eyeBtn: { padding: 4 },
  fieldError: {
    fontFamily: T.FONT.regular,
    fontSize: 12,
    color: '#EF4444',
    marginTop: 5,
  },

  loginMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkLabel: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: 'rgba(255,255,255,0.48)',
  },
  forgotText: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: 'rgba(255,255,255,0.7)',
  },

  submitBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: T.RADIUS.pill,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 4,
  },
  submitBtnLoading: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  submitBtnLabel: {
    fontFamily: T.FONT.semibold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  createRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  createText: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: 'rgba(255,255,255,0.38)',
  },
  createLink: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: 'rgba(255,255,255,0.85)',
  },
});
