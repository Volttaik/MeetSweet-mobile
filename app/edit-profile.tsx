import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera } from 'phosphor-react-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/services/api';
import { uploadMedia } from '@/services/media';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NAME_CHANGE_KEY = '@ms_last_name_change';
const NAME_COOLDOWN_DAYS = 30;

function daysUntilNameChange(lastChanged: string | null): number {
  if (!lastChanged) return 0;
  const diff = Date.now() - new Date(lastChanged).getTime();
  const daysPassed = diff / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(NAME_COOLDOWN_DAYS - daysPassed));
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();

  const [name, setName]           = useState(user?.name ?? '');
  const [bio, setBio]             = useState(user?.bio ?? '');
  const [website, setWebsite]     = useState((user as any)?.website ?? '');
  const [location, setLocation]   = useState((user as any)?.location ?? '');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [focusedField, setFocused]= useState<string | null>(null);
  const [lastNameChange, setLastNameChange] = useState<string | null>(null);
  const nameCooldownDays = daysUntilNameChange(lastNameChange);
  const nameIsLocked = nameCooldownDays > 0;

  // Local preview URIs for newly picked images (not yet uploaded)
  const [avatarUri, setAvatarUri]   = useState<string | null>(null);
  const [bannerUri, setBannerUri]   = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setBio(user.bio ?? '');
      setWebsite((user as any)?.website ?? '');
      setLocation((user as any)?.location ?? '');
    }
    AsyncStorage.getItem(NAME_CHANGE_KEY).then(setLastNameChange).catch(() => {});
  }, [user?.id]);

  const initials = name.trim()
    ? name.trim().split(' ').map((w: string) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
    : (user?.username?.[0]?.toUpperCase() ?? 'U');

  // ─── Photo pickers ───────────────────────────────────────────────────────

  const pickAvatar = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow access to your photo library to change your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    setAvatarUri(asset.uri);
    setUploadingAvatar(true);
    try {
      const mime = asset.mimeType ?? 'image/jpeg';
      const name = asset.fileName ?? `avatar-${Date.now()}.jpg`;
      const uploaded = await uploadMedia(asset.uri, mime, name);

      const token = await AsyncStorage.getItem('@ms_access_token');
      if (token) {
        await apiFetch('/users/me', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatar_url: uploaded.url }),
        }).catch(() => {});
      }

      if (user) updateUser({ ...user, avatarUrl: uploaded.url });
    } catch (err) {
      Alert.alert('Upload failed', (err as Error).message ?? 'Could not upload photo.');
      setAvatarUri(null);
    } finally {
      setUploadingAvatar(false);
    }
  }, [user, updateUser]);

  const pickBanner = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow access to your photo library to change your cover photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    setBannerUri(asset.uri);
    setUploadingBanner(true);
    try {
      const mime = asset.mimeType ?? 'image/jpeg';
      const name = asset.fileName ?? `banner-${Date.now()}.jpg`;
      const uploaded = await uploadMedia(asset.uri, mime, name);

      const token = await AsyncStorage.getItem('@ms_access_token');
      if (token) {
        await apiFetch('/users/me', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ banner_url: uploaded.url }),
        }).catch(() => {});
      }

      if (user) updateUser({ ...user, bannerUrl: uploaded.url } as any);
    } catch (err) {
      Alert.alert('Upload failed', (err as Error).message ?? 'Could not upload cover photo.');
      setBannerUri(null);
    } finally {
      setUploadingBanner(false);
    }
  }, [user, updateUser]);

  // ─── Save text fields ────────────────────────────────────────────────────

  const hasChanges =
    name.trim() !== (user?.name ?? '') ||
    bio.trim()  !== (user?.bio  ?? '') ||
    website.trim() !== ((user as any)?.website ?? '') ||
    location.trim() !== ((user as any)?.location ?? '');

  const handleSave = async () => {
    if (!name.trim() || name.trim().length < 2) {
      setError('Display name must be at least 2 characters');
      return;
    }
    // Enforce 30-day name change cooldown
    const nameChanged = name.trim() !== (user?.name ?? '');
    if (nameChanged && nameIsLocked) {
      setError(`You can change your name in ${nameCooldownDays} day${nameCooldownDays === 1 ? '' : 's'}`);
      return;
    }
    if (!hasChanges) { router.back(); return; }

    setError('');
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('@ms_access_token');
      if (!token) throw new Error('Not authenticated');

      const raw = await apiFetch<unknown>('/users/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name:     name.trim(),
          bio:      bio.trim()      || null,
          website:  website.trim()  || null,
          location: location.trim() || null,
        }),
      });

      // Record name change timestamp
      if (nameChanged) {
        const now = new Date().toISOString();
        await AsyncStorage.setItem(NAME_CHANGE_KEY, now);
        setLastNameChange(now);
      }

      if (user) {
        const updated = (raw as any)?.user ?? raw as any;
        updateUser({
          ...user,
          name:     updated?.full_name ?? name.trim(),
          bio:      updated?.bio       ?? (bio.trim() || null),
        });
      }
      router.back();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const displayBannerUri = bannerUri ?? (user as any)?.bannerUrl ?? null;
  const displayAvatarUri = avatarUri ?? user?.avatarUrl ?? null;

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
          style={[styles.saveBtn, (saving || uploadingAvatar || uploadingBanner) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || uploadingAvatar || uploadingBanner}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color={T.BG} />
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
        {/* ── Banner / Cover photo ─────────────────────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={pickBanner}
          style={styles.bannerWrap}
        >
          {displayBannerUri ? (
            <Image source={{ uri: displayBannerUri }} style={styles.bannerImg} resizeMode="cover" />
          ) : (
            <View style={styles.bannerPlaceholder} />
          )}

          {/* overlay */}
          <View style={styles.bannerOverlay}>
            {uploadingBanner ? (
              <ActivityIndicator size="small" color={T.TEXT} />
            ) : (
              <>
                <Camera size={18} color={T.TEXT} />
                <Text style={styles.bannerOverlayLabel}>
                  {displayBannerUri ? 'Change Cover' : 'Add Cover Photo'}
                </Text>
              </>
            )}
          </View>
        </TouchableOpacity>

        {/* ── Avatar ──────────────────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={pickAvatar}
            style={styles.avatarWrap}
          >
            <MsAvatar
              size={88}
              initials={initials}
              imageUri={displayAvatarUri ?? undefined}
            />
            <View style={styles.avatarCameraBtn}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={T.TEXT} />
              ) : (
                <Camera size={14} color={T.TEXT} />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.7} onPress={pickAvatar} style={styles.changePhotoBtn}>
            <Text style={styles.changePhotoLabel}>
              {uploadingAvatar ? 'Uploading…' : 'Change Profile Photo'}
            </Text>
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
                nameIsLocked && styles.inputReadOnly,
                !nameIsLocked && focusedField === 'name' && styles.inputWrapFocused,
                !nameIsLocked && name.trim().length < 2 && name.length > 0 ? styles.inputWrapError : null,
              ]}
            >
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={(v) => { if (!nameIsLocked) { setName(v); setError(''); } }}
                onFocus={() => { if (!nameIsLocked) setFocused('name'); }}
                onBlur={() => setFocused(null)}
                placeholder="Your display name"
                placeholderTextColor={T.TEXT_3}
                maxLength={50}
                autoCorrect={false}
                editable={!nameIsLocked}
              />
            </View>
            {nameIsLocked ? (
              <Text style={[styles.fieldHint, { color: T.TEXT_2 }]}>
                You can change your name in {nameCooldownDays} day{nameCooldownDays === 1 ? '' : 's'}
              </Text>
            ) : (
              <Text style={styles.charCount}>{name.length}/50</Text>
            )}
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
                onFocus={() => setFocused('bio')}
                onBlur={() => setFocused(null)}
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
                onFocus={() => setFocused('website')}
                onBlur={() => setFocused(null)}
                placeholder="https://yoursite.com"
                placeholderTextColor={T.TEXT_3}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
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
                onFocus={() => setFocused('location')}
                onBlur={() => setFocused(null)}
                placeholder="City, Country"
                placeholderTextColor={T.TEXT_3}
                maxLength={60}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const INPUT_BG     = '#1A1628';
const INPUT_BORDER = '#2E2850';

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0D0B1A' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#1A1628',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  saveBtn: {
    minWidth: 62,
    height: 34,
    borderRadius: 50,
    backgroundColor: '#FF4473',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF',
  },

  scrollContent: { paddingBottom: 48 },

  // Banner
  bannerWrap: {
    height: 130,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerImg: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    flex: 1,
    backgroundColor: '#251F40',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  bannerOverlayLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF',
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    gap: 10,
    marginTop: -44,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  avatarWrap: {
    position: 'relative',
    borderWidth: 3,
    borderColor: '#0D0B1A',
    borderRadius: 48,
  },
  avatarCameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FF4473',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0D0B1A',
  },
  changePhotoBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 50,
    backgroundColor: '#1A1628',
    borderWidth: 0,
  },
  changePhotoLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: '#FF4473',
  },

  // Error
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: '#EF4444',
    lineHeight: 18,
  },

  form: { gap: 20, paddingHorizontal: 20 },

  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 2,
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.28)',
    marginTop: 2,
  },
  charCount: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.28)',
    textAlign: 'right',
    marginTop: 2,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 50,
    borderWidth: 0,
    paddingHorizontal: 16,
    height: 46,
  },
  inputWrapFocused: { backgroundColor: '#251F40' },
  inputWrapError:   { backgroundColor: 'rgba(239,68,68,0.08)' },
  inputReadOnly: {
    backgroundColor: 'rgba(37,31,64,0.6)',
    opacity: 0.7,
  },
  inputReadOnlyText: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.55)',
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: '#FFFFFF',
    height: '100%',
    backgroundColor: 'transparent',
  },

  bioWrap: {
    backgroundColor: INPUT_BG,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 110,
  },
  bioInput: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: '#FFFFFF',
    minHeight: 88,
    backgroundColor: 'transparent',
  },
});
