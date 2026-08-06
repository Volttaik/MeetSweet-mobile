/**
 * Post detail screen — sticky post + scrollable inline comments.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │  ← Back          Post    Share  │  fixed nav
 *   ├─────────────────────────────────┤
 *   │  Post content (media, caption,  │  FlatList ListHeaderComponent
 *   │  creator row, like/save/share)  │  — never scrolls away
 *   ├─────────────────────────────────┤
 *   │  Comments ──────────────────────│  ← scrollable list starts here
 *   │  [comment row]                  │
 *   │  [comment row]                  │
 *   │  ...                            │
 *   ├─────────────────────────────────┤
 *   │  [Composer — pinned at bottom]  │  keyboard-aware
 *   └─────────────────────────────────┘
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bookmark,
  ChatCircle,
  Heart,
  ShareNetwork,
  UserPlus,
} from 'phosphor-react-native';
import { getPost, likePost, unlikePost, bookmarkPost, type Post } from '@/services/posts';
import {
  createComment,
  likeComment,
  unlikeComment,
  deleteComment,
  type Comment,
} from '@/services/comments';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsLongFormPlayer } from '@/components/MsLongFormPlayer';
import { MsShareSheet } from '@/components/MsShareSheet';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsComposer } from '@/components/MsComposer';
import { useComments, CommentRow } from '@/components/MsCommentsSheet';
import { useAuth } from '@/contexts/AuthContext';
import { T } from '@/constants/theme';

export default function ContentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // ── Post state ─────────────────────────────────────────────────────────────
  const [post, setPost] = useState<Post | null>(null);
  const [loadingPost, setLoadingPost] = useState(true);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [shareVisible, setShareVisible] = useState(false);

  // ── Comment state ──────────────────────────────────────────────────────────
  const { comments, setComments, isLoading: commentsLoading } = useComments(id ?? '');
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  const currentUserId = user?.id ?? '';

  // ── Load post ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoadingPost(true);
    getPost(id)
      .then(({ post: p }) => {
        setPost(p);
        setLiked(p.likedByMe);
        setBookmarked(p.bookmarkedByMe ?? false);
        setLikeCount(p.likeCount);
      })
      .catch(() => setPost(null))
      .finally(() => setLoadingPost(false));
  }, [id]);

  // ── Post actions ───────────────────────────────────────────────────────────
  const toggleLike = async () => {
    if (!post) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const res = next ? await likePost(post.id) : await unlikePost(post.id);
      setLikeCount(res.likeCount);
      setLiked(res.liked);
    } catch {
      setLiked(!next);
      setLikeCount((n) => Math.max(0, n + (next ? -1 : 1)));
    }
  };

  const toggleBookmark = async () => {
    if (!post) return;
    const next = !bookmarked;
    setBookmarked(next);
    try { await bookmarkPost(post.id); }
    catch { setBookmarked(!next); }
  };

  // ── Comment actions ────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!id) return;
    const body = commentText.trim();
    if (!body || sending) return;
    setSending(true);
    setCommentText('');
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId, body, isPinned: false,
      likeCount: 0, replyCount: 0, likedByMe: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: user?.id ?? '',
        name: user?.name || user?.username || 'You',
        username: user?.username ?? '',
        avatarUrl: user?.avatarUrl ?? null,
      },
    };
    setComments((prev) => [optimistic, ...prev]);
    try {
      const res = await createComment(id, body);
      setComments((prev) => prev.map((c) => c.id === tempId ? res.comment : c));
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      Alert.alert('Error', 'Could not post comment. Please try again.');
    } finally {
      setSending(false);
    }
  }, [id, commentText, sending, user, setComments]);

  const handleLike = useCallback(async (commentId: string) => {
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 } : c));
    try {
      const res = await likeComment(id!, commentId);
      setComments((prev) => prev.map((c) =>
        c.id === commentId ? { ...c, likeCount: res.likeCount } : c));
    } catch {
      setComments((prev) => prev.map((c) =>
        c.id === commentId ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) } : c));
    }
  }, [id, setComments]);

  const handleUnlike = useCallback(async (commentId: string) => {
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) } : c));
    try {
      const res = await unlikeComment(id!, commentId);
      setComments((prev) => prev.map((c) =>
        c.id === commentId ? { ...c, likeCount: res.likeCount } : c));
    } catch {
      setComments((prev) => prev.map((c) =>
        c.id === commentId ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 } : c));
    }
  }, [id, setComments]);

  const handleDelete = useCallback((commentId: string) => {
    Alert.alert('Delete comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
          try { await deleteComment(id!, commentId); }
          catch { /* comment was removed optimistically; silent fail is fine */ }
        },
      },
    ]);
  }, [id, setComments]);

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loadingPost) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={T.TEXT_2} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <MsEmptyState
          title="Content unavailable"
          message="This post could not be loaded."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const isVideo = post.mediaType === 'video';
  const isLocked = post.isLocked ?? false;

  // ── Post header rendered inside FlatList ListHeaderComponent ───────────────
  const PostHeader = (
    <View>
      {/* Media */}
      {isVideo ? (
        <MsLongFormPlayer
          videoId={post.id}
          uri={post.mediaUrl}
          posterUri={post.thumbnailUrl}
          isPremium={isLocked}
          onPremiumRequired={() => router.push(`/creator/${post.author.id}` as any)}
        />
      ) : post.mediaUrl ? (
        <View style={styles.imageWrap}>
          <MsMediaLoader
            uri={post.mediaUrl}
            style={styles.image}
            resizeMode="cover"
            accessibleLabel={post.caption || 'Post image'}
            errorMessage="Could not load image"
          />
        </View>
      ) : null}

      {/* Caption */}
      {post.caption ? (
        <Text style={styles.caption}>{post.caption}</Text>
      ) : null}

      {/* Creator row */}
      <View style={styles.creatorRow}>
        <Pressable
          style={styles.creatorPress}
          onPress={() => router.push(`/creator/${post.author.id}`)}
        >
          <MsAvatar
            size={42}
            initials={(post.author.name || post.author.username || 'U').slice(0, 2).toUpperCase()}
            imageUri={post.author.avatarUrl ?? undefined}
          />
          <View style={styles.creatorCopy}>
            <Text style={styles.creatorName}>
              {post.author.name || post.author.username}
              {post.author.isVerified ? '  ✓' : ''}
            </Text>
            <Text style={styles.creatorHandle}>@{post.author.username}</Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.subscribe}
          onPress={() => router.push(`/creator/${post.author.id}`)}
        >
          <UserPlus size={14} color={T.BG} />
          <Text style={styles.subscribeText}>Subscribe</Text>
        </Pressable>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={toggleLike}>
          <Heart size={18} color={liked ? T.ACCENT : T.TEXT_2} weight={liked ? 'fill' : 'regular'} />
          <Text style={styles.actionText}>{formatCount(likeCount)}</Text>
        </Pressable>
        <View style={styles.action}>
          <ChatCircle size={18} color={T.TEXT_2} />
          <Text style={styles.actionText}>{formatCount(post.commentCount)}</Text>
        </View>
        <Pressable style={styles.action} onPress={toggleBookmark}>
          <Bookmark size={18} color={bookmarked ? T.ACCENT : T.TEXT_2} weight={bookmarked ? 'fill' : 'regular'} />
          <Text style={styles.actionText}>{bookmarked ? 'Saved' : 'Save'}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => setShareVisible(true)}>
          <ShareNetwork size={18} color={T.TEXT_2} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
      </View>

      <Text style={styles.metaText}>{timeAgo(post.createdAt)}</Text>

      {/* Comments section header */}
      <View style={styles.commentsSectionHeader}>
        <ChatCircle size={15} color={T.TEXT_2} />
        <Text style={styles.commentsSectionTitle}>Comments</Text>
        <Text style={styles.commentsSectionCount}>{comments.length}</Text>
      </View>

      {commentsLoading && (
        <ActivityIndicator style={{ marginVertical: 24 }} color={T.TEXT_3} />
      )}
    </View>
  );

  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Fixed nav bar */}
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>{isVideo ? 'Video' : 'Post'}</Text>
        <Pressable style={styles.iconButton} onPress={() => setShareVisible(true)}>
          <ShareNetwork size={19} color={T.TEXT} />
        </Pressable>
      </View>

      {/* Comments + post in a single FlatList — only comments scroll */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 62}
      >
        <FlatList
          data={comments}
          keyExtractor={(c, i) => `${c.id || 'c'}-${i}`}
          renderItem={({ item, index }) => (
            <CommentRow
              comment={item}
              postId={id!}
              currentUserId={currentUserId}
              showDivider={index < comments.length - 1}
              onLike={handleLike}
              onUnlike={handleUnlike}
              onDelete={handleDelete}
            />
          )}
          ListHeaderComponent={PostHeader}
          ListEmptyComponent={
            !commentsLoading ? (
              <View style={styles.emptyComments}>
                <Text style={styles.emptyCommentsText}>No comments yet. Be the first!</Text>
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />

        {/* Pinned composer */}
        <View style={[styles.composerBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
          <MsComposer
            mode="comment"
            value={commentText}
            onChangeText={setCommentText}
            onSend={handleSend}
            placeholder="Add a comment…"
            disabled={sending}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Share sheet */}
      <MsShareSheet
        visible={shareVisible}
        contentType={isVideo ? 'video' : 'post'}
        contentId={post.id}
        title={post.caption || 'Post'}
        onClose={() => setShareVisible(false)}
      />
    </MsAmbientBackground>
  );
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function timeAgo(value: string) {
  if (!value) return '';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : `${days}d ago`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  flex: { flex: 1 },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },

  header: {
    height: 62,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15 },
  iconButton: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
  },

  listContent: { paddingBottom: 16 },

  imageWrap: {
    marginHorizontal: 16, marginVertical: 12,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
    aspectRatio: 4 / 5,
  },
  image: { width: '100%', height: '100%' },

  caption: {
    color: T.TEXT, fontFamily: T.FONT.regular,
    fontSize: 15, lineHeight: 22,
    paddingHorizontal: 18, paddingTop: 12,
  },

  creatorRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingHorizontal: 18, paddingVertical: 14,
  },
  creatorPress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  creatorCopy: { flex: 1 },
  creatorName: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13 },
  creatorHandle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, marginTop: 2 },
  subscribe: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    backgroundColor: T.TEXT,
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 13, paddingVertical: 9,
  },
  subscribeText: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 11 },

  actions: {
    flexDirection: 'row', gap: 22,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12 },

  metaText: {
    color: T.TEXT_3, fontFamily: T.FONT.regular,
    fontSize: 11, paddingHorizontal: 18, paddingTop: 4,
  },

  commentsSectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 7, paddingHorizontal: 18,
    paddingTop: 20, paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: T.BORDER,
    marginTop: 8,
  },
  commentsSectionTitle: {
    color: T.TEXT, fontFamily: T.FONT.semibold,
    fontSize: 14, flex: 1,
  },
  commentsSectionCount: {
    color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12,
  },

  emptyComments: { paddingVertical: 32, alignItems: 'center' },
  emptyCommentsText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 13 },

  composerBar: {
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
    paddingTop: 8,
    paddingHorizontal: 12,
    backgroundColor: T.BG,
  },
});
