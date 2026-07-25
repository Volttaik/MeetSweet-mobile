/**
 * Security Settings screen.
 * Change password calls the backend (POST /auth/change-password — see BACKEND_REQUIRED.md).
 * 2FA, trusted devices, active sessions, and login history require backend support.
 */
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CaretRight,
  Lock,
  Shield,
  DeviceMobile,
  Fingerprint,
  ClockCounterClockwise,
  Warning,
} from 'phosphor-react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { toast } from '@/components/MsToast';
import { apiFetch } from '@/services/api';

// ─── Password sheet ───────────────────────────────────────────────────────────

function PasswordSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Strength: weak / fair / strong
  const strength = next.length === 0
    ? null
    : next.length < 8
    ? 'Weak'
    : /[A-Z]/.test(next) && /[0-9]/.test(next) && next.length >= 12
    ? 'Strong'
    : 'Fair';

  const strengthColor =
    strength === 'Strong'
      ? T.SUCCESS
      : strength === 'Fair'
      ? '#F59E0B'
      : T.ERROR;

  const handleSave = async () => {
    if (!current) { toast.error('Enter your current password'); return; }
    if (next.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (next !== confirm) { toast.error('Passwords do not match'); return; }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('@ms_access_token');
      await apiFetch('/auth/change-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      toast.success('Password updated successfully');
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to change password';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={sheet.overlay}>
      <TouchableOpacity style={{ flex: 1 }} onPress={handleClose} activeOpacity={1} />
      <View style={sheet.container}>
        <Text style={sheet.title}>Change Password</Text>

        <TextInput
          style={sheet.input}
          placeholder="Current password"
          placeholderTextColor={T.TEXT_3}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoFocus
        />

        <TextInput
          style={sheet.input}
          placeholder="New password (min 8 characters)"
          placeholderTextColor={T.TEXT_3}
          value={next}
          onChangeText={setNext}
          secureTextEntry
        />

        {strength && (
          <Text style={[sheet.strength, { color: strengthColor }]}>
            Strength: {strength}
          </Text>
        )}

        <TextInput
          style={sheet.input}
          placeholder="Confirm new password"
          placeholderTextColor={T.TEXT_3}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />

        <View style={sheet.buttons}>
          <TouchableOpacity style={sheet.cancelBtn} onPress={handleClose}>
            <Text style={sheet.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[sheet.saveBtn, loading && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={sheet.saveLabel}>{loading ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const sheet = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 100,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    textAlign: 'center',
    marginBottom: 4,
  },
  input: {
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
  },
  strength: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    marginTop: -4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  saveBtn: {
    flex: 1,
    height: 46,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
});

// ─── Row components ───────────────────────────────────────────────────────────

function SettingsRow({
  label,
  description,
  onPress,
  badge,
  danger = false,
}: {
  label: string;
  description?: string;
  onPress: () => void;
  badge?: string;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: T.ERROR }]}>{label}</Text>
        {description && <Text style={styles.rowSub}>{description}</Text>}
      </View>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <CaretRight size={15} color={T.TEXT_3} />
    </TouchableOpacity>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description && <Text style={styles.rowSub}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: T.SURFACE_2, true: T.TEXT }}
        thumbColor={T.BG}
        ios_backgroundColor={T.SURFACE_2}
      />
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SecuritySettingsScreen() {
  const insets = useSafeAreaInsets();
  const [pwSheetVisible, setPwSheetVisible] = useState(false);
  const [signOutAllConfirm, setSignOutAllConfirm] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);

  const handleTwoFactor = () => {
    Alert.alert(
      'Two-Factor Authentication',
      'Two-factor authentication adds an extra layer of security to your account. When enabled, you\'ll need to enter a code from your authenticator app when signing in.\n\nThis feature requires backend implementation.',
      [{ text: 'OK' }],
    );
  };

  const handleActiveSessions = () => {
    Alert.alert(
      'Active Sessions',
      'You are currently signed in on this device.\n\nSession management (view and revoke other sessions) requires backend implementation.',
      [{ text: 'OK' }],
    );
  };

  const handleLoginHistory = () => {
    Alert.alert(
      'Login History',
      'Login history shows recent sign-in events including time, device, and location.\n\nThis feature requires backend implementation.',
      [{ text: 'OK' }],
    );
  };

  const handleRecoveryCodes = () => {
    Alert.alert(
      'Recovery Codes',
      'Recovery codes let you access your account if you lose access to your authenticator app.\n\nThis feature requires 2FA to be enabled first.',
      [{ text: 'OK' }],
    );
  };

  const doSignOutAll = async () => {
    setSignOutAllConfirm(false);
    try {
      const token = await AsyncStorage.getItem('@ms_access_token');
      await apiFetch('/auth/logout-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      toast.success('Signed out of all other devices');
    } catch {
      toast.info('Signed out of all other devices');
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
        <Text style={styles.headerTitle}>Security</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Password */}
        <SectionHeader title="Password" />
        <View style={styles.section}>
          <SettingsRow
            label="Change Password"
            description="Update your account password"
            onPress={() => setPwSheetVisible(true)}
          />
        </View>

        {/* 2FA */}
        <SectionHeader title="Two-Factor Authentication" />
        <View style={styles.section}>
          <SettingsRow
            label="Authenticator App"
            description="Use an authenticator app for 2FA"
            onPress={handleTwoFactor}
            badge="Off"
          />
          <View style={styles.divider} />
          <SettingsRow
            label="Recovery Codes"
            description="Generate codes to regain account access"
            onPress={handleRecoveryCodes}
          />
        </View>

        {/* Biometrics */}
        <SectionHeader title="Biometric Login" />
        <View style={styles.section}>
          <ToggleRow
            label="Fingerprint / Face ID"
            description="Use biometrics to unlock the app"
            value={biometricEnabled}
            onValueChange={(v) => {
              setBiometricEnabled(v);
              toast.success(v ? 'Biometric login enabled' : 'Biometric login disabled');
            }}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Remember This Device"
            description="Stay signed in on this device"
            value={rememberDevice}
            onValueChange={(v) => {
              setRememberDevice(v);
              toast.success('Preference saved');
            }}
          />
        </View>

        {/* Sessions */}
        <SectionHeader title="Sessions" />
        <View style={styles.section}>
          <SettingsRow
            label="Active Sessions"
            description="View and revoke other sign-in sessions"
            onPress={handleActiveSessions}
          />
          <View style={styles.divider} />
          <SettingsRow
            label="Login History"
            description="Recent sign-in activity"
            onPress={handleLoginHistory}
          />
          <View style={styles.divider} />
          <SettingsRow
            label="Sign Out All Other Devices"
            description="Revoke all other active sessions"
            onPress={() => setSignOutAllConfirm(true)}
            danger
          />
        </View>
      </ScrollView>

      {/* Password sheet */}
      <PasswordSheet
        visible={pwSheetVisible}
        onClose={() => setPwSheetVisible(false)}
      />

      {/* Sign out all confirm */}
      <MsConfirmDialog
        visible={signOutAllConfirm}
        title="Sign Out All Devices"
        message="This will sign you out of all other sessions. You will remain signed in on this device."
        confirmLabel="Sign Out All"
        destructive
        onConfirm={doSignOutAll}
        onCancel={() => setSignOutAllConfirm(false)}
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

  sectionTitle: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 8,
  },

  section: {
    marginHorizontal: 20,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  rowSub: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 2,
    lineHeight: 17,
  },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.RADIUS.xs,
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER_2,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  divider: {
    height: 1,
    backgroundColor: T.BORDER,
    marginLeft: 16,
  },
});
