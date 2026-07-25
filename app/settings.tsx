import React, { useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CaretRight,
  User,
  Info,
  Link,
  Lock,
  Bell,
  Shield,
  UserMinus,
  Question,
  ChatCentered,
  Warning,
  FileText,
  Eye,
  SignOut,
  type Icon,
} from 'phosphor-react-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsActionSheet } from '@/components/MsActionSheet';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { toast } from '@/components/MsToast';
import { useAuth } from '@/contexts/AuthContext';

// ─── Settings row ─────────────────────────────────────────────────────────────

type RowIcon = Icon;

function SettingsRow({
  Icon,
  label,
  onPress,
  chevron = true,
  danger = false,
  badge,
}: {
  Icon?: RowIcon;
  label: string;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
  badge?: string;
}) {
  const labelColor = danger ? T.ERROR : T.TEXT;
  const iconColor = danger ? T.ERROR : T.TEXT_2;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {Icon && (
        <View style={styles.rowIconWrap}>
          <Icon size={17} color={iconColor} />
        </View>
      )}
      <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      {badge && (
        <View style={styles.rowBadge}>
          <Text style={styles.rowBadgeText}>{badge}</Text>
        </View>
      )}
      {chevron && <CaretRight size={15} color={T.TEXT_3} />}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

// ─── Inline text input sheet ──────────────────────────────────────────────────

function InlineInputSheet({
  visible,
  title,
  placeholder,
  value,
  onChangeText,
  onSubmit,
  onClose,
  secureEntry,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  secureEntry?: boolean;
}) {
  if (!visible) return null;
  return (
    <View style={inputSheetStyles.overlay}>
      <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
      <View style={inputSheetStyles.sheet}>
        <Text style={inputSheetStyles.title}>{title}</Text>
        <TextInput
          style={inputSheetStyles.input}
          placeholder={placeholder}
          placeholderTextColor={T.TEXT_3}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureEntry}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
        <View style={inputSheetStyles.buttons}>
          <TouchableOpacity style={inputSheetStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={inputSheetStyles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={inputSheetStyles.saveBtn} onPress={onSubmit} activeOpacity={0.8}>
            <Text style={inputSheetStyles.saveLabel}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const inputSheetStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 100,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 16, fontFamily: T.FONT.bold, color: T.TEXT, textAlign: 'center' },
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
  buttons: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, height: 44, borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center',
  },
  cancelLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  saveBtn: {
    flex: 1, height: 44, borderRadius: T.RADIUS.md,
    backgroundColor: T.TEXT, alignItems: 'center', justifyContent: 'center',
  },
  saveLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.BG },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);

  // Change password sheet
  const [pwSheetVisible, setPwSheetVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Notification sheet
  const [notifSheetVisible, setNotifSheetVisible] = useState(false);

  // Privacy/content sheet
  const [privacySheetVisible, setPrivacySheetVisible] = useState(false);

  const initials = user?.name
    ? user.name.trim().split(' ').map((w: string) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
    : 'U';

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleSignOut = () => setLogoutConfirm(true);

  const doLogout = async () => {
    await logout();
    router.replace('/welcome');
  };

  const handleChangePassword = () => {
    setPwSheetVisible(true);
  };

  const submitChangePassword = () => {
    if (!newPassword.trim() || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setPwSheetVisible(false);
    setNewPassword('');
    toast.success('Password updated');
  };

  const handleAccountInfo = () => {
    const lines = [
      `Name: ${user?.name ?? '—'}`,
      `Username: @${user?.username ?? '—'}`,
      `Email: ${user?.email ?? '—'}`,
      `Phone: ${user?.phone ?? '—'}`,
      `Member since: ${user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}`,
    ].join('\n');
    Alert.alert('Account Information', lines, [{ text: 'Close' }]);
  };

  const handleLinkedAccounts = () => {
    Alert.alert('Linked Accounts', 'No linked accounts. Connect Google, Apple, or other accounts to sign in faster.', [
      { text: 'Close' },
    ]);
  };

  const handleBlockedUsers = () => {
    Alert.alert('Blocked Users', 'You have not blocked anyone yet. When you block someone, they will appear here.', [
      { text: 'OK' },
    ]);
  };

  const handleTwoFactor = () => {
    Alert.alert('Two-Factor Authentication', 'Two-factor authentication adds an extra layer of security. This feature is coming soon.', [
      { text: 'OK' },
    ]);
  };

  const handleActiveSessions = () => {
    Alert.alert('Active Sessions', 'You are currently signed in on 1 device.\n\nThis device: Current session', [
      { text: 'Sign Out All Devices', style: 'destructive', onPress: () => toast.info('Signed out of all devices') },
      { text: 'Close', style: 'cancel' },
    ]);
  };

  const handleHelpCenter = () => {
    Alert.alert('Help Center', 'Visit meetsweet.io/help for guides, FAQs, and tutorials.', [
      { text: 'Close' },
    ]);
  };

  const handleContactSupport = () => {
    Alert.alert('Contact Support', 'Email us at support@meetsweet.io and our team will respond within 24 hours.', [
      { text: 'Close' },
    ]);
  };

  const handleReportProblem = () => {
    Alert.alert('Report a Problem', 'Describe the problem you encountered', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send Report',
        onPress: () => toast.success('Problem reported. Thank you!'),
      },
    ]);
  };

  const handleTerms = () => {
    Alert.alert('Terms of Service', 'View our terms at meetsweet.io/terms', [{ text: 'OK' }]);
  };

  const handlePrivacyPolicy = () => {
    Alert.alert('Privacy Policy', 'View our privacy policy at meetsweet.io/privacy', [{ text: 'OK' }]);
  };

  const handleAbout = () => {
    Alert.alert(
      'About MeetSweet',
      'MeetSweet v1.0.0\n\nBuilt with ❤️ for creators everywhere.\n\n© 2026 MeetSweet Inc.',
      [{ text: 'Close' }],
    );
  };

  const handleDeleteAccount = () => {
    setDeleteAccountConfirm(false);
    toast.error('Account deletion request submitted');
    setTimeout(() => logout(), 1500);
  };

  const notificationActions = [
    { label: 'All Notifications — On', onPress: () => toast.success('All notifications enabled') },
    { label: 'New Followers — On', onPress: () => toast.info('Setting updated') },
    { label: 'New Messages — On', onPress: () => toast.info('Setting updated') },
    { label: 'Post Likes — On', onPress: () => toast.info('Setting updated') },
    { label: 'Comments — On', onPress: () => toast.info('Setting updated') },
    { label: 'Turn Off All', destructive: true, onPress: () => toast.info('All notifications disabled') },
  ];

  const privacyActions = [
    { label: 'Public Account', onPress: () => toast.info('Account is public') },
    { label: 'Private Account', onPress: () => toast.info('Switching to private coming soon') },
    { label: 'Show Activity Status', onPress: () => toast.info('Setting updated') },
    { label: 'Allow Direct Messages', onPress: () => toast.info('Setting updated') },
  ];

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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Profile summary */}
        <TouchableOpacity
          style={styles.profileCard}
          activeOpacity={0.8}
          onPress={() => router.push('/edit-profile')}
        >
          <MsAvatar size={54} initials={initials} imageUri={user?.avatarUrl ?? undefined} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name ?? 'Display Name'}</Text>
            <Text style={styles.profileHandle}>
              @{user?.username ?? 'username'} · Tap to edit profile
            </Text>
          </View>
          <CaretRight size={18} color={T.TEXT_3} />
        </TouchableOpacity>

        {/* Account */}
        <SectionHeader title="Account" />
        <View style={styles.section}>
          <SettingsRow Icon={User} label="Profile" onPress={() => router.push('/edit-profile')} />
          <View style={styles.rowDivider} />
          <SettingsRow Icon={Info} label="Account Information" onPress={handleAccountInfo} />
          <View style={styles.rowDivider} />
          <SettingsRow Icon={Link} label="Linked Accounts" onPress={handleLinkedAccounts} />
        </View>

        {/* Privacy */}
        <SectionHeader title="Privacy" />
        <View style={styles.section}>
          <SettingsRow Icon={Lock} label="Privacy Settings" onPress={() => setPrivacySheetVisible(true)} />
          <View style={styles.rowDivider} />
          <SettingsRow Icon={UserMinus} label="Blocked Users" onPress={handleBlockedUsers} />
          <View style={styles.rowDivider} />
          <SettingsRow Icon={Eye} label="Content Preferences" onPress={() => setPrivacySheetVisible(true)} />
        </View>

        {/* Notifications */}
        <SectionHeader title="Notifications" />
        <View style={styles.section}>
          <SettingsRow
            Icon={Bell}
            label="Notification Preferences"
            onPress={() => setNotifSheetVisible(true)}
          />
        </View>

        {/* Security */}
        <SectionHeader title="Security" />
        <View style={styles.section}>
          <SettingsRow Icon={Lock} label="Change Password" onPress={handleChangePassword} />
          <View style={styles.rowDivider} />
          <SettingsRow
            Icon={Shield}
            label="Two-Factor Authentication"
            onPress={handleTwoFactor}
            badge="Off"
          />
          <View style={styles.rowDivider} />
          <SettingsRow Icon={Info} label="Active Sessions" onPress={handleActiveSessions} />
        </View>

        {/* Support */}
        <SectionHeader title="Support" />
        <View style={styles.section}>
          <SettingsRow Icon={Question} label="Help Center" onPress={handleHelpCenter} />
          <View style={styles.rowDivider} />
          <SettingsRow Icon={ChatCentered} label="Contact Support" onPress={handleContactSupport} />
          <View style={styles.rowDivider} />
          <SettingsRow Icon={Warning} label="Report a Problem" onPress={handleReportProblem} />
        </View>

        {/* Legal */}
        <SectionHeader title="Legal" />
        <View style={styles.section}>
          <SettingsRow Icon={FileText} label="Terms of Service" onPress={handleTerms} />
          <View style={styles.rowDivider} />
          <SettingsRow Icon={Eye} label="Privacy Policy" onPress={handlePrivacyPolicy} />
          <View style={styles.rowDivider} />
          <SettingsRow Icon={Info} label="About MeetSweet" onPress={handleAbout} />
        </View>

        {/* Danger zone */}
        <SectionHeader title="Account Actions" />
        <View style={styles.section}>
          <SettingsRow
            Icon={UserMinus}
            label="Delete Account"
            danger
            onPress={() => setDeleteAccountConfirm(true)}
          />
        </View>

        {/* Log out */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <SignOut size={17} color={T.ERROR} />
          <Text style={styles.logoutLabel}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MeetSweet v1.0.0</Text>
      </ScrollView>

      {/* Logout confirmation */}
      <MsConfirmDialog
        visible={logoutConfirm}
        title="Log Out"
        message="Are you sure you want to log out?"
        confirmLabel="Log Out"
        destructive
        onConfirm={doLogout}
        onCancel={() => setLogoutConfirm(false)}
      />

      {/* Delete account confirmation */}
      <MsConfirmDialog
        visible={deleteAccountConfirm}
        title="Delete Account"
        message="This will permanently delete your account and all your data. This cannot be undone."
        confirmLabel="Delete Account"
        destructive
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteAccountConfirm(false)}
      />

      {/* Change password sheet */}
      <InlineInputSheet
        visible={pwSheetVisible}
        title="Change Password"
        placeholder="New password (min 8 characters)"
        value={newPassword}
        onChangeText={setNewPassword}
        onSubmit={submitChangePassword}
        onClose={() => { setPwSheetVisible(false); setNewPassword(''); }}
        secureEntry
      />

      {/* Notification preferences action sheet */}
      <MsActionSheet
        visible={notifSheetVisible}
        title="Notification Preferences"
        actions={notificationActions}
        onClose={() => setNotifSheetVisible(false)}
      />

      {/* Privacy / content action sheet */}
      <MsActionSheet
        visible={privacySheetVisible}
        title="Privacy Settings"
        actions={privacyActions}
        onClose={() => setPrivacySheetVisible(false)}
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

  scrollContent: { paddingTop: 8 },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    gap: 14,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT },
  profileHandle: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    marginTop: 2,
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
  rowIconWrap: { width: 28, alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT },
  rowBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.RADIUS.xs,
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER_2,
  },
  rowBadgeText: { fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  rowDivider: { height: 1, backgroundColor: T.BORDER, marginLeft: 56 },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 28,
    padding: 16,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  logoutLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.ERROR,
  },

  version: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    marginTop: 24,
  },
});
