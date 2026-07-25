import React, { useEffect, useState } from 'react';
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
import { ArrowLeft } from 'phosphor-react-native';
import { router } from 'expo-router';
import { Spinner } from 'heroui-native';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INPUT_BG = T.SURFACE;
const INPUT_BORDER = T.BORDER_2;
const INPUT_BORDER_FOCUSED = T.TEXT;
const INPUT_BORDER_ERROR = T.ERROR;

// Extra profile fields stored locally until PATCH /users/me is live
const EXTRA_FIELDS_KEY = '@ms_profile_extra';
interface ExtraFields { website: string; location: string; birthday: string; gender: string }
const EMPTY_EXTRA: ExtraFields = { website: '', location: '', birthday: '', gender: '' };

async function loadExtra(): Promise<ExtraFields> {
  try {
    const v = await AsyncStorage.getItem(EXTRA_FIELDS_KEY);
    return v ? { ...EMPTY_EXTRA, ...(JSON.parse(v) as Partial<ExtraFields>) } : EMPTY_EXTRA;
  } catch { return EMPTY_EXTRA; }
}
async function saveExtra(e: ExtraFields): Promise<void> {
  await AsyncStorage.setItem(EXTRA_FIELDS_KEY, JSON.stringify(e)).catch(() => {});
}

