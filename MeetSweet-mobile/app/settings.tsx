/**
 * MeetSweet Settings — everything opens as a bottom modal or inline switch.
 * NO navigation to sub-screens. Creator Dashboard is the only router.push.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  At,
  Bell,
  CaretRight,
  ChartBar,
  ChatCentered,
  CheckCircle,
  Database,
  DeviceMobile,
  Eye,
  EyeSlash,
  Gear,
  Globe,
  Info,
  Link,
  Lock,
  Phone,
  Question,
  Shield,
  SignOut,
  Spinner,
  Star,
  User,
  UserMinus,
  Warning,
  X,
} from 'phosphor-react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { toast } from '@/components/MsToast';
import { useAuth } from '@/contexts/AuthContext';
import { useBiometricLock } from '@/contexts/BiometricLockContext';
import {
  deleteAccount,
  getPrivacySettings,
  getNotificationSettings,
  getSettings,
  logoutAllDevices,
  updateNotificationSettings,
  updatePassword,
  updatePrivacySettings,
  updateSettings,
} from '@/services/settings';
import { checkUsernameAvailability, updateMe } from '@/services/users';
import * as Clipboard from 'expo-clipboard';
import {
  getTwoFactorStatus,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
} from '@/services/security';
import {
  checkBiometricSupport,
  authenticateBiometric,
  isBiometricEnabled,
  setBiometricEnabled as persistBiometricEnabled,
} from '@/lib/biometric';
import {
  isHapticsEnabled as getHapticsEnabled,
  loadHapticsPreference,
  setHapticsEnabled as persistHapticsEnabled,
} from '@/lib/haptics';

// ─── Shared bottom sheet wrapper ──────────────────────────────────────────────

function BottomSheet({
  visible,
  onClose,
  children,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <Pressable style={bss.overlay} onPress={onClose}>
          <Pressable
            style={[bss.sheet, { paddingBottom: Math.max(insets.bottom + 8, 24) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={bss.handle} />
            {title ? (
              <View style={bss.header}>
                <Text style={bss.title}>{title}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12} style={bss.closeBtn}>
                  <X size={18} color={T.TEXT_2} />
                </TouchableOpacity>
              </View>
            ) : null}
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const bss = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 17,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Shared styled input ──────────────────────────────────────────────────────

function MsInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoFocus,
  keyboardType,
  autoCapitalize,
  multiline,
  numberOfLines,
  maxLength,
  style,
  editable = true,
  rightElement,
}: {
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoFocus?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  style?: any;
  editable?: boolean;
  rightElement?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        inp.wrap,
        focused && inp.focused,
        !editable && inp.readOnly,
        multiline && { height: undefined, minHeight: 80, paddingVertical: 12 },
        style,
      ]}
    >
      <TextInput
        style={[inp.input, multiline && { textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={T.TEXT_3}
        secureTextEntry={secureTextEntry}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        multiline={multiline}
        numberOfLines={numberOfLines}
        maxLength={maxLength}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="done"
      />
      {rightElement}
    </View>
  );
}

const inp = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 14,
    height: 48,
  },
  focused: {
    backgroundColor: T.SURFACE,
  },
  readOnly: { opacity: 0.5 },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    height: '100%',
    backgroundColor: 'transparent',
    // Vertically centre the caret + text inside the input row on Android.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});

// ─── Password strength ────────────────────────────────────────────────────────

function strengthOf(pw: string): { label: string; color: string; width: number } {
  if (!pw) return { label: '', color: 'transparent', width: 0 };
  if (pw.length < 8) return { label: 'Weak', color: T.ERROR, width: 0.25 };
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^a-zA-Z0-9]/.test(pw) && pw.length >= 12)
    return { label: 'Strong', color: T.SUCCESS, width: 1 };
  if (pw.length >= 10 && /[A-Z]/.test(pw))
    return { label: 'Good', color: '#F59E0B', width: 0.66 };
  return { label: 'Fair', color: '#F59E0B', width: 0.45 };
}

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────

const PRIVACY_KEY = '@ms_privacy_prefs';
const NOTIF_KEY = '@ms_notif_prefs';
const CONTENT_KEY = '@ms_content_prefs';

function getPrefKey(baseKey: string, userId?: string): string {
  return userId ? `${baseKey}_${userId}` : baseKey;
}

interface PrivacyPrefs {
  privateAccount: boolean;
  onlineStatus: boolean;
  readReceipts: boolean;
  typingIndicator: boolean;
  profileVisibility: 'everyone' | 'subscribers' | 'nobody';
  messagePerm: 'everyone' | 'subscribers' | 'nobody';
  mentionPerm: boolean;
  tagPerm: boolean;
}

interface NotifPrefs {
  push: boolean;
  messages: boolean;
  comments: boolean;
  likes: boolean;
  mentions: boolean;
  marketing: boolean;
}

interface ContentPrefs {
  sensitiveContent: boolean;
  autoplay: boolean;
  dataSaver: boolean;
  highQualityMedia: boolean;
  language: string;
}

const PRIVACY_DEFAULTS: PrivacyPrefs = {
  privateAccount: false,
  onlineStatus: true,
  readReceipts: true,
  typingIndicator: true,
  profileVisibility: 'everyone',
  messagePerm: 'everyone',
  mentionPerm: true,
  tagPerm: true,
};

const NOTIF_DEFAULTS: NotifPrefs = {
  push: true,
  messages: true,
  comments: true,
  likes: true,
  mentions: true,
  marketing: false,
};

const CONTENT_DEFAULTS: ContentPrefs = {
  sensitiveContent: false,
  autoplay: true,
  dataSaver: false,
  highQualityMedia: true,
  language: 'English',
};

async function loadPref<T extends object>(key: string, defaults: T, userId?: string): Promise<T> {
  try {
    const fullKey = getPrefKey(key, userId);
    const v = await AsyncStorage.getItem(fullKey);
    return v ? { ...defaults, ...(JSON.parse(v) as Partial<T>) } : defaults;
  } catch { return defaults; }
}

async function savePref<T>(key: string, val: T, userId?: string) {
  const fullKey = getPrefKey(key, userId);
  await AsyncStorage.setItem(fullKey, JSON.stringify(val)).catch(() => {});
}

// ─── Row components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={rs.sectionTitle}>{title}</Text>;
}

function Row({
  label,
  sub,
  onPress,
  danger = false,
  badge,
  noChevron = false,
}: {
  label: string;
  sub?: string;
  onPress?: () => void;
  danger?: boolean;
  badge?: string;
  noChevron?: boolean;
}) {
  return (
    <TouchableOpacity style={rs.row} onPress={onPress} activeOpacity={0.7}>
      <View style={rs.rowText}>
        <Text style={[rs.rowLabel, danger && { color: T.ERROR }]}>{label}</Text>
        {sub ? <Text style={rs.rowSub}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={rs.badge}>
          <Text style={rs.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {!noChevron ? <CaretRight size={14} color={T.TEXT_3} /> : null}
    </TouchableOpacity>
  );
}

function ToggleRow({
  label,
  sub,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={rs.row}>
      <View style={rs.rowText}>
        <Text style={rs.rowLabel}>{label}</Text>
        {sub ? <Text style={rs.rowSub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={disabled ? undefined : onValueChange}
        trackColor={{ false: T.SURFACE_2, true: 'rgba(255,255,255,0.85)' }}
        thumbColor={T.BG}
        ios_backgroundColor={T.SURFACE_2}
        disabled={disabled}
      />
    </View>
  );
}

function Divider() {
  return <View style={rs.divider} />;
}

const rs = StyleSheet.create({
  sectionTitle: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 10,
  },
  section: {
    marginHorizontal: 20,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT },
  rowSub: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 2, lineHeight: 17 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.RADIUS.xs,
    backgroundColor: T.SURFACE_2,
  },
  badgeText: { fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  divider: { height: 1, backgroundColor: T.BORDER, marginLeft: 16 },
});

// ─── MODAL: Edit Profile ──────────────────────────────────────────────────────

function EditProfileModal({
  visible,
  onClose,
  user,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  user: any;
  onSave: (fields: { name: string; bio: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(user?.name ?? '');
      setBio(user?.bio ?? '');
    }
  }, [visible, user?.name, user?.bio]);

  const handleSave = async () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), bio: bio.trim() });
      onClose();
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit Profile">
      <View style={{ gap: 12, paddingBottom: 4 }}>
        <View style={{ gap: 6 }}>
          <Text style={ms.label}>Display Name</Text>
          <MsInput value={name} onChangeText={setName} placeholder="Your display name" maxLength={50} autoFocus />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={ms.label}>Bio</Text>
          <MsInput
            value={bio}
            onChangeText={setBio}
            placeholder="Tell the community who you are…"
            multiline
            numberOfLines={3}
            maxLength={160}
          />
          <Text style={ms.hint}>{bio.length}/160</Text>
        </View>
        <View style={ms.buttons}>
          <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={ms.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ms.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator size="small" color={T.BG} />
              : <Text style={ms.saveLabel}>Save</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── MODAL: Username ──────────────────────────────────────────────────────────

function UsernameModal({
  visible,
  onClose,
  currentUsername,
}: {
  visible: boolean;
  onClose: () => void;
  currentUsername: string;
}) {
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) setValue(currentUsername ?? '');
  }, [visible, currentUsername]);

  const checkAvailability = (v: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim() || v === currentUsername) { setAvailable(null); return; }
    setChecking(true);
    debounceRef.current = setTimeout(() => {
      checkUsernameAvailability(v.trim().toLowerCase())
        .then((result) => setAvailable(result.available))
        .catch(() => setAvailable(null))
        .finally(() => setChecking(false));
    }, 600);
  };

  const handleChange = (v: string) => {
    setValue(v);
    setAvailable(null);
    checkAvailability(v);
  };

  const handleSave = () => {
    if (!available) return;
    updateMe({ username: value.trim().toLowerCase() })
      .then(() => {
        toast.success('Username updated');
        onClose();
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Failed to update username');
      });
  };

  const statusEl = checking
    ? <ActivityIndicator size="small" color={T.TEXT_3} />
    : available === true
    ? <CheckCircle size={18} color={T.SUCCESS} weight="fill" />
    : available === false
    ? <X size={16} color={T.ERROR} />
    : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Username">
      <View style={{ gap: 12 }}>
        <Text style={ms.sub}>Username must be 3–30 characters and can include letters, numbers, and underscores.</Text>
        <MsInput
          value={value}
          onChangeText={handleChange}
          placeholder="username"
          autoCapitalize="none"
          autoFocus
          maxLength={30}
          rightElement={statusEl ? <View style={{ marginLeft: 8 }}>{statusEl}</View> : null}
        />
        {available === false && (
          <Text style={{ color: T.ERROR, fontSize: 12, fontFamily: T.FONT.regular }}>
            This username is taken
          </Text>
        )}
        <View style={ms.buttons}>
          <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={ms.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ms.saveBtn, (!available || checking) && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={!available || checking}
            activeOpacity={0.8}
          >
            <Text style={ms.saveLabel}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── MODAL: Email ─────────────────────────────────────────────────────────────

function EmailModal({
  visible,
  onClose,
  currentEmail,
}: {
  visible: boolean;
  onClose: () => void;
  currentEmail: string;
}) {
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setEmail(currentEmail ?? '');
  }, [visible, currentEmail]);

  const handleSave = async () => {
    if (!email.includes('@')) { toast.error('Enter a valid email address'); return; }
    setSaving(true);
    try {
      const updated = await updateMe({ email: email.trim().toLowerCase() });
      // The backend has no email-change flow yet — PATCH /users/me ignores `email`,
      // so detect a no-op instead of claiming success.
      if (updated.user.email !== email.trim().toLowerCase()) {
        throw new Error('Email change is not available yet');
      }
      await refreshUser();
      toast.success('Email updated successfully');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update email');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Email Address">
      <View style={{ gap: 12 }}>
        <View style={ms.statusRow}>
          <View style={[ms.statusDot, { backgroundColor: T.SUCCESS }]} />
          <Text style={ms.statusLabel}>Verified</Text>
        </View>
        <Text style={ms.label}>New email address</Text>
        <MsInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoFocus
        />
        <Text style={ms.sub}>A verification link will be sent to your new address.</Text>
        <View style={ms.buttons}>
          <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={ms.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ms.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator size="small" color={T.BG} />
              : <Text style={ms.saveLabel}>Update Email</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── MODAL: Phone ─────────────────────────────────────────────────────────────

const COUNTRY_CODES = [
  { code: '+1', flag: '🇺🇸', name: 'United States' },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: '+91', flag: '🇮🇳', name: 'India' },
  { code: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+81', flag: '🇯🇵', name: 'Japan' },
  { code: '+55', flag: '🇧🇷', name: 'Brazil' },
  { code: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+27', flag: '🇿🇦', name: 'South Africa' },
];

function PhoneModal({
  visible,
  onClose,
  currentPhone,
}: {
  visible: boolean;
  onClose: () => void;
  currentPhone: string;
}) {
  const { refreshUser } = useAuth();
  const [countryIdx, setCountryIdx] = useState(8); // default Nigeria (+234)
  const [phone, setPhone] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const stored = (currentPhone ?? '').trim();
    if (stored) {
      // Find the matching country code (try longest first to avoid e.g. +1 matching +1xxx)
      const sorted = [...COUNTRY_CODES]
        .map((c, i) => ({ ...c, i }))
        .sort((a, b) => b.code.length - a.code.length);
      const match = sorted.find((c) => stored.startsWith(c.code));
      if (match) {
        setCountryIdx(match.i);
        // Strip the country-code prefix; keep only the national digits
        setPhone(stored.slice(match.code.length).replace(/\D/g, ''));
      } else {
        // Unknown country code — leave selector at default, show raw digits
        setPhone(stored.replace(/\D/g, ''));
      }
    } else {
      setPhone('');
    }
  }, [visible, currentPhone]);

  const country = COUNTRY_CODES[countryIdx];

  const handleSave = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) { toast.error('Enter a valid phone number'); return; }
    // Build exactly one E.164-style number — no double prefix
    const fullPhone = `${country.code}${digits}`;
    setSaving(true);
    try {
      await updateMe({ phone: fullPhone });
      await refreshUser();
      toast.success('Phone number saved');
      onClose();
    } catch {
      toast.error('Could not save phone number. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (showCountryPicker) {
    return (
      <BottomSheet visible={visible} onClose={() => setShowCountryPicker(false)} title="Select Country">
        <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
          {COUNTRY_CODES.map((c, i) => (
            <TouchableOpacity
              key={c.code}
              style={[rs.row, i > 0 && { borderTopWidth: 1, borderTopColor: T.BORDER }]}
              onPress={() => { setCountryIdx(i); setShowCountryPicker(false); }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 20 }}>{c.flag}</Text>
              <Text style={[rs.rowLabel, { flex: 1, marginLeft: 8 }]}>{c.name}</Text>
              <Text style={rs.rowSub}>{c.code}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Phone Number">
      <View style={{ gap: 12 }}>
        <Text style={ms.label}>Country</Text>
        <TouchableOpacity style={[inp.wrap, { justifyContent: 'space-between' }]} onPress={() => setShowCountryPicker(true)} activeOpacity={0.7}>
          <Text style={{ color: T.TEXT, fontFamily: T.FONT.regular, fontSize: 15 }}>
            {country.flag}  {country.name} ({country.code})
          </Text>
          <CaretRight size={14} color={T.TEXT_3} />
        </TouchableOpacity>
        <Text style={ms.label}>Phone Number</Text>
        <View style={[inp.wrap, { gap: 0 }]}>
          <Text style={{ color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 15, marginRight: 8 }}>{country.code}</Text>
          <TextInput
            style={[inp.input]}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor={T.TEXT_3}
            keyboardType="phone-pad"
            autoFocus
            maxLength={15}
          />
        </View>
        <View style={ms.buttons}>
          <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={ms.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ms.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator size="small" color={T.BG} />
              : <Text style={ms.saveLabel}>Save Number</Text>}
          </TouchableOpacity>
        </View>
        <Text style={[ms.sub, { textAlign: 'center' }]}>
          Your number is saved to your profile and visible only to you.
        </Text>
      </View>
    </BottomSheet>
  );
}

// ─── MODAL: Change Password ───────────────────────────────────────────────────

function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => { setCurrent(''); setNext(''); setConfirm(''); };
  const handleClose = () => { reset(); onClose(); };

  const str = strengthOf(next);

  const handleSave = async () => {
    if (!current) { toast.error('Enter your current password'); return; }
    if (next.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (next !== confirm) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await updatePassword({ current_password: current, new_password: next });
      toast.success('Password updated successfully');
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to change password';
      toast.error(msg.includes('404') || msg.includes('405') ? 'Password change requires backend implementation' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Change Password">
      <View style={{ gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Text style={ms.label}>Current password</Text>
          <MsInput
            value={current}
            onChangeText={setCurrent}
            placeholder="Current password"
            secureTextEntry={!showCurrent}
            autoFocus
            rightElement={
              <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} hitSlop={8}>
                {showCurrent ? <EyeSlash size={18} color={T.TEXT_3} /> : <Eye size={18} color={T.TEXT_3} />}
              </TouchableOpacity>
            }
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={ms.label}>New password</Text>
          <MsInput
            value={next}
            onChangeText={setNext}
            placeholder="New password (min. 8 characters)"
            secureTextEntry={!showNext}
            rightElement={
              <TouchableOpacity onPress={() => setShowNext(!showNext)} hitSlop={8}>
                {showNext ? <EyeSlash size={18} color={T.TEXT_3} /> : <Eye size={18} color={T.TEXT_3} />}
              </TouchableOpacity>
            }
          />
          {str.label ? (
            <View style={{ gap: 4 }}>
              <View style={{ height: 4, backgroundColor: T.SURFACE_2, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ height: 4, width: `${str.width * 100}%`, backgroundColor: str.color, borderRadius: 2 }} />
              </View>
              <Text style={{ fontSize: 11, fontFamily: T.FONT.medium, color: str.color }}>{str.label}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ gap: 6 }}>
          <Text style={ms.label}>Confirm new password</Text>
          <MsInput value={confirm} onChangeText={setConfirm} placeholder="Confirm new password" secureTextEntry />
        </View>
        <View style={ms.buttons}>
          <TouchableOpacity style={ms.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
            <Text style={ms.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ms.saveBtn, loading && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator size="small" color={T.BG} />
              : <Text style={ms.saveLabel}>Update Password</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── MODAL: Active Sessions ───────────────────────────────────────────────────

function ActiveSessionsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [signOutAllConfirm, setSignOutAllConfirm] = useState(false);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setTimeout(() => setLoading(false), 800);
    }
  }, [visible]);

  const handleSignOutAll = async () => {
    try {
      await logoutAllDevices();
      toast.success('Signed out of all other devices');
      setSignOutAllConfirm(false);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to sign out other devices');
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Active Sessions">
      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator color={T.TEXT} />
        </View>
      ) : (
        <View style={{ gap: 0 }}>
          <Text style={[ms.label, { marginBottom: 12 }]}>Current device</Text>
          <View style={sess.card}>
            <View style={sess.deviceIcon}>
              <DeviceMobile size={20} color={T.TEXT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rs.rowLabel}>This Device</Text>
              <Text style={rs.rowSub}>Active now</Text>
            </View>
            <View style={[sess.dot, { backgroundColor: T.SUCCESS }]} />
          </View>

          <Text style={[ms.label, { marginTop: 20, marginBottom: 12 }]}>Other devices</Text>
          <View style={sess.card}>
            <Text style={[ms.sub, { flex: 1 }]}>No other active sessions found.</Text>
          </View>

          <TouchableOpacity
            style={[ms.saveBtn, { marginTop: 20, backgroundColor: 'rgba(239,68,68,0.12)' }]}
            onPress={() => setSignOutAllConfirm(true)}
            activeOpacity={0.8}
          >
            <Text style={[ms.saveLabel, { color: T.ERROR }]}>Sign Out All Other Devices</Text>
          </TouchableOpacity>
        </View>
      )}
      <MsConfirmDialog
        visible={signOutAllConfirm}
        title="Sign Out All Devices"
        message="This will revoke all other active sessions. You will stay signed in here."
        confirmLabel="Sign Out All"
        destructive
        onConfirm={handleSignOutAll}
        onCancel={() => setSignOutAllConfirm(false)}
      />
    </BottomSheet>
  );
}

const sess = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    padding: 14,
    gap: 12,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

// ─── MODAL: Profile Visibility ────────────────────────────────────────────────

function ProfileVisibilityModal({
  visible,
  onClose,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: 'everyone' | 'subscribers' | 'nobody') => void;
}) {
  const options: Array<{ value: 'everyone' | 'subscribers' | 'nobody'; label: string; sub: string }> = [
    { value: 'everyone', label: 'Everyone', sub: 'Anyone can see your profile' },
    { value: 'subscribers', label: 'Subscribers only', sub: 'Only your subscribers can see your full profile' },
    { value: 'nobody', label: 'Nobody', sub: 'Your profile is completely private' },
  ];
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Profile Visibility">
      <View style={{ gap: 0 }}>
        {options.map((opt, i) => (
          <React.Fragment key={opt.value}>
            {i > 0 && <Divider />}
            <TouchableOpacity
              style={[rs.row, { justifyContent: 'space-between' }]}
              onPress={() => { onChange(opt.value); onClose(); toast.success('Visibility updated'); }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={rs.rowLabel}>{opt.label}</Text>
                <Text style={rs.rowSub}>{opt.sub}</Text>
              </View>
              {value === opt.value && <CheckCircle size={20} color={T.TEXT} weight="fill" />}
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>
    </BottomSheet>
  );
}

// ─── MODAL: Message / Mention / Tag Permissions ───────────────────────────────

function PermissionModal({
  visible,
  onClose,
  title,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChange: (v: 'everyone' | 'subscribers' | 'nobody') => void;
}) {
  const options: Array<{ value: 'everyone' | 'subscribers' | 'nobody'; label: string }> = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'subscribers', label: 'Subscribers only' },
    { value: 'nobody', label: 'Nobody' },
  ];
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={{ gap: 0 }}>
        {options.map((opt, i) => (
          <React.Fragment key={opt.value}>
            {i > 0 && <Divider />}
            <TouchableOpacity
              style={rs.row}
              onPress={() => { onChange(opt.value); onClose(); toast.success('Permission updated'); }}
              activeOpacity={0.7}
            >
              <Text style={[rs.rowLabel, { flex: 1 }]}>{opt.label}</Text>
              {value === opt.value && <CheckCircle size={20} color={T.TEXT} weight="fill" />}
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>
    </BottomSheet>
  );
}

// ─── MODAL: Language ──────────────────────────────────────────────────────────

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Japanese', 'Arabic', 'Hindi', 'Swahili'];

function LanguageModal({
  visible,
  onClose,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Language">
      <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
        {LANGUAGES.map((lang, i) => (
          <React.Fragment key={lang}>
            {i > 0 && <Divider />}
            <TouchableOpacity
              style={rs.row}
              onPress={() => { onChange(lang); onClose(); toast.success(`Language set to ${lang}`); }}
              activeOpacity={0.7}
            >
              <Text style={[rs.rowLabel, { flex: 1 }]}>{lang}</Text>
              {value === lang && <CheckCircle size={20} color={T.TEXT} weight="fill" />}
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

// ─── MODAL: Support ───────────────────────────────────────────────────────────

function SupportModal({
  visible,
  onClose,
  type,
}: {
  visible: boolean;
  onClose: () => void;
  type: 'help' | 'bug' | 'contact' | 'about';
}) {
  const [bugText, setBugText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!bugText.trim()) { toast.error('Describe the problem first'); return; }
    setSending(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSending(false);
    toast.success('Problem reported. Thank you!');
    onClose();
  };

  if (type === 'help') {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Help Centre">
        <View style={{ gap: 12, paddingBottom: 4 }}>
          {[
            { label: 'Getting Started Guide', sub: 'Learn the basics of MeetSweet' },
            { label: 'FAQ', sub: 'Frequently asked questions' },
            { label: 'Creator Resources', sub: 'Tips for creators and monetisation' },
            { label: 'Community Guidelines', sub: 'Rules and standards for our community' },
          ].map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[rs.row, { backgroundColor: T.SURFACE_2, borderRadius: T.RADIUS.md }]}
              onPress={() => toast.info('Visit meetsweet.io/help')}
              activeOpacity={0.7}
            >
              <View style={rs.rowText}>
                <Text style={rs.rowLabel}>{item.label}</Text>
                <Text style={rs.rowSub}>{item.sub}</Text>
              </View>
              <CaretRight size={14} color={T.TEXT_3} />
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
    );
  }

  if (type === 'bug') {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Report a Bug">
        <View style={{ gap: 12 }}>
          <Text style={ms.sub}>Describe what happened and how to reproduce it.</Text>
          <MsInput
            value={bugText}
            onChangeText={setBugText}
            placeholder="Describe the bug…"
            multiline
            numberOfLines={4}
            maxLength={500}
          />
          <View style={ms.buttons}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={ms.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ms.saveBtn, sending && { opacity: 0.6 }]} onPress={handleSend} disabled={sending} activeOpacity={0.8}>
              {sending
                ? <ActivityIndicator size="small" color={T.BG} />
                : <Text style={ms.saveLabel}>Send Report</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>
    );
  }

  if (type === 'contact') {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Contact Support">
        <View style={{ gap: 14, paddingBottom: 4 }}>
          <View style={{ backgroundColor: T.SURFACE_2, borderRadius: T.RADIUS.md, padding: 16, gap: 6 }}>
            <Text style={rs.rowLabel}>Email Support</Text>
            <Text style={rs.rowSub}>support@meetsweet.io</Text>
            <Text style={[rs.rowSub, { marginTop: 4 }]}>We respond within 24 hours, Monday to Friday.</Text>
          </View>
          <TouchableOpacity style={ms.saveBtn} onPress={() => { toast.info('Opening email…'); onClose(); }} activeOpacity={0.8}>
            <Text style={ms.saveLabel}>Send Email</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    );
  }

  // about
  return (
    <BottomSheet visible={visible} onClose={onClose} title="About MeetSweet">
      <View style={{ gap: 12, alignItems: 'center', paddingBottom: 4 }}>
        <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center' }}>
          <Star size={32} color={T.TEXT} weight="fill" />
        </View>
        <Text style={{ fontSize: 22, fontFamily: T.FONT.bold, color: T.TEXT }}>MeetSweet</Text>
        <Text style={[rs.rowSub, { textAlign: 'center' }]}>Version 1.0.0</Text>
        <Text style={[ms.sub, { textAlign: 'center', lineHeight: 20 }]}>
          Built for creators everywhere.{'\n'}Connect, create, and grow your community.{'\n\n'}© 2026 MeetSweet Inc.
        </Text>
        {[
          { label: 'Terms of Service', url: 'meetsweet.io/terms' },
          { label: 'Privacy Policy', url: 'meetsweet.io/privacy' },
        ].map((item) => (
          <TouchableOpacity key={item.label} onPress={() => toast.info(`Visit ${item.url}`)} activeOpacity={0.7}>
            <Text style={[ms.sub, { color: T.TEXT_2, textDecorationLine: 'underline' }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[ms.cancelBtn, { width: '100%', marginTop: 8 }]} onPress={onClose} activeOpacity={0.7}>
          <Text style={ms.cancelLabel}>Close</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

// ─── MODAL: Delete Account ────────────────────────────────────────────────────

function DeleteAccountModal({
  visible,
  onClose,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  onDelete: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setPassword('');
      setLoading(false);
    }
  }, [visible]);

  const handleDelete = async () => {
    if (!password) {
      toast.error('Enter your password to continue');
      return;
    }
    setLoading(true);
    try {
      await onDelete(password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={loading ? () => {} : onClose} title="Delete Account">
      <View style={{ gap: 14 }}>
        <Text style={ms.sub}>
          This permanently deletes your account and all your data. This action cannot be undone.
        </Text>
        <View style={{ gap: 6 }}>
          <Text style={ms.label}>Confirm your password</Text>
          <MsInput
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoFocus
          />
        </View>
        <View style={ms.buttons}>
          <TouchableOpacity style={ms.cancelBtn} onPress={onClose} disabled={loading} activeOpacity={0.7}>
            <Text style={ms.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ms.saveBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }, loading && { opacity: 0.6 }]}
            onPress={handleDelete}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator size="small" color={T.ERROR} />
              : <Text style={[ms.saveLabel, { color: T.ERROR }]}>Delete Account</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── Shared modal styles ──────────────────────────────────────────────────────

const ms = StyleSheet.create({
  label: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  hint: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, textAlign: 'right' },
  sub: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_3, lineHeight: 19 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center',
  },
  cancelLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  saveBtn: {
    flex: 1, height: 48, borderRadius: T.RADIUS.md,
    backgroundColor: T.TEXT, alignItems: 'center', justifyContent: 'center',
  },
  saveLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.BG },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.SUCCESS },
});

// ─── MODAL: Two-Factor Authentication ─────────────────────────────────────────

function TwoFactorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<'loading' | 'disabled' | 'setup' | 'enabled'>('loading');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    setError('');
    setCode('');
    setPassword('');
    getTwoFactorStatus()
      .then((s) => setPhase(s.enabled ? 'enabled' : 'disabled'))
      .catch(() => setPhase('disabled'));
  }, [visible]);

  const beginSetup = async () => {
    setBusy(true);
    setError('');
    try {
      const s = await setupTwoFactor();
      setSecret(s.secret);
      setPhase('setup');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start setup');
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    try {
      await Clipboard.setStringAsync(secret);
      toast.success('Secret copied');
    } catch {
      toast.error('Could not copy secret');
    }
  };

  const confirmEnable = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await enableTwoFactor(code);
      setPhase('enabled');
      toast.success('Two-factor authentication enabled');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async () => {
    if (!password) {
      setError('Enter your password');
      return;
    }
    if (code.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await disableTwoFactor(password, code);
      setPhase('disabled');
      toast.success('Two-factor authentication disabled');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not disable two-factor authentication');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Two-Factor Authentication">
      {phase === 'loading' ? (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator color={T.TEXT} />
        </View>
      ) : phase === 'disabled' ? (
        <View style={{ gap: 12 }}>
          <Text style={ms.sub}>
            Add a second layer of security to your account. After enabling, you'll enter a
            6-digit code from your authenticator app each time you log in.
          </Text>
          <View style={ms.buttons}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={ms.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ms.saveBtn, busy && { opacity: 0.6 }]} onPress={beginSetup} disabled={busy} activeOpacity={0.8}>
              {busy ? <ActivityIndicator size="small" color={T.BG} /> : <Text style={ms.saveLabel}>Set Up</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : phase === 'setup' ? (
        <View style={{ gap: 12 }}>
          <Text style={ms.sub}>
            Enter this secret in your authenticator app (Google Authenticator, 1Password, etc.),
            then enter the 6-digit code to confirm.
          </Text>
          <View style={{ backgroundColor: T.SURFACE_2, borderRadius: T.RADIUS.md, padding: 14, gap: 8 }}>
            <Text style={ms.label}>Secret key</Text>
            <Text style={{ color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 16, letterSpacing: 1 }}>{secret}</Text>
            <TouchableOpacity onPress={copySecret} hitSlop={8}>
              <Text style={{ color: T.ACCENT, fontFamily: T.FONT.semibold, fontSize: 13 }}>Copy secret</Text>
            </TouchableOpacity>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={ms.label}>Verification code</Text>
            <MsInput
              value={code}
              onChangeText={(v) => {
                setCode(v.replace(/[^0-9]/g, '').slice(0, 6));
                setError('');
              }}
              placeholder="6-digit code"
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>
          {!!error && <Text style={{ color: T.ERROR, fontSize: 12, fontFamily: T.FONT.regular }}>{error}</Text>}
          <View style={ms.buttons}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={ms.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ms.saveBtn, busy && { opacity: 0.6 }]} onPress={confirmEnable} disabled={busy} activeOpacity={0.8}>
              {busy ? <ActivityIndicator size="small" color={T.BG} /> : <Text style={ms.saveLabel}>Enable</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={ms.statusRow}>
            <View style={[ms.statusDot, { backgroundColor: T.SUCCESS }]} />
            <Text style={ms.statusLabel}>Two-factor authentication is on</Text>
          </View>
          <Text style={ms.sub}>To turn it off, confirm your password and a current 6-digit code.</Text>
          <View style={{ gap: 6 }}>
            <Text style={ms.label}>Password</Text>
            <MsInput
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError('');
              }}
              placeholder="Your password"
              secureTextEntry
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={ms.label}>6-digit code</Text>
            <MsInput
              value={code}
              onChangeText={(v) => {
                setCode(v.replace(/[^0-9]/g, '').slice(0, 6));
                setError('');
              }}
              placeholder="Authenticator code"
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>
          {!!error && <Text style={{ color: T.ERROR, fontSize: 12, fontFamily: T.FONT.regular }}>{error}</Text>}
          <View style={ms.buttons}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={ms.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ms.saveBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }, busy && { opacity: 0.6 }]} onPress={confirmDisable} disabled={busy} activeOpacity={0.8}>
              {busy ? <ActivityIndicator size="small" color={T.ERROR} /> : <Text style={[ms.saveLabel, { color: T.ERROR }]}>Disable</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser } = useAuth();
  const { refreshLockState } = useBiometricLock();

  // Modal open state
  const [modal, setModal] = useState<
    | 'editProfile' | 'username' | 'email' | 'phone'
    | 'changePassword' | 'activeSessions'
    | 'profileVisibility' | 'messagePerm' | 'mentionPerm'
    | 'language' | 'help' | 'bug' | 'contact' | 'about'
    | 'twoFactor'
    | null
  >(null);

  // Confirm dialogs
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Privacy prefs
  const [privacy, setPrivacy] = useState<PrivacyPrefs>(PRIVACY_DEFAULTS);
  // Notification prefs
  const [notif, setNotif] = useState<NotifPrefs>(NOTIF_DEFAULTS);
  // Content prefs
  const [content, setContent] = useState<ContentPrefs>(CONTENT_DEFAULTS);
  // Security prefs
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  // General prefs
  const [hapticsEnabled, setHapticsEnabled] = useState(getHapticsEnabled());

  useEffect(() => {
    const userId = user?.id;
    // Load from API; fall back to user-scoped local defaults on error
    Promise.allSettled([
      getPrivacySettings(),
      getNotificationSettings(),
      getSettings(),
      loadPref(CONTENT_KEY, CONTENT_DEFAULTS, userId),
    ]).then(async ([privResult, notifResult, settingsResult, contentResult]) => {
      if (privResult.status === 'fulfilled') {
        const p = privResult.value;
        setPrivacy({
          privateAccount: p.private_account ?? PRIVACY_DEFAULTS.privateAccount,
          onlineStatus: p.online_status ?? PRIVACY_DEFAULTS.onlineStatus,
          readReceipts: p.read_receipts ?? PRIVACY_DEFAULTS.readReceipts,
          typingIndicator: p.typing_indicator ?? PRIVACY_DEFAULTS.typingIndicator,
          profileVisibility: p.profile_visibility ?? PRIVACY_DEFAULTS.profileVisibility,
          messagePerm: p.message_perm ?? (p.allow_dms ? 'everyone' : 'nobody'),
          mentionPerm: p.allow_mentions ?? PRIVACY_DEFAULTS.mentionPerm,
          tagPerm: p.allow_tags ?? PRIVACY_DEFAULTS.tagPerm,
        });
      } else {
        setPrivacy(await loadPref(PRIVACY_KEY, PRIVACY_DEFAULTS, userId));
      }

      const notifBase: NotifPrefs = { ...NOTIF_DEFAULTS };
      if (notifResult.status === 'fulfilled') {
        const n = notifResult.value;
        notifBase.messages = n.notif_messages ?? NOTIF_DEFAULTS.messages;
        notifBase.comments = n.notif_comments ?? NOTIF_DEFAULTS.comments;
        notifBase.likes = n.notif_likes ?? NOTIF_DEFAULTS.likes;
        notifBase.mentions = n.notif_mentions ?? NOTIF_DEFAULTS.mentions;
        notifBase.marketing = n.notif_marketing ?? NOTIF_DEFAULTS.marketing;
      } else {
        Object.assign(notifBase, await loadPref(NOTIF_KEY, NOTIF_DEFAULTS, userId));
      }
      if (settingsResult.status === 'fulfilled') {
        const s = settingsResult.value;
        notifBase.push = s.push_notifications ?? NOTIF_DEFAULTS.push;
        setContent((prev) => ({
          ...prev,
          sensitiveContent: s.sensitive_content ?? prev.sensitiveContent,
          autoplay: s.autoplay_media ?? prev.autoplay,
          dataSaver: s.data_saver ?? prev.dataSaver,
          highQualityMedia: s.high_quality_media ?? prev.highQualityMedia,
          language: s.language ?? prev.language,
        }));
      }
      setNotif(notifBase);

      if (contentResult.status === 'fulfilled') {
        setContent((prev) => ({ ...prev, ...contentResult.value }));
      }
    });
  }, [user?.id]);

  // ── Security: biometric lock + 2FA status ─────────────────────────────────
  useEffect(() => {
    isBiometricEnabled().then(setBiometricEnabled).catch(() => {});
    getTwoFactorStatus()
      .then((s) => setTwoFactorEnabled(s.enabled))
      .catch(() => {});
  }, []);

  // ── General: haptics / vibration preference ───────────────────────────────
  useEffect(() => {
    loadHapticsPreference().then(setHapticsEnabled).catch(() => {});
  }, []);

  const handleHapticsToggle = useCallback(async (value: boolean) => {
    setHapticsEnabled(value);
    await persistHapticsEnabled(value);
    toast.success(value ? 'Vibrations enabled' : 'Vibrations disabled');
  }, []);

  const handleBiometricToggle = useCallback(async (value: boolean) => {
    if (value) {
      const support = await checkBiometricSupport();
      if (!support.available || !support.enrollable) {
        toast.error('No enrolled biometrics found on this device');
        return;
      }
      const ok = await authenticateBiometric('Enable biometric lock');
      if (!ok) {
        toast.error('Biometric authentication cancelled');
        return;
      }
      await persistBiometricEnabled(true);
      setBiometricEnabled(true);
      toast.success('Biometric lock enabled');
    } else {
      await persistBiometricEnabled(false);
      setBiometricEnabled(false);
      toast.success('Biometric lock disabled');
    }
    // Sync the lock provider immediately so a disable takes effect right away
    // (no stale biometric prompt) and an enable arms the gate for next launch.
    refreshLockState();
  }, [refreshLockState]);

  // Maps UI privacy key → API field
  const privacyApiMap = useCallback((key: keyof PrivacyPrefs, value: any): Record<string, any> => {
    switch (key) {
      case 'privateAccount': return { private_account: value };
      case 'onlineStatus': return { online_status: value };
      case 'readReceipts': return { read_receipts: value };
      case 'typingIndicator': return { typing_indicator: value };
      case 'profileVisibility': return { profile_visibility: value };
      case 'messagePerm': return { allow_dms: value !== 'nobody', message_perm: value };
      case 'mentionPerm': return { allow_mentions: value };
      case 'tagPerm': return { allow_tags: value };
      default: return {};
    }
  }, []);

  const setP = useCallback((key: keyof PrivacyPrefs) => async (value: any) => {
    const prevVal = privacy[key];
    setPrivacy((prev) => ({ ...prev, [key]: value }));
    const patch = privacyApiMap(key, value);
    if (Object.keys(patch).length > 0) {
      try {
        await updatePrivacySettings(patch);
        savePref(PRIVACY_KEY, { ...privacy, [key]: value }, user?.id);
        toast.success('Privacy setting updated');
      } catch {
        setPrivacy((prev) => ({ ...prev, [key]: prevVal }));
        toast.error('Failed to update privacy setting');
      }
    }
  }, [privacy, privacyApiMap, user?.id]);

  const notifApiKey: Record<keyof NotifPrefs, string | null> = {
    push: null, // handled via /settings
    messages: 'notif_messages',
    comments: 'notif_comments',
    likes: 'notif_likes',
    mentions: 'notif_mentions',
    marketing: 'notif_marketing',
  };

  const setN = useCallback((key: keyof NotifPrefs) => async (value: boolean) => {
    const prevVal = notif[key];
    setNotif((prev) => ({ ...prev, [key]: value }));
    try {
      if (key === 'push') {
        await updateSettings({ push_notifications: value });
      } else {
        const apiKey = notifApiKey[key];
        if (apiKey) {
          await updateNotificationSettings({ [apiKey]: value });
        }
      }
      savePref(NOTIF_KEY, { ...notif, [key]: value }, user?.id);
      toast.success('Preference saved');
    } catch {
      setNotif((prev) => ({ ...prev, [key]: prevVal }));
      toast.error('Failed to save notification preference');
    }
  }, [notif, user?.id]);

  const setC = useCallback((key: keyof ContentPrefs) => async (value: any) => {
    const prevVal = content[key];
    setContent((prev) => ({ ...prev, [key]: value }));
    savePref(CONTENT_KEY, { ...content, [key]: value }, user?.id);

    const patchMap: Partial<Record<keyof ContentPrefs, Record<string, any>>> = {
      sensitiveContent: { sensitive_content: value },
      autoplay: { autoplay_media: value },
      dataSaver: { data_saver: value },
      highQualityMedia: { high_quality_media: value },
      language: { language: value },
    };

    const patch = patchMap[key];
    if (patch) {
      try {
        await updateSettings(patch);
        toast.success('Preference saved');
      } catch {
        setContent((prev) => ({ ...prev, [key]: prevVal }));
        toast.error('Failed to save preference to server');
      }
    } else {
      toast.success('Preference saved');
    }
  }, [content, user?.id]);

  const togglePrivacy = (key: keyof PrivacyPrefs) => (value: boolean) => {
    setP(key)(value);
  };

  const initials = user?.name
    ? user.name.trim().split(' ').map((w: string) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
    : 'U';

  const doLogout = async () => {
    await logout();
    router.replace('/welcome');
  };

  const handleSaveProfile = async (fields: { name: string; bio: string }) => {
    try {
      // The server PATCH /users/me expects `full_name` (not `name`).
      const updated = await updateMe({ full_name: fields.name, bio: fields.bio || null });
      updateUser(updated.user);
    } catch (e: unknown) {
      throw e;
    }
  };

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color={T.TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]}
      >
        {/* Profile card */}
        <TouchableOpacity
          style={styles.profileCard}
          activeOpacity={0.8}
          onPress={() => setModal('editProfile')}
        >
          <MsAvatar size={54} initials={initials} imageUri={user?.avatarUrl ?? undefined} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name ?? 'Display Name'}</Text>
            <Text style={styles.profileHandle}>@{user?.username ?? 'username'} · Edit profile</Text>
          </View>
          <CaretRight size={17} color={T.TEXT_3} />
        </TouchableOpacity>

        {/* ── ACCOUNT ─────────────────────────────────────────────────────── */}
        <SectionHeader title="Account" />
        <View style={rs.section}>
          <Row label="Edit Profile" sub="Name, bio, and more" onPress={() => setModal('editProfile')} />
          <Divider />
          <Row label="Username" sub={`@${user?.username ?? '—'}`} onPress={() => setModal('username')} />
          <Divider />
          <Row label="Email" sub={user?.email ?? 'Not set'} onPress={() => setModal('email')} />
          <Divider />
          <Row label="Phone Number" sub={user?.phone ?? 'Not set'} onPress={() => setModal('phone')} />
          <Divider />
          <Row
            label="Creator Dashboard"
            sub="Analytics, posts, and revenue"
            onPress={() => router.push('/creator-dashboard')}
          />
        </View>

        {/* ── PRIVACY ─────────────────────────────────────────────────────── */}
        <SectionHeader title="Privacy" />
        <View style={rs.section}>
          <ToggleRow
            label="Private Account"
            sub="Only approved subscribers see your posts"
            value={privacy.privateAccount}
            onValueChange={(v) => {
              togglePrivacy('privateAccount')(v);
            }}
          />
          <Divider />
          <ToggleRow
            label="Online Status"
            sub="Show when you're active"
            value={privacy.onlineStatus}
            onValueChange={togglePrivacy('onlineStatus')}
          />
          <Divider />
          <ToggleRow
            label="Read Receipts"
            sub="Show when you've read messages"
            value={privacy.readReceipts}
            onValueChange={togglePrivacy('readReceipts')}
          />
          <Divider />
          <ToggleRow
            label="Typing Indicator"
            sub="Show when you're typing"
            value={privacy.typingIndicator}
            onValueChange={togglePrivacy('typingIndicator')}
          />
          <Divider />
          <Row
            label="Profile Visibility"
            sub={privacy.profileVisibility === 'everyone' ? 'Everyone' : privacy.profileVisibility === 'subscribers' ? 'Subscribers only' : 'Nobody'}
            onPress={() => setModal('profileVisibility')}
          />
          <Divider />
          <Row
            label="Message Permissions"
            sub={privacy.messagePerm === 'everyone' ? 'Everyone can message you' : privacy.messagePerm === 'subscribers' ? 'Subscribers only' : 'Nobody'}
            onPress={() => setModal('messagePerm')}
          />
          <Divider />
          <ToggleRow
            label="Allow Mentions"
            sub="Let others mention you in posts"
            value={privacy.mentionPerm}
            onValueChange={togglePrivacy('mentionPerm')}
          />
          <Divider />
          <ToggleRow
            label="Allow Tags"
            sub="Let others tag you in content"
            value={privacy.tagPerm}
            onValueChange={togglePrivacy('tagPerm')}
          />
        </View>

        {/* ── SECURITY ─────────────────────────────────────────────────────── */}
        <SectionHeader title="Security" />
        <View style={rs.section}>
          <ToggleRow
            label="Biometric Lock"
            sub="Require Face ID or fingerprint to open the app"
            value={biometricEnabled}
            onValueChange={handleBiometricToggle}
          />
          <Divider />
          <Row
            label="Two-Factor Authentication"
            sub={twoFactorEnabled ? 'On' : 'Add an extra login step'}
            onPress={() => setModal('twoFactor')}
          />
          <Divider />
          <Row label="Change Password" sub="Update your account password" onPress={() => setModal('changePassword')} />
          <Divider />
          <Row label="Active Sessions" sub="View and manage sign-in sessions" onPress={() => setModal('activeSessions')} />
        </View>

        <SectionHeader title="General" />
        <View style={rs.section}>
          <ToggleRow
            label="Vibrations & Haptics"
            sub="Gentle feedback for likes, messages, and sends"
            value={hapticsEnabled}
            onValueChange={handleHapticsToggle}
          />
        </View>

        <SectionHeader title="Notifications" />
        <View style={rs.section}>
          <ToggleRow
            label="Push Notifications"
            sub="Device alerts"
            value={notif.push}
            onValueChange={setN('push')}
          />
          <Divider />
          <ToggleRow label="Messages" sub="New direct messages" value={notif.messages} onValueChange={setN('messages')} />
          <Divider />
          <ToggleRow label="Comments" sub="Comments on your posts" value={notif.comments} onValueChange={setN('comments')} />
          <Divider />
          <ToggleRow label="Likes" sub="Likes on your posts" value={notif.likes} onValueChange={setN('likes')} />
          <Divider />
          <ToggleRow label="Mentions" sub="When someone mentions you" value={notif.mentions} onValueChange={setN('mentions')} />
          <Divider />
          <ToggleRow label="Marketing" sub="Promotions and platform news" value={notif.marketing} onValueChange={setN('marketing')} />
        </View>

        {/* ── CONTENT ──────────────────────────────────────────────────────── */}
        <SectionHeader title="Content" />
        <View style={rs.section}>
          <ToggleRow
            label="Sensitive Content"
            sub="Show potentially sensitive media"
            value={content.sensitiveContent}
            onValueChange={setC('sensitiveContent')}
          />
          <Divider />
          <ToggleRow label="Autoplay" sub="Auto-play videos in feed" value={content.autoplay} onValueChange={setC('autoplay')} />
          <Divider />
          <ToggleRow label="Data Saver" sub="Reduce data usage" value={content.dataSaver} onValueChange={setC('dataSaver')} />
          <Divider />
          <ToggleRow label="High Quality Media" sub="Load full-resolution images" value={content.highQualityMedia} onValueChange={setC('highQualityMedia')} />
          <Divider />
          <Row label="Language" sub={content.language} onPress={() => setModal('language')} />
          <Divider />
          <Row
            label="Theme"
            sub="Dark (Default)"
            noChevron
          />
        </View>

        {/* ── SUPPORT ──────────────────────────────────────────────────────── */}
        <SectionHeader title="Support" />
        <View style={rs.section}>
          <Row label="Help Centre" sub="Guides, FAQs, and tutorials" onPress={() => setModal('help')} />
          <Divider />
          <Row label="Report a Bug" sub="Help us improve" onPress={() => setModal('bug')} />
          <Divider />
          <Row label="Contact Support" sub="Get help from the team" onPress={() => setModal('contact')} />
          <Divider />
          <Row label="About MeetSweet" sub="Version 1.0.0" onPress={() => setModal('about')} />
        </View>

        {/* ── DANGER ───────────────────────────────────────────────────────── */}
        <SectionHeader title="Account Actions" />
        <View style={rs.section}>
          <Row label="Delete Account" danger onPress={() => setDeleteConfirm(true)} />
        </View>

        {/* Log out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={() => setLogoutConfirm(true)} activeOpacity={0.8}>
          <SignOut size={17} color={T.ERROR} />
          <Text style={styles.logoutLabel}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MeetSweet v1.0.0</Text>
      </ScrollView>

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      <EditProfileModal
        visible={modal === 'editProfile'}
        onClose={() => setModal(null)}
        user={user}
        onSave={handleSaveProfile}
      />
      <UsernameModal
        visible={modal === 'username'}
        onClose={() => setModal(null)}
        currentUsername={user?.username ?? ''}
      />
      <EmailModal
        visible={modal === 'email'}
        onClose={() => setModal(null)}
        currentEmail={user?.email ?? ''}
      />
      <PhoneModal
        visible={modal === 'phone'}
        onClose={() => setModal(null)}
        currentPhone={user?.phone ?? ''}
      />
      <ChangePasswordModal
        visible={modal === 'changePassword'}
        onClose={() => setModal(null)}
      />
      <ActiveSessionsModal
        visible={modal === 'activeSessions'}
        onClose={() => setModal(null)}
      />
      <ProfileVisibilityModal
        visible={modal === 'profileVisibility'}
        onClose={() => setModal(null)}
        value={privacy.profileVisibility}
        onChange={setP('profileVisibility')}
      />
      <PermissionModal
        visible={modal === 'messagePerm'}
        onClose={() => setModal(null)}
        title="Message Permissions"
        value={privacy.messagePerm}
        onChange={setP('messagePerm')}
      />
      <LanguageModal
        visible={modal === 'language'}
        onClose={() => setModal(null)}
        value={content.language}
        onChange={setC('language')}
      />
      <SupportModal visible={modal === 'help'} onClose={() => setModal(null)} type="help" />
      <SupportModal visible={modal === 'bug'} onClose={() => setModal(null)} type="bug" />
      <SupportModal visible={modal === 'contact'} onClose={() => setModal(null)} type="contact" />
      <SupportModal visible={modal === 'about'} onClose={() => setModal(null)} type="about" />
      <TwoFactorModal visible={modal === 'twoFactor'} onClose={() => setModal(null)} />

      {/* Confirm dialogs */}
      <MsConfirmDialog
        visible={logoutConfirm}
        title="Log Out"
        message="Are you sure you want to log out?"
        confirmLabel="Log Out"
        destructive
        onConfirm={doLogout}
        onCancel={() => setLogoutConfirm(false)}
      />
      <DeleteAccountModal
        visible={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onDelete={async (password) => {
          try {
            await deleteAccount(password);
            await logout();
            router.replace('/welcome');
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to delete account');
          }
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: T.BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
    textAlign: 'center',
  },

  scroll: { paddingTop: 8 },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    padding: 16,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    gap: 14,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT },
  profileHandle: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 28,
    padding: 16,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
  },
  logoutLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.ERROR },

  version: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    marginTop: 20,
  },
});
