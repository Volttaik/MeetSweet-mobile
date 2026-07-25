/**
 * Notification Settings screen.
 * All preferences persist to AsyncStorage immediately.
 * Push/SMS channels require backend implementation (see BACKEND_REQUIRED.md).
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

// ─── Preferences shape ────────────────────────────────────────────────────────

interface NotifPrefs {
  // Activity
  newMessages: boolean;
  newComments: boolean;
  newMentions: boolean;
  newLikes: boolean;
  newFollowers: boolean;
  creatorUpdates: boolean;
  marketing: boolean;
  // Channels
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  // UX
  vibration: boolean;
  sound: boolean;
  preview: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string;   // "08:00"
}

const PREFS_KEY = '@ms_notif_prefs';

const DEFAULTS: NotifPrefs = {
  newMessages: true,
  newComments: true,
  newMentions: true,
  newLikes: true,
  newFollowers: true,
  creatorUpdates: true,
  marketing: false,
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  vibration: true,
  sound: true,
  preview: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

async function loadPrefs(): Promise<NotifPrefs> {
  try {
    const v = await AsyncStorage.getItem(PREFS_KEY);
    return v ? { ...DEFAULTS, ...(JSON.parse(v) as Partial<NotifPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

async function savePrefs(p: NotifPrefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)).catch(() => {});
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

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadPrefs().then((p) => {
      setPrefs(p);
      setLoaded(true);
    });
  }, []);

  const toggle = (key: keyof NotifPrefs) => (value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
    toast.success('Preference saved');
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
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Activity */}
        <SectionHeader title="Activity" />
        <View style={styles.section}>
          <ToggleRow
            label="Messages"
            description="New direct messages"
            value={prefs.newMessages}
            onValueChange={toggle('newMessages')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Comments"
            description="Comments on your posts"
            value={prefs.newComments}
            onValueChange={toggle('newComments')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Mentions"
            description="When someone mentions you"
            value={prefs.newMentions}
            onValueChange={toggle('newMentions')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Likes"
            description="Likes on your posts"
            value={prefs.newLikes}
            onValueChange={toggle('newLikes')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="New Followers"
            description="When someone follows you"
            value={prefs.newFollowers}
            onValueChange={toggle('newFollowers')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Creator Updates"
            description="Updates from creators you follow"
            value={prefs.creatorUpdates}
            onValueChange={toggle('creatorUpdates')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Marketing"
            description="Promotions and platform news"
            value={prefs.marketing}
            onValueChange={toggle('marketing')}
          />
        </View>

        {/* Channels */}
        <SectionHeader title="Channels" />
        <View style={styles.section}>
          <ToggleRow
            label="Push Notifications"
            description="Alerts on your device"
            value={prefs.pushEnabled}
            onValueChange={toggle('pushEnabled')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Email Notifications"
            description="Updates to your email address"
            value={prefs.emailEnabled}
            onValueChange={toggle('emailEnabled')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="SMS Notifications"
            description="Text messages to your phone"
            value={prefs.smsEnabled}
            onValueChange={toggle('smsEnabled')}
          />
        </View>

        {/* Sound & UX */}
        <SectionHeader title="Sound & Alerts" />
        <View style={styles.section}>
          <ToggleRow
            label="Sound"
            description="Play a sound for notifications"
            value={prefs.sound}
            onValueChange={toggle('sound')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Vibration"
            description="Vibrate on notification"
            value={prefs.vibration}
            onValueChange={toggle('vibration')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Notification Preview"
            description="Show message content in alerts"
            value={prefs.preview}
            onValueChange={toggle('preview')}
          />
        </View>

        {/* Quiet hours */}
        <SectionHeader title="Quiet Hours" />
        <View style={styles.section}>
          <ToggleRow
            label="Enable Quiet Hours"
            description={`Silence notifications from ${prefs.quietHoursStart} to ${prefs.quietHoursEnd}`}
            value={prefs.quietHoursEnabled}
            onValueChange={toggle('quietHoursEnabled')}
          />
        </View>

        <Text style={styles.footer}>
          Activity preferences apply immediately. Push, email, and SMS channels
          require your device permissions and backend integration.
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
