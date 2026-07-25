/**
 * Privacy Settings screen.
 * All switches persist to AsyncStorage immediately.
 * When PATCH /users/me is implemented on the backend, each toggle should also
 * call updateMe() — documented in BACKEND_REQUIRED.md.
 */
import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { toast } from '@/components/MsToast';

// ─── Storage helpers ──────────────────────────────────────────────────────────

const PREFS_KEY = '@ms_privacy_prefs';

interface PrivacyPrefs {
  privateAccount: boolean;
  onlineStatus: boolean;
  activityStatus: boolean;
  typingIndicator: boolean;
  readReceipts: boolean;
  allowDMs: boolean;
  allowMentions: boolean;
  allowTags: boolean;
  searchVisible: boolean;
  birthdayVisible: boolean;
  phoneVisible: boolean;
  sensitiveBlur: boolean;
  qrDiscovery: boolean;
  autoArchive: boolean;
}

const DEFAULTS: PrivacyPrefs = {
  privateAccount: false,
  onlineStatus: true,
  activityStatus: true,
  typingIndicator: true,
  readReceipts: true,
  allowDMs: true,
  allowMentions: true,
  allowTags: true,
  searchVisible: true,
  birthdayVisible: false,
  phoneVisible: false,
  sensitiveBlur: true,
  qrDiscovery: true,
  autoArchive: false,
};

async function loadPrefs(): Promise<PrivacyPrefs> {
  try {
    const v = await AsyncStorage.getItem(PREFS_KEY);
    return v ? { ...DEFAULTS, ...(JSON.parse(v) as Partial<PrivacyPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

async function savePrefs(prefs: PrivacyPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

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
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description && (
          <Text style={styles.toggleDescription}>{description}</Text>
        )}
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

export default function PrivacySettingsScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<PrivacyPrefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadPrefs().then((p) => {
      setPrefs(p);
      setLoaded(true);
    });
  }, []);

  const toggle = (key: keyof PrivacyPrefs) => (value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
    toast.success('Privacy preference saved');
    // TODO: when PATCH /users/me is implemented, call updateMe() here
  };

  if (!loaded) return <View style={[styles.bg, { paddingTop: insets.top }]} />;

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
        <Text style={styles.headerTitle}>Privacy</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Account privacy */}
        <SectionHeader title="Account" />
        <View style={styles.section}>
          <ToggleRow
            label="Private Account"
            description="Only approved followers can see your posts"
            value={prefs.privateAccount}
            onValueChange={toggle('privateAccount')}
          />
        </View>

        {/* Presence */}
        <SectionHeader title="Presence" />
        <View style={styles.section}>
          <ToggleRow
            label="Show Online Status"
            description="Let others see when you're active"
            value={prefs.onlineStatus}
            onValueChange={toggle('onlineStatus')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Activity Status"
            description="Show when you were last active"
            value={prefs.activityStatus}
            onValueChange={toggle('activityStatus')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Typing Indicator"
            description="Show when you're typing a message"
            value={prefs.typingIndicator}
            onValueChange={toggle('typingIndicator')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Read Receipts"
            description="Show when you've read messages"
            value={prefs.readReceipts}
            onValueChange={toggle('readReceipts')}
          />
        </View>

        {/* Interactions */}
        <SectionHeader title="Interactions" />
        <View style={styles.section}>
          <ToggleRow
            label="Allow Direct Messages"
            description="Let anyone send you messages"
            value={prefs.allowDMs}
            onValueChange={toggle('allowDMs')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Allow Mentions"
            description="Let others mention you in posts"
            value={prefs.allowMentions}
            onValueChange={toggle('allowMentions')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Allow Tags"
            description="Let others tag you in their content"
            value={prefs.allowTags}
            onValueChange={toggle('allowTags')}
          />
        </View>

        {/* Discoverability */}
        <SectionHeader title="Discoverability" />
        <View style={styles.section}>
          <ToggleRow
            label="Appear in Search"
            description="Let others find your profile via search"
            value={prefs.searchVisible}
            onValueChange={toggle('searchVisible')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="QR Code Discovery"
            description="Allow others to find you via QR code"
            value={prefs.qrDiscovery}
            onValueChange={toggle('qrDiscovery')}
          />
        </View>

        {/* Profile visibility */}
        <SectionHeader title="Profile Visibility" />
        <View style={styles.section}>
          <ToggleRow
            label="Show Birthday"
            description="Display your birthday on your profile"
            value={prefs.birthdayVisible}
            onValueChange={toggle('birthdayVisible')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Show Phone Number"
            description="Display your phone number on your profile"
            value={prefs.phoneVisible}
            onValueChange={toggle('phoneVisible')}
          />
        </View>

        {/* Content */}
        <SectionHeader title="Content" />
        <View style={styles.section}>
          <ToggleRow
            label="Blur Sensitive Content"
            description="Automatically blur potentially sensitive media"
            value={prefs.sensitiveBlur}
            onValueChange={toggle('sensitiveBlur')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Auto-Archive Posts"
            description="Archive starter posts after 24 hours automatically"
            value={prefs.autoArchive}
            onValueChange={toggle('autoArchive')}
          />
        </View>

        <Text style={styles.footer}>
          Changes apply immediately within the app. Some settings require backend
          support to propagate across all devices.
        </Text>
      </ScrollView>
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

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  toggleText: { flex: 1 },
  toggleLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  toggleDescription: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 2,
    lineHeight: 17,
  },

  divider: {
    height: 1,
    backgroundColor: T.BORDER,
    marginLeft: 16,
  },

  footer: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    marginHorizontal: 24,
    marginTop: 28,
    lineHeight: 18,
  },
});
