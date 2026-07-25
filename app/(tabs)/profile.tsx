import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  FileText,
  FilmStrip,
  Image as ImageIcon,
  Gear,
  ShareNetwork,
  X,
} from 'phosphor-react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsSkeletonCard } from '@/components/MsSkeletonCard';
import { MsPostCard } from '@/components/MsPostCard';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsActionSheet } from '@/components/MsActionSheet';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { toast } from '@/components/MsToast';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/services/api';
import { getUserPosts, getBookmarkedPosts, type Post } from '@/services/posts';

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

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
  const insets = useSafeAreaInsets();
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={epm.overlay} onPress={onClose}>
          <Pressable
            style={[epm.sheet, { paddingBottom: Math.max(insets.bottom + 8, 24) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={epm.handle} />
            <View style={epm.header}>
              <Text style={epm.title}>Edit Profile</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} style={epm.closeBtn}>
                <X size={18} color={T.TEXT_2} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 14 }}>
              <View style={{ gap: 6 }}>
                <Text style={epm.label}>Display Name</Text>
                <TextInput
                  style={epm.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your display name"
                  placeholderTextColor={T.TEXT_3}
                  maxLength={50}
                  autoFocus
                  autoCorrect={false}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={epm.label}>Bio</Text>
                <TextInput
                  style={[epm.input, { height: 88, paddingTop: 12, textAlignVertical: 'top' }]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell the community who you are…"
                  placeholderTextColor={T.TEXT_3}
                  multiline
                  maxLength={160}
                />
                <Text style={epm.hint}>{bio.length}/160</Text>
              </View>
              <View style={epm.buttons}>
                <TouchableOpacity style={epm.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                  <Text style={epm.cancelLabel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[epm.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving
                    ? <ActivityIndicator size="small" color={T.BG} />
                    : <Text style={epm.saveLabel}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const epm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'center', marginBottom: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 17, fontFamily: T.FONT.bold, color: T.TEXT },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  hint: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, textAlign: 'right' },
  input: {
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
  },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, height: 48, borderRadius: T.RADIUS.md, backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  saveBtn: { flex: 1, height: 48, borderRadius: T.RADIUS.md, backgroundColor: T.TEXT, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.BG },
});

const PROFILE_TABS = ['Posts', 'Media', 'Saved'] as const;
type ProfileTab = typeof PROFILE_TABS[number];

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={statStyles.wrap}>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}
const statStyles = StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1 },
  value: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.3 },
  label: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },
});

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Full-screen image viewer ─────────────────────────────────────────────────

