/**
 * MsCommentsSheet — YouTube-style comments section.
 *
 * Every API call is wired to a real backend route via services/comments.ts.
 *
 * Backend routes used:
 *   GET    /posts/:id/comments                          — load comment list
 *   POST   /posts/:id/comments { body }                 — create comment
 *   DELETE /posts/:id/comments/:commentId               — delete own comment
 *   POST   /posts/:id/comments/:commentId/like          — like a comment
 *   DELETE /posts/:id/comments/:commentId/like          — unlike a comment
 *   GET    /posts/:id/comments/:commentId/replies       — load replies
 *   POST   /posts/:id/comments/:commentId/replies       — post a reply
 *
 * Inline preview: shows the 2 most recent comments + "View all X comments" row.
 * Full sheet: all comments in a bottom-sheet modal with MsComposer pinned at bottom.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowBendUpLeft, ChatCircle, Heart, Trash, X } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsComposer } from '@/components/MsComposer';
import { MsAvatar } from '@/components/MsAvatar';
import { T } from '@/constants/theme';

import {
  getComments,
  createComment,
  deleteComment,
  likeComment,
  unlikeComment,
  getReplies,
  createReply,
  type Comment,
  type CommentReply,
} from '@/services/comments';

import { useAuth } from '@/contexts/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTimeAgo(iso: string | undefined | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

function nameInitials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name ?? '??').substring(0, 2).toUpperCase();
}

// ─── Comment data hook ────────────────────────────────────────────────────────

function useComments(postId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getComments(postId);
      // Deduplicate by id in case optimistic entries overlap with server results
      setComments((prev) => {
        const incoming = res.comments;
        const tempIds = new Set(prev.filter((c) => c.id.startsWith('tmp-')).map((c) => c.id));
        const merged = [...prev.filter((c) => tempIds.has(c.id)), ...incoming];
        const seen = new Set<string>();
        return merged.filter((c) => (seen.has(c.id) ? false : !!seen.add(c.id)));
      });
    } catch {
      setError('Could not load comments');
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { comments, setComments, isLoading, error, refresh };
}

// ─── Replies sub-thread ───────────────────────────────────────────────────────

function RepliesThread({
  postId,
  commentId,
}: {
  postId: string;
  commentId: string;
}) {
  const { user } = useAuth();
  const [replies, setReplies] = useState<CommentReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getReplies(postId, commentId);
        if (!cancelled) setReplies(res.replies);
      } catch {/* */} finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId, commentId]);

  const handleSendReply = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const tempId = `local_${Date.now()}`;
    const optimistic: CommentReply = {
      id: tempId,
      body,
      likeCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: user?.id ?? '',
        name: user?.name || user?.username || 'Anonymous',
        username: user?.username ?? '',
        avatarUrl: user?.avatarUrl ?? null,
      },
    };
    setReplies((prev) => [...prev, optimistic]);
    setText('');
    try {
      const res = await createReply(postId, commentId, body);
      setReplies((prev) => prev.map((r) => r.id === tempId ? res.reply : r));
    } catch {
      setReplies((prev) => prev.filter((r) => r.id !== tempId));
      Alert.alert('Error', 'Could not post reply. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <ActivityIndicator size="small" color={T.TEXT_3} style={{ marginVertical: 8, marginLeft: 44 }} />;
  }

  return (
    <View style={replyStyles.wrap}>
      {replies.map((r, index) => (
        <View key={`${r.id || 'reply'}-${index}`} style={replyStyles.row}>
          <MsAvatar size={26} initials={nameInitials(r.author.name)} imageUri={r.author.avatarUrl ?? undefined} />
          <View style={replyStyles.body}>
            <View style={replyStyles.header}>
              <Text style={replyStyles.name}>{r.author.name}</Text>
              <Text style={replyStyles.time}>{fmtTimeAgo(r.createdAt)}</Text>
            </View>
            <View style={replyStyles.bubble}>
              <Text style={replyStyles.text}>{r.body}</Text>
            </View>
          </View>
        </View>
      ))}
      {/* Reply composer */}
      <View style={replyStyles.composerRow}>
        <MsComposer
          mode="comment"
          value={text}
          onChangeText={setText}
          onSend={handleSendReply}
          placeholder="Write a reply…"
          disabled={sending}
        />
      </View>
    </View>
  );
}