const GENDER_OPTIONS = ['Prefer not to say', 'Male', 'Female', 'Non-binary', 'Other'];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  // Extra fields (local)
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('Prefer not to say');

  const [loading, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setBio(user.bio ?? '');
    }
    loadExtra().then((e) => {
      setWebsite(e.website);
      setLocation(e.location);
      setBirthday(e.birthday);
      setGender(e.gender || 'Prefer not to say');
    });
  }, [user?.id]);

  const initials = name.trim()
    ? name.trim().split(' ').map((w: string) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
    : (user?.username?.[0]?.toUpperCase() ?? 'U');

  const hasChanges =
    name.trim() !== (user?.name ?? '') ||
    bio.trim() !== (user?.bio ?? '') ||
    website.trim() !== '' ||
    location.trim() !== '' ||
    birthday.trim() !== '';

  const handleSave = async () => {
    if (!name.trim() || name.trim().length < 2) {
      setError('Display name must be at least 2 characters');
      return;
    }
    if (!hasChanges) {
      router.back();
      return;
    }

    setError('');
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('@ms_access_token');
      if (!token) throw new Error('Not authenticated');

      const updated = await apiFetch<{ user: typeof user }>('/users/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim() || null,
        }),
      });

      if (updated?.user) {
        updateUser(updated.user);
      } else if (user) {
        // Patch local state optimistically
        updateUser({ ...user, name: name.trim(), bio: bio.trim() || null });
      }

      // Save extra fields locally (until PATCH /users/me is live)
      await saveExtra({ website: website.trim(), location: location.trim(), birthday: birthday.trim(), gender });

      router.back();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile';
      // PATCH /users/me returns 405 — apply optimistically
      if (err instanceof Error && (err.message.includes('405') || err.message.includes('Method Not Allowed'))) {
        if (user) {
          updateUser({ ...user, name: name.trim(), bio: bio.trim() || null });
        }
        await saveExtra({ website: website.trim(), location: location.trim(), birthday: birthday.trim(), gender });
        router.back();
        return;
      }
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (hasChanges) {
              Alert.alert('Discard changes?', 'You have unsaved changes.', [
                { text: 'Keep editing', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => router.back() },
              ]);
            } else {
              router.back();
            }
          }}
          style={styles.headerBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color={T.TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <Spinner size="sm" color={T.BG} />
          ) : (
            <Text style={styles.saveBtnLabel}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 60 : 48) },
        ]}
      >
        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <MsAvatar
            size={88}
            initials={initials}
            imageUri={user?.avatarUrl ?? undefined}
          />
          <TouchableOpacity activeOpacity={0.7} style={styles.changePhotoBtn}>
            <Text style={styles.changePhotoLabel}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Error banner */}
        {!!error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          {/* Username (read-only) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Username</Text>
            <View style={[styles.inputWrap, styles.inputReadOnly]}>
              <Text style={styles.inputReadOnlyText}>@{user?.username ?? ''}</Text>
            </View>
            <Text style={styles.fieldHint}>Username cannot be changed</Text>
          </View>

          {/* Display name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Display Name</Text>
            <View
              style={[
                styles.inputWrap,
                focusedField === 'name' && styles.inputWrapFocused,
                name.trim().length < 2 && name.length > 0 ? styles.inputWrapError : null,
              ]}
            >
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={(v) => { setName(v); setError(''); }}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                placeholder="Your display name"
                placeholderTextColor={T.TEXT_3}
                maxLength={50}
                autoCorrect={false}
              />
            </View>
            <Text style={styles.charCount}>{name.length}/50</Text>
          </View>

          {/* Bio */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <View
              style={[
                styles.bioWrap,
                focusedField === 'bio' && styles.inputWrapFocused,
              ]}
            >
              <TextInput
                style={styles.bioInput}
                value={bio}
                onChangeText={(v) => { setBio(v); setError(''); }}
                onFocus={() => setFocusedField('bio')}
                onBlur={() => setFocusedField(null)}
                placeholder="Tell the community who you are…"
                placeholderTextColor={T.TEXT_3}
                multiline
                numberOfLines={4}
                maxLength={160}
                textAlignVertical="top"
              />
            </View>
            <Text style={styles.charCount}>{bio.length}/160</Text>
          </View>

          {/* Website */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Website</Text>
            <View
              style={[
                styles.inputWrap,
                focusedField === 'website' && styles.inputWrapFocused,
              ]}
            >
              <TextInput
                style={styles.input}
                value={website}
                onChangeText={setWebsite}
                onFocus={() => setFocusedField('website')}
                onBlur={() => setFocusedField(null)}
                placeholder="https://yourwebsite.com"
                placeholderTextColor={T.TEXT_3}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={100}
              />
            </View>
          </View>

          {/* Location */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Location</Text>
            <View
              style={[
                styles.inputWrap,
                focusedField === 'location' && styles.inputWrapFocused,
              ]}
            >
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                onFocus={() => setFocusedField('location')}
                onBlur={() => setFocusedField(null)}
                placeholder="City, Country"
                placeholderTextColor={T.TEXT_3}
                autoCorrect={false}
                maxLength={60}
              />
            </View>
          </View>

          {/* Birthday */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Birthday</Text>
            <View
              style={[
                styles.inputWrap,
                focusedField === 'birthday' && styles.inputWrapFocused,
              ]}
            >
              <TextInput
                style={styles.input}
                value={birthday}
                onChangeText={setBirthday}
                onFocus={() => setFocusedField('birthday')}
                onBlur={() => setFocusedField(null)}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={T.TEXT_3}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>
            <Text style={styles.fieldHint}>Not shown publicly unless enabled in Privacy Settings</Text>
          </View>

          {/* Gender */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.genderChip,
                    gender === opt && styles.genderChipActive,
                  ]}
                  onPress={() => setGender(opt)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.genderChipLabel,
                      gender === opt && styles.genderChipLabelActive,
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
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
  headerBtn: {
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
  saveBtn: {
    minWidth: 60,
    height: 36,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },

  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },

  avatarSection: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  changePhotoBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER_2,
  },
  changePhotoLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },

  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.ERROR,
    lineHeight: 18,
  },

  form: { gap: 20 },

  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
    marginBottom: 2,
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 2,
  },
  charCount: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'right',
    marginTop: 2,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 14,
    height: 46,
  },
  inputWrapFocused: { borderColor: INPUT_BORDER_FOCUSED },
  inputWrapError: { borderColor: INPUT_BORDER_ERROR },
  inputReadOnly: {
    backgroundColor: T.SURFACE_2,
    opacity: 0.7,
  },
  inputReadOnlyText: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    height: '100%',
    backgroundColor: 'transparent',
  },

  bioWrap: {
    backgroundColor: INPUT_BG,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 110,
  },
  bioInput: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    minHeight: 88,
    backgroundColor: 'transparent',
  },

  genderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  genderChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER_2,
  },
  genderChipActive: {
    backgroundColor: T.TEXT,
    borderColor: T.TEXT,
  },
  genderChipLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  genderChipLabelActive: {
    color: T.BG,
  },
});