function ImageViewer({
  uri,
  visible,
  onClose,
}: {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={viewerStyles.bg}>
        <TouchableOpacity style={viewerStyles.close} onPress={onClose} activeOpacity={0.8}>
          <X size={20} color="#fff" />
        </TouchableOpacity>
        {uri ? (
          <Image
            source={{ uri }}
            style={viewerStyles.img}
            resizeMode="contain"
          />
        ) : (
          <View style={viewerStyles.noPhoto}>
            <Text style={viewerStyles.noPhotoText}>No photo</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
const viewerStyles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  img: { width: '100%', height: '80%' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { color: 'rgba(255,255,255,0.4)', fontFamily: T.FONT.regular, fontSize: 15 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, refreshUser, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('Posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Edit Profile modal
  const [editProfileVisible, setEditProfileVisible] = useState(false);

  // Avatar interactions
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [removeAvatarConfirm, setRemoveAvatarConfirm] = useState(false);

  // Banner interactions
  const [bannerSheetVisible, setBannerSheetVisible] = useState(false);
  const [bannerViewerVisible, setBannerViewerVisible] = useState(false);
  const [removeBannerConfirm, setRemoveBannerConfirm] = useState(false);

  const gridItemSize = Math.floor((width - 2) / 3);

  const loadPosts = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getUserPosts(user.id);
      setPosts(data.posts);
    } catch {
      // ignore
    } finally {
      setLoadingPosts(false);
      setRefreshing(false);
    }
  }, [user]);

  const loadSavedPosts = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const data = await getBookmarkedPosts();
      setSavedPosts(data.posts);
    } catch {
      // ignore
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'Saved') loadSavedPosts();
  }, [activeTab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), loadPosts()]);
  };

  // ─── Avatar actions ───────────────────────────────────────────────────────

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      toast.error('Photo library access required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      // Optimistically update local user state
      if (user) updateUser({ ...user, avatarUrl: result.assets[0].uri });
      toast.success('Profile photo updated');
    }
  };

  const removeAvatar = () => {
    if (user) updateUser({ ...user, avatarUrl: null });
    toast.info('Profile photo removed');
  };

  const pickBanner = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      toast.error('Photo library access required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      if (user) updateUser({ ...user, bannerUrl: result.assets[0].uri });
      toast.success('Banner updated');
    }
  };

  const removeBanner = () => {
    if (user) updateUser({ ...user, bannerUrl: null });
    toast.info('Banner removed');
  };

  // ─── Save profile ─────────────────────────────────────────────────────────

  const handleSaveProfile = async (fields: { name: string; bio: string }) => {
    const token = await AsyncStorage.getItem('@ms_access_token');
    try {
      const updated = await apiFetch<{ user: typeof user }>('/users/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ name: fields.name, bio: fields.bio || null }),
      });
      if (updated?.user) updateUser(updated.user);
      else if (user) updateUser({ ...user, name: fields.name, bio: fields.bio || null });
    } catch {
      if (user) updateUser({ ...user, name: fields.name, bio: fields.bio || null });
    }
  };

  // ─── Share & copy ─────────────────────────────────────────────────────────

  const handleShareProfile = () => {
    Share.share({
      message: `Check out @${user?.username ?? 'me'} on MeetSweet!`,
      title: user?.name ?? 'MeetSweet Profile',
    }).catch(() => {});
  };

  const handleCopyUsername = () => {
    Share.share({ message: `@${user?.username ?? ''}` }).catch(() => {});
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
    : 'U';

  const mediaPosts = posts.filter((p) => !!p.mediaUrl);

  // ─── Tab content ──────────────────────────────────────────────────────────

  const tabContent = () => {
    if (activeTab === 'Posts') {
      if (loadingPosts) {
        return (
          <View style={styles.grid}>
            {Array.from({ length: 9 }).map((_, i) => (
              <MsSkeletonCard key={i} style={{ width: gridItemSize, height: gridItemSize }} radius={0} />
            ))}
          </View>
        );
      }
      if (posts.length === 0) {
        return (
          <MsEmptyState
            title="No posts yet"
            message="Tap the + button to share your first post with the world."
            actionLabel="Create post"
            onAction={() => router.push('/create-post')}
          />
        );
      }
      return (
        <View style={[styles.grid, { gap: 1, backgroundColor: T.BORDER }]}>
          {posts.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={{ width: gridItemSize, height: gridItemSize, backgroundColor: T.SURFACE }}
              activeOpacity={0.8}
              onPress={() => router.push(`/post/${p.id}`)}
            >
              {p.mediaUrl ? (
                <View style={{ flex: 1, backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center' }}>
                  {p.mediaType === 'video' ? <FilmStrip size={18} color={T.TEXT_3} /> : <ImageIcon size={18} color={T.TEXT_3} />}
                </View>
              ) : (
                <View style={{ flex: 1, backgroundColor: T.SURFACE, padding: 8 }}>
                  <Text style={{ color: T.TEXT_2, fontSize: 11, fontFamily: T.FONT.regular }} numberOfLines={4}>
                    {p.caption}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    if (activeTab === 'Media') {
      if (mediaPosts.length === 0) {
        return (
          <MsEmptyState
            title="No media yet"
            message="Post photos or videos to see them here."
          />
        );
      }
      return (
        <View style={[styles.grid, { gap: 1, backgroundColor: T.BORDER }]}>
          {mediaPosts.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={{ width: gridItemSize, height: gridItemSize, backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center' }}
              activeOpacity={0.8}
              onPress={() => router.push(`/post/${p.id}`)}
            >
              {p.mediaType === 'video' ? <FilmStrip size={18} color={T.TEXT_3} /> : <ImageIcon size={18} color={T.TEXT_3} />}
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    // Saved
    if (loadingSaved) {
      return (
        <View style={styles.grid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <MsSkeletonCard key={i} style={{ width: gridItemSize, height: gridItemSize }} radius={0} />
          ))}
        </View>
      );
    }
    if (savedPosts.length === 0) {
      return (
        <MsEmptyState
          title="No saved posts"
          message="Posts you bookmark will appear here."
        />
      );
    }
    return (
      <View style={[styles.grid, { gap: 1, backgroundColor: T.BORDER }]}>
        {savedPosts.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={{ width: gridItemSize, height: gridItemSize, backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.8}
            onPress={() => router.push(`/post/${p.id}`)}
          >
            {p.mediaType === 'video'
              ? <FilmStrip size={18} color={T.TEXT_3} />
              : p.mediaUrl
              ? <Camera size={18} color={T.TEXT_3} />
              : <FileText size={18} color={T.TEXT_3} />}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.TEXT} />
        }
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.topUsername}>@{user?.username ?? 'username'}</Text>
          <View style={styles.topActions}>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={handleShareProfile}>
              <ShareNetwork size={18} color={T.TEXT} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/settings')} activeOpacity={0.7}>
              <Gear size={18} color={T.TEXT} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Cover / Banner */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setBannerSheetVisible(true)}
          onLongPress={() => setBannerSheetVisible(true)}
          delayLongPress={400}
        >
          <View
            style={[
              styles.cover,
              user?.bannerUrl ? { backgroundColor: T.SURFACE_2 } : {},
            ]}
          >
            {user?.bannerUrl ? (
              <Image source={{ uri: user.bannerUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            ) : (
              <View style={styles.coverEmpty}>
                <Camera size={20} color={T.TEXT_3} />
                <Text style={styles.coverHint}>Tap to set banner</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Avatar + action buttons row */}
        <View style={styles.avatarRow}>
          <TouchableOpacity
            style={styles.avatarBorder}
            onPress={() => {
              if (user?.avatarUrl) setAvatarViewerVisible(true);
              else setAvatarSheetVisible(true);
            }}
            onLongPress={() => setAvatarSheetVisible(true)}
            delayLongPress={400}
            activeOpacity={0.85}
          >
            <MsAvatar size={82} initials={initials} imageUri={user?.avatarUrl ?? undefined} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={[styles.profileActions, { paddingBottom: 6 }]}>
            <TouchableOpacity
              style={styles.editBtn}
              activeOpacity={0.8}
              onPress={() => setEditProfileVisible(true)}
            >
              <Text style={styles.editLabel}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* User info */}
        <View style={styles.userInfo}>
          <Text style={styles.displayName}>{user?.name ?? 'Display Name'}</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onLongPress={handleCopyUsername}
            delayLongPress={400}
          >
            <Text style={styles.handle}>@{user?.username ?? 'username'}</Text>
          </TouchableOpacity>
          {!!user?.bio && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setEditProfileVisible(true)}
            >
              <Text style={styles.bio}>{user.bio}</Text>
            </TouchableOpacity>
          )}
          {!user?.bio && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setEditProfileVisible(true)}
            >
              <Text style={styles.addBio}>+ Add bio</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatItem label="Followers" value={formatCount(user?.followerCount ?? 0)} />
          <View style={styles.statsDivider} />
          <StatItem label="Following" value={formatCount(user?.followingCount ?? 0)} />
          <View style={styles.statsDivider} />
          <StatItem label="Posts" value={formatCount(user?.postCount ?? 0)} />
        </View>

        {/* Content tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.contentTabsScroll}
          contentContainerStyle={styles.contentTabsRow}
        >
          {PROFILE_TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.contentTab, isActive && styles.contentTabActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.contentTabLabel, isActive && styles.contentTabLabelActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {tabContent()}
      </ScrollView>

      {/* Avatar action sheet */}
      <MsActionSheet
        visible={avatarSheetVisible}
        title="Profile Photo"
        actions={[
          {
            label: 'View Photo',
            onPress: () => {
              if (user?.avatarUrl) setAvatarViewerVisible(true);
              else toast.info('No photo set');
            },
          },
          { label: 'Change Photo', onPress: pickAvatar },
          ...(user?.avatarUrl
            ? [{ label: 'Remove Photo', destructive: true as const, onPress: () => setRemoveAvatarConfirm(true) }]
            : []),
        ]}
        onClose={() => setAvatarSheetVisible(false)}
      />

      {/* Banner action sheet */}
      <MsActionSheet
        visible={bannerSheetVisible}
        title="Banner"
        actions={[
          {
            label: 'View Banner',
            onPress: () => {
              if (user?.bannerUrl) setBannerViewerVisible(true);
              else toast.info('No banner set');
            },
          },
          { label: 'Change Banner', onPress: pickBanner },
          ...(user?.bannerUrl
            ? [{ label: 'Remove Banner', destructive: true as const, onPress: () => setRemoveBannerConfirm(true) }]
            : []),
        ]}
        onClose={() => setBannerSheetVisible(false)}
      />

      {/* Remove avatar confirmation */}
      <MsConfirmDialog
        visible={removeAvatarConfirm}
        title="Remove Profile Photo"
        message="Your profile photo will be removed."
        confirmLabel="Remove"
        destructive
        onConfirm={removeAvatar}
        onCancel={() => setRemoveAvatarConfirm(false)}
      />

      {/* Remove banner confirmation */}
      <MsConfirmDialog
        visible={removeBannerConfirm}
        title="Remove Banner"
        message="Your banner photo will be removed."
        confirmLabel="Remove"
        destructive
        onConfirm={removeBanner}
        onCancel={() => setRemoveBannerConfirm(false)}
      />

      {/* Full-screen avatar viewer */}
      <ImageViewer
        uri={user?.avatarUrl ?? null}
        visible={avatarViewerVisible}
        onClose={() => setAvatarViewerVisible(false)}
      />

      {/* Full-screen banner viewer */}
      <ImageViewer
        uri={user?.bannerUrl ?? null}
        visible={bannerViewerVisible}
        onClose={() => setBannerViewerVisible(false)}
      />

      {/* Edit Profile modal */}
      <EditProfileModal
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
        user={user}
        onSave={handleSaveProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: T.BG },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topUsername: { fontSize: 16, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.2 },
  topActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cover: { height: 130, backgroundColor: T.SURFACE, overflow: 'hidden' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  coverHint: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_3 },

  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    marginTop: -42,
    gap: 12,
  },
  avatarBorder: {
    borderWidth: 3,
    borderColor: T.BG,
    borderRadius: 44,
    overflow: 'hidden',
  },
  profileActions: { alignItems: 'flex-end' },
  editBtn: {
    paddingHorizontal: 20,
    height: 34,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLabel: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },

  userInfo: { paddingHorizontal: 20, paddingTop: 14, gap: 4 },
  displayName: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.3 },
  handle: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  bio: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 21,
    marginTop: 6,
  },
  addBio: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
    marginTop: 4,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  statsDivider: { width: 1, height: 28, backgroundColor: T.BORDER_2 },

  contentTabsScroll: { borderBottomWidth: 1, borderBottomColor: T.BORDER },
  contentTabsRow: { paddingHorizontal: 16 },
  contentTab: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  contentTabActive: { borderBottomColor: T.TEXT },
  contentTabLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  contentTabLabelActive: { color: T.TEXT, fontFamily: T.FONT.semibold },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