const replyStyles = StyleSheet.create({
  wrap: { marginLeft: 44, marginTop: 4, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  body: { flex: 1, gap: 3 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 11 },
  time: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10 },
  bubble: {
    backgroundColor: T.SURFACE_2,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  text: { color: T.TEXT, fontFamily: T.FONT.regular, fontSize: 12, lineHeight: 18 },
  composerRow: { marginTop: 4 },
});

// ─── Single comment row ───────────────────────────────────────────────────────

function CommentRow({
  comment,
  postId,
  currentUserId,
  onLike,
  onUnlike,
  onDelete,
  showDivider = true,
}: {
  comment: Comment;
  postId: string;
  currentUserId: string;
  onLike: (id: string) => void;
  onUnlike: (id: string) => void;
  onDelete: (id: string) => void;
  showDivider?: boolean;
}) {
  const [showReplies, setShowReplies] = useState(false);

  // Animate entrance
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, []);

  const isOwn = comment.author.id === currentUserId;

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <View style={[rowStyles.wrap, showDivider && rowStyles.divider]}>
        {/* Avatar */}
        <MsAvatar
          size={34}
          initials={nameInitials(comment.author.name)}
          imageUri={comment.author.avatarUrl ?? undefined}
        />

        {/* Content */}
        <View style={rowStyles.body}>
          {/* Header */}
          <View style={rowStyles.header}>
            <Text style={rowStyles.name}>{comment.author.name}</Text>
            {!!comment.author.username && (
              <Text style={rowStyles.handle}>@{comment.author.username}</Text>
            )}
            <Text style={rowStyles.time}>{fmtTimeAgo(comment.createdAt)}</Text>
            {isOwn && (
              <TouchableOpacity
                onPress={() => onDelete(comment.id)}
                hitSlop={8}
                style={rowStyles.deleteBtn}
              >
                <Trash size={12} color={T.TEXT_3} />
              </TouchableOpacity>
            )}
          </View>

          {/* Text bubble */}
          <View style={rowStyles.textBubble}>
            <Text style={rowStyles.text}>{comment.body}</Text>
          </View>

          {/* Actions */}
          <View style={rowStyles.actions}>
            <TouchableOpacity
              style={rowStyles.actionBtn}
              onPress={() => comment.likedByMe ? onUnlike(comment.id) : onLike(comment.id)}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Heart
                size={14}
                color={comment.likedByMe ? T.ACCENT : T.TEXT_3}
                weight={comment.likedByMe ? 'fill' : 'regular'}
              />
              {comment.likeCount > 0 && (
                <Text style={[rowStyles.likeCount, comment.likedByMe && rowStyles.likeCountActive]}>
                  {comment.likeCount}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={rowStyles.actionBtn}
              onPress={() => setShowReplies((v) => !v)}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <ArrowBendUpLeft size={14} color={T.TEXT_3} />
              <Text style={rowStyles.replyLabel}>
                {showReplies
                  ? 'Hide replies'
                  : comment.replyCount > 0
                    ? `${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`
                    : 'Reply'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Replies sub-thread */}
          {showReplies && (
            <RepliesThread postId={postId} commentId={comment.id} />
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  body: { flex: 1, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 12 },
  handle: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10 },
  time: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10, marginLeft: 'auto' },
  deleteBtn: { padding: 2 },
  textBubble: {
    backgroundColor: T.SURFACE_2,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  text: {
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likeCount: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 11 },
  likeCountActive: { color: T.ACCENT },
  replyLabel: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 11 },
});

// ─── Full comments modal ───────────────────────────────────────────────────────

export function CommentsModal({
  visible,
  onClose,
  postId,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { comments, setComments, isLoading, error, refresh } = useComments(postId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const currentUserId = user?.id ?? '';

  // ── Create comment ─────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    // Optimistic local comment — will be replaced by server response
    const tempId = `local_${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      body,
      isPinned: false,
      likeCount: 0,
      replyCount: 0,
      likedByMe: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: user?.id ?? '',
        name: user?.name || user?.username || 'Anonymous',
        username: user?.username ?? '',
        avatarUrl: user?.avatarUrl ?? null,
      },
    };
    setComments((prev) => [optimistic, ...prev]);
    try {
      const res = await createComment(postId, body);
      // Replace temp with real comment from server
      setComments((prev) => prev.map((c) => c.id === tempId ? res.comment : c));
    } catch {
      // Remove optimistic comment on failure
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      Alert.alert('Error', 'Could not post comment. Please try again.');
    } finally {
      setSending(false);
    }
  }, [text, sending, postId, user, setComments]);

  // ── Like comment ────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (commentId: string) => {
    // Optimistic
    setComments((prev) =>
      prev.map((c) => c.id === commentId
        ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 }
        : c),
    );
    try {
      const res = await likeComment(postId, commentId);
      setComments((prev) =>
        prev.map((c) => c.id === commentId ? { ...c, likeCount: res.likeCount } : c),
      );
    } catch {
      // Revert on failure
      setComments((prev) =>
        prev.map((c) => c.id === commentId
          ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) }
          : c),
      );
    }
  }, [postId, setComments]);

  // ── Unlike comment ──────────────────────────────────────────────────────────
  const handleUnlike = useCallback(async (commentId: string) => {
    // Optimistic
    setComments((prev) =>
      prev.map((c) => c.id === commentId
        ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) }
        : c),
    );
    try {
      const res = await unlikeComment(postId, commentId);
      setComments((prev) =>
        prev.map((c) => c.id === commentId ? { ...c, likeCount: res.likeCount } : c),
      );
    } catch {
      // Revert on failure
      setComments((prev) =>
        prev.map((c) => c.id === commentId
          ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 }
          : c),
      );
    }
  }, [postId, setComments]);

  // ── Delete comment ──────────────────────────────────────────────────────────
  const handleDelete = useCallback((commentId: string) => {
    Alert.alert('Delete comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Optimistic removal
          setComments((prev) => prev.filter((c) => c.id !== commentId));
          try {
            await deleteComment(postId, commentId);
          } catch {
            // On failure refresh the list to restore the comment
            refresh();
            Alert.alert('Error', 'Could not delete comment.');
          }
        },
      },
    ]);
  }, [postId, setComments, refresh]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* KAV is the outermost element so it can push the sheet above the keyboard on both platforms */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalStyles.kvWrap}
        keyboardVerticalOffset={0}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[modalStyles.sheet, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
            {/* Handle */}
            <View style={modalStyles.handle} />

            {/* Header */}
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Comments</Text>
              <Text style={modalStyles.count}>{comments.length}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} style={modalStyles.closeBtn}>
                <X size={18} color={T.TEXT_2} />
              </TouchableOpacity>
            </View>

            {/* List */}
            {isLoading ? (
              <ActivityIndicator style={modalStyles.loader} color={T.TEXT_3} />
            ) : error ? (
              <View style={modalStyles.emptyWrap}>
                <Text style={modalStyles.emptyText}>{error}</Text>
                <TouchableOpacity onPress={refresh} style={modalStyles.retryBtn}>
                  <Text style={modalStyles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c, index) => `${c.id || 'comment'}-${index}`}
                renderItem={({ item, index }) => (
                  <CommentRow
                    comment={item}
                    postId={postId}
                    currentUserId={currentUserId}
                    showDivider={index < comments.length - 1}
                    onLike={handleLike}
                    onUnlike={handleUnlike}
                    onDelete={handleDelete}
                  />
                )}
                contentContainerStyle={modalStyles.listContent}
                showsVerticalScrollIndicator={false}
                style={modalStyles.list}
                ListEmptyComponent={
                  <View style={modalStyles.emptyWrap}>
                    <Text style={modalStyles.emptyText}>No comments yet. Be the first!</Text>
                  </View>
                }
              />
            )}

            {/* Composer — pinned at bottom, keyboard pushes sheet up */}
            <View style={modalStyles.composerWrap}>
              <MsComposer
                mode="comment"
                value={text}
                onChangeText={setText}
                onSend={handleSend}
                placeholder="Add a comment…"
                disabled={sending}
              />
            </View>
          </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,5,8,0.72)',
    justifyContent: 'flex-end',
  },
  kvWrap: {
    // KAV is outermost — flex:1 + justifyContent:'flex-end' pushes sheet to bottom
    // and allows the keyboard to resize this container on both iOS and Android.
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8,5,8,0.72)',
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '88%',
    paddingTop: 12,
    ...T.SHADOWS.hard,
  },
  list: {
    flex: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 16, flex: 1 },
  count: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 13 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginTop: 40 },
  listContent: { paddingBottom: 8, paddingTop: 4 },
  emptyWrap: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  emptyText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 14 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.pill,
  },
  retryText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 13 },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
    paddingTop: 8,
  },
});

// ─── Public: inline preview section ──────────────────────────────────────────

interface MsCommentsSectionProps {
  postId: string;
  previewCount?: number;
}

export function MsCommentsSection({ postId, previewCount = 2 }: MsCommentsSectionProps) {
  const { user } = useAuth();
  const { comments, setComments, isLoading } = useComments(postId);
  const [modalOpen, setModalOpen] = useState(false);
  const totalCount = comments.length;
  const preview = comments.slice(0, previewCount);

  const currentUserId = user?.id ?? '';

  const handleLike = useCallback(async (commentId: string) => {
    setComments((prev) =>
      prev.map((c) => c.id === commentId ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 } : c),
    );
    try {
      const res = await likeComment(postId, commentId);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, likeCount: res.likeCount } : c));
    } catch {
      setComments((prev) =>
        prev.map((c) => c.id === commentId ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) } : c),
      );
    }
  }, [postId, setComments]);

  const handleUnlike = useCallback(async (commentId: string) => {
    setComments((prev) =>
      prev.map((c) => c.id === commentId ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) } : c),
    );
    try {
      const res = await unlikeComment(postId, commentId);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, likeCount: res.likeCount } : c));
    } catch {
      setComments((prev) =>
        prev.map((c) => c.id === commentId ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 } : c),
      );
    }
  }, [postId, setComments]);

  const handleDelete = useCallback((commentId: string) => {
    Alert.alert('Delete comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
          try { await deleteComment(postId, commentId); } catch {/* */}
        },
      },
    ]);
  }, [postId, setComments]);

  if (isLoading) {
    return (
      <View style={sectionStyles.wrap}>
        <View style={sectionStyles.header}>
          <ChatCircle size={16} color={T.TEXT} />
          <Text style={sectionStyles.title}>Comments</Text>
        </View>
        <ActivityIndicator style={{ marginVertical: 24 }} color={T.TEXT_3} />
      </View>
    );
  }

  return (
    <View style={sectionStyles.wrap}>
      <View style={sectionStyles.header}>
        <ChatCircle size={16} color={T.TEXT} />
        <Text style={sectionStyles.title}>Comments</Text>
        <Text style={sectionStyles.total}>{totalCount.toLocaleString()}</Text>
      </View>

      {preview.map((c, i) => (
        <CommentRow
          key={`${c.id || 'comment'}-${i}`}
          comment={c}
          postId={postId}
          currentUserId={currentUserId}
          showDivider={i < preview.length - 1}
          onLike={handleLike}
          onUnlike={handleUnlike}
          onDelete={handleDelete}
        />
      ))}

      <TouchableOpacity style={sectionStyles.viewAll} onPress={() => setModalOpen(true)} activeOpacity={0.7}>
        <Text style={sectionStyles.viewAllText}>
          {totalCount > previewCount
            ? `View all ${totalCount.toLocaleString()} comments`
            : 'Add a comment…'}
        </Text>
      </TouchableOpacity>

      <CommentsModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        postId={postId}
      />
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
    ...T.SHADOWS.soft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  title: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14, flex: 1 },
  total: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12 },
  viewAll: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
  },
  viewAllText: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 13,
  },
});
