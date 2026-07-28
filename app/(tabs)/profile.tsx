import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  Gear,
  LockSimple,
  Play,
  ShareNetwork,
  X,
} from 'phosphor-react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsSkeletonCard } from '@/components/MsSkeletonCard';
import { MsPostCard } from '@/components/MsPostCard';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsActionSheet } from '@/components/MsActionSheet';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { toast } from '@/components/MsToast';
import { useAuth } from '@/contexts/AuthContext';
import { usePostActions } from '@/contexts/PostActionsContext';
import { uploadMedia } from '@/services/media';
import { updateMe } from '@/services/users';
import {
  getPostsByCreator,
  getBookmarkedPosts,
  getPost,
  editPost,
  deletePost,
  type Post,
} from '@/services/posts';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_TABS = ['Posts', 'Media', 'Saved'] as const;
type ProfileTab = typeof PROFILE_TABS[number];

const VISIBILITY_OPTIONS = [
  { value: 'public' as const,      label: 'Public',      description: 'Visible to everyone' },
  { value: 'subscribers' as const, label: 'Subscribers', description: 'Subscribers only' },
  { value: 'draft' as const,       label: 'Draft',       description: 'Only you' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── StatItem ─────────────────────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={statStyles.wrap}>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  wrap:  { alignItems: 'center', flex: 1 },
  value: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.3 },
  label: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },
});

// ─── EditProfileModal ─────────────────────────────────────────────────────────

