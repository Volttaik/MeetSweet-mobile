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
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bookmark,
  ChatCircle,
  SealCheck,
  Heart,
  ShareNetwork,
  UserPlus,
} from 'phosphor-react-native';
import { getPost, likePost, unlikePost, bookmarkPost, type Post } from '@/services/posts';
import { trackVideoView } from '@/services/content';
import {
  submitRoomComment,
  likeRoomComment,
  unlikeRoomComment,
  deleteRoomComment,
} from '@/services/comment-room-service';
import { useComments, CommentRow, CommentShimmerSkeleton, type Comment } from '@/components/MsCommentsSheet';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { MsShareSheet } from '@/components/MsShareSheet';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsComposer } from '@/components/MsComposer';
import { useAuth } from '@/contexts/AuthContext';
import { usePostActions } from '@/contexts/PostActionsContext';
import { dialogs } from '@/components/MsGlobalDialogs';
import { T } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';

export default function ContentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { likeOverrides, bookmarkOverrides, commentCounts, markLiked, markBookmarked, setCommentCount: publishCommentCount } = usePostActions();

  // ── Post state ─────────────────────────────────────────────────────────────
  const [post, setPost] = useState<Post | null>(null);
  const [loadingPost, setLoadingPost] = useState(true);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [shareVisible, setShareVisible] = useState(false);

  // ── Comment state ──────────────────────────────────────────────────────────
  const { comments, setComments, isLoading: commentsLoading, commentRoomId, liveCommentCount } = useComments(id ?? '');
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (liveCommentCount != null) setCommentCount(liveCommentCount);
  }, [liveCommentCount]);

  const currentUserId = user?.id ?? '';

  // ── Load post ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoadingPost(true);
    getPost(id)
      .then((p) => {
        setPost(p);
        // Seed from shared overrides when available so likes/bookmarks made on
        // other screens are reflected here on open.
        setLiked(likeOverrides[id]?.likedByMe ?? p.likedByMe);
        setBookmarked(bookmarkOverrides[id]?.bookmarkedByMe ?? p.bookmarkedByMe ?? false);
        setLikeCount(likeOverrides[id]?.likeCount ?? p.likeCount);
        setCommentCount(commentCounts[id] ?? p.commentCount ?? 0);
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
      if (next) {
        await likePost(post.id);
      } else {
        await unlikePost(post.id);
      }
      // Publish to the shared store so every other view updates immediately.
      markLiked(post.id, next, Math.max(0, likeCount + (next ? 1 : -1)));
    } catch {
      setLiked(!next);
      setLikeCount((n) => Math.max(0, n + (next ? -1 : 1)));
    }
  };

  const toggleBookmark = async () => {
    if (!post) return;
    const next = !bookmarked;
    setBookmarked(next);
    try {
      await bookmarkPost(post.id);
      markBookmarked(post.id, next, Math.max(0, (post.bookmarkCount ?? 0) + (next ? 1 : -1)));
    }
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
      id: tempId, commentRoomId: post?.commentRoomId ?? id ?? '', body, isPinned: false,
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
    // Optimistic: the comment and the post's comment count both update
    // immediately, then reconcile with the server response.
    setComments((prev) => [optimistic, ...prev]);
    setCommentCount((n) => n + 1);
    try {
      const res = await submitRoomComment(commentRoomId ?? '', body);
      setComments((prev) => prev.map((c) => c.id === tempId ? res.comment as unknown as Comment : c));
      // Publish the confirmed count so every card showing this post updates.
      publishCommentCount(id, commentCount + 1);
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      dialogs.alert({ variant: 'error', title: 'Could not post comment', message: 'Please try again.' });
    } finally {
      setSending(false);
    }
  }, [commentRoomId, commentText, sending, user, setComments, id, commentCount, publishCommentCount]);

  const handleLike = useCallback(async (commentId: string) => {
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 } : c));
    try {
      const res = await likeRoomComment(commentRoomId ?? '', commentId);
      setComments((prev) => prev.map((c) =>
        c.id === commentId ? { ...c, likeCount: res.likeCount } : c));
    } catch {
      setComments((prev) => prev.map((c) =>
        c.id === commentId ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) } : c));
    }
  }, [commentRoomId, setComments]);

  const handleUnlike = useCallback(async (commentId: string) => {
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) } : c));
    try {
      const res = await unlikeRoomComment(commentRoomId ?? '', commentId);
      setComments((prev) => prev.map((c) =>
        c.id === commentId ? { ...c, likeCount: res.likeCount } : c));
    } catch {
      setComments((prev) => prev.map((c) =>
        c.id === commentId ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 } : c));
    }
  }, [commentRoomId, setComments]);

  const handleDelete = useCallback((commentId: string) => {
    dialogs.confirm({
      title: 'Delete comment',
      message: 'Remove this comment?',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setCommentCount((n) => Math.max(0, n - 1));
        // Publish the confirmed count so cards update immediately.
        publishCommentCount(id, Math.max(0, commentCount - 1));
        try { await deleteRoomComment(commentRoomId ?? '', commentId); }
        catch { /* comment was removed optimistically; silent fail is fine */ }
      },
    });
  }, [commentRoomId, setComments, id, commentCount, publishCommentCount]);

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
          onAction={() => goBack()}
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
        <MsVideoPlayer
          videoId={post.id}
          uri={post.mediaUrl ?? null}
          posterUri={post.thumbnailUrl}
          qualities={post.qualities}
          isPremium={isLocked}
          onPremiumRequired={() => router.push(`/creator/${post.author.id}` as any)}
          // Report watch time to the server (authoritative counting). The
          // screen itself has no view counter; feeds refetch the live count.
          onViewProgress={(seconds) => {
            if (seconds > 0) trackVideoView(post.id, seconds, post.durationSecs ?? undefined).catch(() => {});
          }}
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
            <View style={styles.creatorNameRow}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {post.author.name || post.author.username}
              </Text>
              {post.author.isVerified && <SealCheck size={14} color={T.TEXT} weight="fill" />}
            </View>
            <Text style={styles.creatorHandle}>@{post.author.username}</Text>
          </View>
        </Pressable>
        {currentUserId !== post.author.id && (
          <Pressable
            style={styles.subscribe}
            onPress={() => router.push(`/creator/${post.author.id}`)}
          >
            <BrandGradientFill />
            <UserPlus size={14} color="#FFFFFF" weight="fill" />
            <Text style={styles.subscribeText}>Subscribe</Text>
          </Pressable>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={toggleLike}>
          {liked ? <Heart size={18} color={T.SECONDARY} weight="fill" /> : <Heart size={18} color={T.TEXT_2} weight="bold" />}
          <Text style={styles.actionText}>{formatCount(likeCount)}</Text>
        </Pressable>
        <View style={styles.action}>
          <ChatCircle size={18} color={T.TEXT_2} />
          <Text style={styles.actionText}>{formatCount(commentCount)}</Text>
        </View>
        <Pressable style={styles.action} onPress={toggleBookmark}>
          <Bookmark size={18} color={bookmarked ? T.ACCENT : T.TEXT_2} weight={bookmarked ? 'fill' : 'bold'} />
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

      {commentsLoading && comments.length === 0 && <CommentShimmerSkeleton />}
    </View>
  );

  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Fixed nav bar */}
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => goBack()}>
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>{isVideo ? 'Video' : 'Post'}</Text>
        <Pressable style={styles.iconButton} onPress={() => setShareVisible(true)}>
          <ShareNetwork size={19} color={T.TEXT} />
        </Pressable>
      </View>

      {/* Comments + post in a single FlatList — only comments scroll */}
      {/* iOS: pad for the keyboard. Android: the app window resizes
          (softwareKeyboardLayoutMode=resize), so no extra padding — adding
          'height' here would double-compensate and float the composer. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                <ChatCircle size={26} color={T.TEXT_3} />
                <Text style={styles.emptyCommentsText}>No comments yet</Text>
                <Text style={styles.emptyCommentsSubtext}>Be the first to share your thoughts.</Text>
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
  creatorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  creatorName: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13, flexShrink: 1 },
  creatorHandle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, marginTop: 2 },
  subscribe: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    overflow: 'hidden',
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 13, paddingVertical: 9,
  },
  subscribeText: { color: '#FFFFFF', fontFamily: T.FONT.bold, fontSize: 11 },

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

  emptyComments: { paddingVertical: 36, alignItems: 'center', gap: 6 },
  emptyCommentsText: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  emptyCommentsSubtext: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12 },

  composerBar: {
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
    paddingTop: 8,
    paddingHorizontal: 12,
    backgroundColor: T.BG,
  },
});