function EditProfileModal({
  visible,
  onClose,
  name: initialName,
  bio: initialBio,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  name: string;
  bio: string;
  onSave: (fields: { name: string; bio: string }) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setName(initialName); setBio(initialBio); }
  }, [visible, initialName, initialBio]);

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={epm.overlay} onPress={onClose}>
          <Pressable style={[epm.sheet, { paddingBottom: Math.max(insets.bottom + 8, 24) }]} onPress={(e) => e.stopPropagation()}>
            <View style={epm.handle} />
            <View style={epm.header}>
              <Text style={epm.title}>Edit Profile</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}><Text style={epm.closeLabel}>Cancel</Text></TouchableOpacity>
            </View>
            <View style={epm.fields}>
              <View style={epm.field}>
                <Text style={epm.label}>Display Name</Text>
                <TextInput style={epm.input} value={name} onChangeText={setName} placeholder="Your display name" placeholderTextColor={T.TEXT_3} maxLength={50} autoFocus autoCorrect={false} />
              </View>
              <View style={epm.field}>
                <Text style={epm.label}>Bio</Text>
                <TextInput style={[epm.input, epm.bioInput]} value={bio} onChangeText={setBio} placeholder="Tell the community who you are…" placeholderTextColor={T.TEXT_3} multiline maxLength={160} textAlignVertical="top" />
                <Text style={epm.hint}>{bio.length}/160</Text>
              </View>
              <View style={epm.buttons}>
                <TouchableOpacity style={epm.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                  <Text style={epm.cancelLabel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[epm.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
                  {saving ? <ActivityIndicator size="small" color={T.BG} /> : <Text style={epm.saveLabel}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── EditPostSheet ────────────────────────────────────────────────────────────

function EditPostSheet({
  visible,
  post,
  onClose,
  onSaved,
}: {
  visible: boolean;
  post: Post | null;
  onClose: () => void;
  onSaved: (updated: Pick<Post, 'id' | 'caption' | 'visibility'>) => void;
}) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'subscribers' | 'draft'>('public');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && post) {
      setCaption(post.caption ?? '');
      setVisibility(post.visibility);
    }
  }, [visible, post]);

  const handleSave = async () => {
    if (!post) return;
    setSaving(true);
    try {
      await editPost(post.id, { caption: caption.trim(), visibility });
      onSaved({ id: post.id, caption: caption.trim(), visibility });
      onClose();
      toast.success('Post updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={epm.overlay} onPress={onClose}>
          <Pressable style={[epm.sheet, { paddingBottom: Math.max(insets.bottom + 8, 24) }]} onPress={(e) => e.stopPropagation()}>
            <View style={epm.handle} />
            <View style={epm.header}>
              <Text style={epm.title}>Edit Post</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}><X size={18} color={T.TEXT_2} /></TouchableOpacity>
            </View>

            {/* Caption */}
            <View style={epm.field}>
              <Text style={epm.label}>Caption</Text>
              <TextInput
                style={[epm.input, epm.bioInput]}
                value={caption}
                onChangeText={setCaption}
                placeholder="What's this post about?"
                placeholderTextColor={T.TEXT_3}
                multiline
                maxLength={2200}
                textAlignVertical="top"
              />
              <Text style={epm.hint}>{caption.length}/2200</Text>
            </View>

            {/* Visibility */}
            <View style={[epm.field, { marginTop: 12 }]}>
              <Text style={epm.label}>Visibility</Text>
              <View style={{ gap: 6, marginTop: 4 }}>
                {VISIBILITY_OPTIONS.map((opt) => {
                  const active = opt.value === visibility;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[eps.visOpt, active && eps.visOptActive]}
                      onPress={() => setVisibility(opt.value)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[eps.visLabel, active && eps.visLabelActive]}>{opt.label}</Text>
                        <Text style={eps.visDesc}>{opt.description}</Text>
                      </View>
                      <View style={[eps.radio, active && eps.radioActive]}>
                        {active && <View style={eps.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[epm.buttons, { marginTop: 16 }]}>
              <TouchableOpacity style={epm.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={epm.cancelLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[epm.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
                {saving ? <ActivityIndicator size="small" color={T.BG} /> : <Text style={epm.saveLabel}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const eps = StyleSheet.create({
  visOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    gap: 12,
  },
  visOptActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  visLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  visLabelActive: { color: T.TEXT },
  visDesc: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 1 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: T.TEXT_3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: T.TEXT },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.TEXT },
});

// ─── AnalyticsSheet ───────────────────────────────────────────────────────────

function AnalyticsSheet({
  visible,
  post,
  onClose,
}: {
  visible: boolean;
  post: Post | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [freshPost, setFreshPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && post) {
      setFreshPost(null);
      setLoading(true);
      getPost(post.id)
        .then(({ post: p }) => setFreshPost(p))
        .catch(() => setFreshPost(post))
        .finally(() => setLoading(false));
    }
  }, [visible, post?.id]);

  const data = freshPost ?? post;

  const stats = data
    ? [
        { label: 'Likes',    value: data.likeCount,     icon: '❤️' },
        { label: 'Comments', value: data.commentCount,   icon: '💬' },
        { label: 'Saves',    value: data.bookmarkCount,  icon: '🔖' },
      ]
    : [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={epm.overlay} onPress={onClose}>
        <Pressable style={[epm.sheet, { paddingBottom: Math.max(insets.bottom + 8, 32) }]} onPress={(e) => e.stopPropagation()}>
          <View style={epm.handle} />
          <View style={epm.header}>
            <Text style={epm.title}>Post Analytics</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}><X size={18} color={T.TEXT_2} /></TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator color={T.TEXT} />
              <Text style={{ color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13, marginTop: 12 }}>Loading stats…</Text>
            </View>
          ) : (
            <>
              {data?.caption ? (
                <Text style={ans.caption} numberOfLines={2}>{data.caption}</Text>
              ) : null}

              <View style={ans.statsGrid}>
                {stats.map((s) => (
                  <View key={s.label} style={ans.statCard}>
                    <Text style={ans.statEmoji}>{s.icon}</Text>
                    <Text style={ans.statValue}>{formatCount(s.value)}</Text>
                    <Text style={ans.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={ans.note}>
                Stats reflect data returned by the server. View counts and share metrics will appear when your backend supports them.
              </Text>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ans = StyleSheet.create({
  caption: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    marginBottom: 16,
    lineHeight: 19,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.lg,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  statEmoji: { fontSize: 22 },
  statValue:  { fontSize: 20, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.5 },
  statLabel:  { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  note: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    lineHeight: 16,
    textAlign: 'center',
  },
});

// ─── ImageViewer ──────────────────────────────────────────────────────────────

function ImageViewer({ uri, visible, onClose }: { uri: string | null; visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={viewerStyles.bg}>
        <TouchableOpacity style={viewerStyles.close} onPress={onClose} activeOpacity={0.8}>
          <Text style={viewerStyles.closeLabel}>×</Text>
        </TouchableOpacity>
        {uri ? (
          <MsMediaLoader uri={uri} style={viewerStyles.image} resizeMode="contain" accessibleLabel="Profile photo" />
        ) : (
          <Text style={viewerStyles.noPhoto}>No photo</Text>
        )}
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, refreshUser, updateUser } = useAuth();
  const { markDeleted } = usePostActions();

  // Tab state
  const [activeTab,    setActiveTab]    = useState<ProfileTab>('Posts');
  const [posts,        setPosts]        = useState<Post[]>([]);
  const [savedPosts,   setSavedPosts]   = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);

  // Profile photo UI
  const [avatarSheetVisible,  setAvatarSheetVisible]  = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [removeAvatarConfirm, setRemoveAvatarConfirm] = useState(false);
  const [bannerSheetVisible,  setBannerSheetVisible]  = useState(false);
  const [bannerViewerVisible, setBannerViewerVisible] = useState(false);
  const [removeBannerConfirm, setRemoveBannerConfirm] = useState(false);

  // Edit profile modal
  const [editProfileVisible, setEditProfileVisible] = useState(false);

  // Post actions
  const [actionPost,          setActionPost]          = useState<Post | null>(null);
  const [postActionSheet,     setPostActionSheet]     = useState(false);
  const [analyticsSheet,      setAnalyticsSheet]      = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleting,            setDeleting]            = useState(false);

  const gridItemSize = Math.floor((width - 2) / 3);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadPosts = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getPostsByCreator(user.id);
      setPosts(data.posts);
    } catch {
      // show empty state
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
      // show empty state
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => { loadPosts(); }, [user?.id]);
  useEffect(() => { if (activeTab === 'Saved') loadSavedPosts(); }, [activeTab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), loadPosts()]);
  };

  // ── Profile photo ───────────────────────────────────────────────────────────

  const pickPhoto = async (kind: 'avatar' | 'banner') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { toast.error('Photo library access required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'avatar' ? [1, 1] : [3, 1],
      quality: 0.85,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset || !user) return;
    try {
      const uploaded = await uploadMedia(asset.uri, asset.mimeType ?? 'image/jpeg', asset.fileName ?? `${kind}-${Date.now()}.jpg`);
      const { user: updated } = await updateMe(kind === 'avatar' ? { avatarUrl: uploaded.url } : { bannerUrl: uploaded.url });
      updateUser(updated);
      toast.success(kind === 'avatar' ? 'Profile photo updated' : 'Banner updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Photo upload failed');
    }
  };

  const removePhoto = async (kind: 'avatar' | 'banner') => {
    if (!user) return;
    try {
      const { user: updated } = await updateMe(kind === 'avatar' ? { avatarUrl: null } : { bannerUrl: null });
      updateUser(updated);
      toast.success(kind === 'avatar' ? 'Profile photo removed' : 'Banner removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove photo');
    }
  };

  const handleSaveProfile = async (fields: { name: string; bio: string }) => {
    const { user: updated } = await updateMe({ name: fields.name, bio: fields.bio || null });
    updateUser(updated);
  };

  const handleShareProfile = () => {
    Share.share({
      message: `Check out @${user?.username ?? 'me'} on MeetSweet!\nhttps://meetsweet.app/@${user?.username ?? ''}`,
      title: user?.name ?? 'MeetSweet Profile',
    }).catch(() => {});
  };

  // ── Post actions ────────────────────────────────────────────────────────────

  const openPostActions = (post: Post) => {
    setActionPost(post);
    setPostActionSheet(true);
  };

  const handleDeletePost = async () => {
    if (!actionPost) return;
    setDeleting(true);
    try {
      await deletePost(actionPost.id);
      // Propagate deletion to every screen via context
      markDeleted(actionPost.id);
      setPosts((prev) => prev.filter((p) => p.id !== actionPost.id));
      setSavedPosts((prev) => prev.filter((p) => p.id !== actionPost.id));
      setDeleteConfirmVisible(false);
      setActionPost(null);
      toast.success('Post deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete post');
    } finally {
      setDeleting(false);
    }
  };

  const handlePostEdited = (updated: Pick<Post, 'id' | 'caption' | 'visibility'>) => {
    setPosts((prev) =>
      prev.map((p) => p.id === updated.id ? { ...p, caption: updated.caption, visibility: updated.visibility } : p)
    );
    setSavedPosts((prev) =>
      prev.map((p) => p.id === updated.id ? { ...p, caption: updated.caption, visibility: updated.visibility } : p)
    );
    setActionPost(null);
  };

  const handlePostDeleted = (id: string) => {
    markDeleted(id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setSavedPosts((prev) => prev.filter((p) => p.id !== id));
  };

  // ── Grid tile (Media tab) ───────────────────────────────────────────────────

  const GridTile = useCallback(({ item }: { item: Post }) => {
    const isOwn = Boolean(user && user.id === item.author.id);
    const isVideo = item.mediaType === 'video';
    const isLocked = Boolean(item.isLocked);

    const handlePress = () => {
      if (item.mediaUrl) {
        router.push({
          pathname: '/post-media',
          params: {
            uri: item.mediaUrl,
            type: item.mediaType ?? 'image',
            postId: item.id,
            ...(item.width && item.height ? { aspectRatio: String(item.width / item.height) } : {}),
          },
        });
      } else {
        router.push(`/post/${item.id}`);
      }
    };

    return (
      <TouchableOpacity
        style={{ width: gridItemSize, height: gridItemSize, backgroundColor: T.SURFACE }}
        activeOpacity={0.8}
        onPress={handlePress}
        onLongPress={isOwn ? () => openPostActions(item) : undefined}
        delayLongPress={400}
      >
        {item.mediaUrl ? (
          <MsMediaLoader
            uri={item.mediaUrl}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            accessibleLabel="Post media"
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: T.SURFACE, padding: 8, justifyContent: 'center' }}>
            <Text style={{ color: T.TEXT_2, fontSize: 11, fontFamily: T.FONT.regular }} numberOfLines={4}>
              {item.caption}
            </Text>
          </View>
        )}

        {/* Video overlay — play icon + duration */}
        {isVideo && (
          <View style={styles.videoOverlay}>
            <View style={styles.videoPlayBadge}>
              <Play size={9} color="#fff" weight="fill" />
            </View>
            {item.durationSecs != null && (
              <Text style={styles.videoDuration}>{formatDuration(item.durationSecs)}</Text>
            )}
          </View>
        )}

        {/* Premium lock badge */}
        {isLocked && (
          <View style={styles.lockBadge}>
            <LockSimple size={10} color="#fff" weight="bold" />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [user, gridItemSize]);

  // ── Tab content ─────────────────────────────────────────────────────────────

  const tabContent = () => {
    // Posts tab — full MsPostCard rendering like everywhere else
    if (activeTab === 'Posts') {
      if (loadingPosts) {
        return (
          <View style={{ gap: 1 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <MsSkeletonCard key={i} style={{ height: 200 }} radius={0} />
            ))}
          </View>
        );
      }
      if (posts.length === 0) {
        return (
          <MsEmptyState
            title="No posts yet"
            message="Tap the + button to share your first post."
            actionLabel="Create post"
            onAction={() => router.push('/create-post')}
          />
        );
      }
      return (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <MsPostCard
              post={item}
              currentUserId={user?.id}
              onPress={() => router.push(`/post/${item.id}`)}
              onMediaPress={
                item.mediaUrl
                  ? () =>
                      router.push({
                        pathname: '/post-media',
                        params: {
                          uri: item.mediaUrl!,
                          type: item.mediaType ?? 'image',
                          postId: item.id,
                          ...(item.width && item.height ? { aspectRatio: String(item.width / item.height) } : {}),
                        },
                      })
                  : undefined
              }
              onAuthorPress={() => {}}
              onDeleted={handlePostDeleted}
              onEditPress={(post) => {
                router.push(`/edit-post/${post.id}`);
              }}
              onAnalyticsPress={(post) => {
                setActionPost(post);
                setAnalyticsSheet(true);
              }}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: T.BORDER }} />}
        />
      );
    }

    // Media tab — grid of thumbnails with MsMediaLoader
    if (activeTab === 'Media') {
      const mediaPosts = posts.filter((p) => !!p.mediaUrl);
      if (loadingPosts) {
        return (
          <View style={styles.grid}>
            {Array.from({ length: 9 }).map((_, i) => (
              <MsSkeletonCard key={i} style={{ width: gridItemSize, height: gridItemSize }} radius={0} />
            ))}
          </View>
        );
      }
      if (mediaPosts.length === 0) {
        return <MsEmptyState title="No media yet" message="Post photos or videos to see them here." />;
      }
      return (
        <View style={[styles.grid, { gap: 1, backgroundColor: T.BORDER }]}>
          {mediaPosts.map((p) => <GridTile key={p.id} item={p} />)}
        </View>
      );
    }

    // Saved tab — full card rendering
    if (loadingSaved) {
      return (
        <View style={{ gap: 1 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <MsSkeletonCard key={i} style={{ height: 200 }} radius={0} />
          ))}
        </View>
      );
    }
    if (savedPosts.length === 0) {
      return <MsEmptyState title="No saved posts" message="Posts you bookmark will appear here." />;
    }
    return (
      <FlatList
        data={savedPosts}
        keyExtractor={(p) => p.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <MsPostCard
            post={item}
            currentUserId={user?.id}
            onPress={() => router.push(`/post/${item.id}`)}
            onMediaPress={
              item.mediaUrl
                ? () =>
                    router.push({
                      pathname: '/post-media',
                      params: {
                        uri: item.mediaUrl!,
                        type: item.mediaType ?? 'image',
                        postId: item.id,
                      },
                    })
                : undefined
            }
            onDeleted={handlePostDeleted}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: T.BORDER }} />}
      />
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
    : 'U';

  const bannerUrl = user?.bannerUrl ?? null;

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.ACCENT} />
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

        {/* Banner — uses shared MsMediaLoader with shimmer + fade */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => setBannerSheetVisible(true)}>
          {bannerUrl ? (
            <MsMediaLoader
              uri={bannerUrl}
              style={styles.cover}
              resizeMode="cover"
              accessibleLabel="Profile banner"
            />
          ) : (
            <View style={[styles.cover, { backgroundColor: T.SURFACE }]}>
              <Camera size={20} color={T.TEXT_3} />
            </View>
          )}
        </TouchableOpacity>

        {/* Avatar row */}
        <View style={styles.avatarRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => { if (user?.avatarUrl) setAvatarViewerVisible(true); else setAvatarSheetVisible(true); }}
            onLongPress={() => setAvatarSheetVisible(true)}
            delayLongPress={400}
            style={styles.avatarBorder}
          >
            <MsAvatar size={82} initials={initials} imageUri={user?.avatarUrl ?? undefined} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={[styles.profileActions, { paddingBottom: 6 }]}>
            <TouchableOpacity style={styles.editBtn} activeOpacity={0.8} onPress={() => setEditProfileVisible(true)}>
              <Text style={styles.editLabel}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* User info */}
        <View style={styles.userInfo}>
          <Text style={styles.displayName}>{user?.name ?? 'Display Name'}</Text>
          <Text style={styles.handle}>@{user?.username ?? 'username'}</Text>
          {!!user?.bio && <Text style={styles.bio}>{user.bio}</Text>}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatItem label="Followers" value={formatCount(user?.followerCount ?? 0)} />
          <View style={styles.statsDivider} />
          <StatItem label="Following" value={formatCount(user?.followingCount ?? 0)} />
          <View style={styles.statsDivider} />
          <StatItem label="Posts"     value={formatCount(user?.postCount ?? 0)} />
        </View>

        {/* Content tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.contentTabsScroll} contentContainerStyle={styles.contentTabsRow}>
          {PROFILE_TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.contentTab, isActive && styles.contentTabActive]} activeOpacity={0.7}>
                <Text style={[styles.contentTabLabel, isActive && styles.contentTabLabelActive]}>{tab}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {tabContent()}
      </ScrollView>

      {/* ── Avatar sheet + confirm ───────────────────────────────────────── */}
      <MsActionSheet
        visible={avatarSheetVisible}
        title="Profile Photo"
        actions={[
          { label: 'View Photo', onPress: () => { if (user?.avatarUrl) setAvatarViewerVisible(true); else toast.info('No photo set'); } },
          { label: 'Change Photo', onPress: () => pickPhoto('avatar') },
          ...(user?.avatarUrl ? [{ label: 'Remove Photo', destructive: true, onPress: () => setRemoveAvatarConfirm(true) }] : []),
        ]}
        onClose={() => setAvatarSheetVisible(false)}
      />
      <MsConfirmDialog
        visible={removeAvatarConfirm}
        title="Remove Profile Photo"
        message="Your profile photo will be removed."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { setRemoveAvatarConfirm(false); void removePhoto('avatar'); }}
        onCancel={() => setRemoveAvatarConfirm(false)}
      />

      {/* ── Banner sheet + confirm ───────────────────────────────────────── */}
      <MsActionSheet
        visible={bannerSheetVisible}
        title="Banner"
        actions={[
          { label: 'View Banner', onPress: () => { if (user?.bannerUrl) setBannerViewerVisible(true); else toast.info('No banner set'); } },
          { label: 'Change Banner', onPress: () => pickPhoto('banner') },
          ...(user?.bannerUrl ? [{ label: 'Remove Banner', destructive: true, onPress: () => setRemoveBannerConfirm(true) }] : []),
        ]}
        onClose={() => setBannerSheetVisible(false)}
      />
      <MsConfirmDialog
        visible={removeBannerConfirm}
        title="Remove Banner"
        message="Your banner photo will be removed."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { setRemoveBannerConfirm(false); void removePhoto('banner'); }}
        onCancel={() => setRemoveBannerConfirm(false)}
      />

      {/* ── Post long-press actions (grid) ───────────────────────────────── */}
      <MsActionSheet
        visible={postActionSheet}
        title="Your Post"
        subtitle={actionPost?.caption ? `"${actionPost.caption.slice(0, 48)}${actionPost.caption.length > 48 ? '…' : ''}"` : undefined}
        actions={[
          {
            label: 'Edit Post',
            onPress: () => { setPostActionSheet(false); if (actionPost) router.push(`/edit-post/${actionPost.id}`); },
          },
          {
            label: 'View Analytics',
            onPress: () => { setPostActionSheet(false); setAnalyticsSheet(true); },
          },
          {
            label: 'Delete Post',
            destructive: true,
            onPress: () => { setPostActionSheet(false); setDeleteConfirmVisible(true); },
          },
        ]}
        onClose={() => setPostActionSheet(false)}
      />

      {/* ── Delete confirmation ───────────────────────────────────────────── */}
      <MsConfirmDialog
        visible={deleteConfirmVisible}
        title="Delete Post"
        message="This post will be permanently deleted and removed from your profile. This cannot be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        destructive
        onConfirm={handleDeletePost}
        onCancel={() => { setDeleteConfirmVisible(false); setActionPost(null); }}
      />

      {/* ── Analytics sheet ──────────────────────────────────────────────── */}
      <AnalyticsSheet
        visible={analyticsSheet}
        post={actionPost}
        onClose={() => { setAnalyticsSheet(false); setActionPost(null); }}
      />

      {/* ── Image viewers ────────────────────────────────────────────────── */}
      <ImageViewer uri={user?.avatarUrl ?? null} visible={avatarViewerVisible} onClose={() => setAvatarViewerVisible(false)} />
      <ImageViewer uri={user?.bannerUrl ?? null} visible={bannerViewerVisible} onClose={() => setBannerViewerVisible(false)} />

      {/* ── Edit profile modal ───────────────────────────────────────────── */}
      <EditProfileModal
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
        name={user?.name ?? ''}
        bio={user?.bio ?? ''}
        onSave={handleSaveProfile}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  topActions:  { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cover: {
    height: 130,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
    borderWidth: 1,
    borderColor: T.BORDER_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLabel: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },

  userInfo:    { paddingHorizontal: 20, paddingTop: 14, gap: 4 },
  displayName: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.3 },
  handle:      { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  bio: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_2, lineHeight: 21, marginTop: 6 },

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
  contentTabsRow:    { paddingHorizontal: 16 },
  contentTab: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  contentTabActive:      { borderBottomColor: T.ACCENT },
  contentTabLabel:       { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  contentTabLabelActive: { color: T.TEXT, fontFamily: T.FONT.semibold },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },

  videoOverlay: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  videoPlayBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDuration: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  lockBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const epm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: T.RADIUS.xl,
    borderTopRightRadius: T.RADIUS.xl,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.TEXT_3,
    alignSelf: 'center',
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  title:      { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT },
  closeLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  fields: { gap: 14 },
  field:  { gap: 6 },
  label:  { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  input: {
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
  },
  bioInput: { height: 100, paddingTop: 12, textAlignVertical: 'top' },
  hint: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, textAlign: 'right' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  saveBtn: {
    flex: 1,
    height: 48,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
});

const viewerStyles = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeLabel: { color: T.TEXT, fontSize: 26, lineHeight: 28 },
  image:      { width: '100%', height: '80%' },
  noPhoto:    { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 15 },
});
