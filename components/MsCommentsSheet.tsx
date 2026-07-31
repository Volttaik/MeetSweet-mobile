/**
 * MsCommentsSheet — YouTube-style comments section.
 *
 * Reuses shared chat components (MsTextBubble, MsComposer) for consistent
 * visual language across comments and chat.
 *
 * Inline preview: shows the 2 most recent comments + "View all X comments" row.
 * Full sheet: all comments in a bottom-sheet modal with the MsComposer pinned at bottom.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowBendUpLeft, Heart, X } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsComposer } from '@/components/MsComposer';
import { MsAvatar } from '@/components/MsAvatar';
import { T } from '@/constants/theme';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Comment {
  id: string;
  authorName: string;
  authorHandle: string;
  avatarUrl: string | null;
  text: string;
  timestamp: string;
  likes: number;
  likedByMe: boolean;
  replyTo?: string | null;
}

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

function normalizeComment(raw: any): Comment {
  const name = raw.author?.full_name ?? raw.author?.name ?? raw.authorName ?? 'User';
  const username = raw.author?.username ?? raw.authorHandle?.replace('@', '') ?? '';
  return {
    id: raw.id ?? String(Math.random()),
    authorName: name,
    authorHandle: username ? `@${username}` : '',
    avatarUrl: raw.author?.avatar_url ?? raw.author?.avatarUrl ?? null,
    text: raw.body ?? raw.text ?? raw.content ?? '',
    timestamp: fmtTimeAgo(raw.created_at ?? raw.createdAt),
    likes: raw.like_count ?? raw.likes ?? 0,
    likedByMe: raw.liked_by_me ?? raw.likedByMe ?? false,
    replyTo: raw.reply_to ?? raw.replyTo ?? null,
  };
}

function useComments(postId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('@ms_access_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const raw = await apiFetch<{ comments: unknown[] }>(
          `/posts/${postId}/comments`,
          { headers },
        );
        if (cancelled) return;
        const list = Array.isArray(raw?.comments) ? raw.comments.map(normalizeComment) : [];
        setComments(list);
      } catch {
        if (!cancelled) setComments([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  return { comments, setComments, isLoading };
}

// ─── Single comment row ───────────────────────────────────────────────────────

function CommentRow({
  comment,
  onLike,
  onReply,
  showDivider = true,
}: {
  comment: Comment;
  onLike?: (id: string) => void;
  onReply?: (comment: Comment) => void;
  showDivider?: boolean;
}) {
  return (
    <View style={[rowStyles.wrap, showDivider && rowStyles.divider]}>
      {/* Avatar */}
      <MsAvatar
        size={34}
        initials={nameInitials(comment.authorName)}
        imageUri={comment.avatarUrl ?? undefined}
      />

      {/* Content */}
      <View style={rowStyles.body}>
        {/* Reply-to context */}
        {comment.replyTo && (
          <View style={rowStyles.replyContext}>
            <ArrowBendUpLeft size={10} color={T.ACCENT} />
            <Text style={rowStyles.replyContextText} numberOfLines={1}>
              {comment.replyTo}
            </Text>
          </View>
        )}

        {/* Header */}
        <View style={rowStyles.header}>
          <Text style={rowStyles.name}>{comment.authorName}</Text>
          {!!comment.authorHandle && (
            <Text style={rowStyles.handle}>{comment.authorHandle}</Text>
          )}
          <Text style={rowStyles.time}>{comment.timestamp}</Text>
        </View>

        {/* Text — reuses the pill-bubble design language */}
        <View style={rowStyles.textBubble}>
          <Text style={rowStyles.text}>{comment.text}</Text>
        </View>

        {/* Actions */}
        <View style={rowStyles.actions}>
          <TouchableOpacity
            style={rowStyles.actionBtn}
            onPress={() => onLike?.(comment.id)}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Heart
              size={14}
              color={comment.likedByMe ? T.ACCENT : T.TEXT_3}
              weight={comment.likedByMe ? 'fill' : 'regular'}
            />
            {comment.likes > 0 && (
              <Text style={[rowStyles.likeCount, comment.likedByMe && rowStyles.likeCountActive]}>
                {comment.likes}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={rowStyles.actionBtn}
            onPress={() => onReply?.(comment)}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <ArrowBendUpLeft size={14} color={T.TEXT_3} />
            <Text style={rowStyles.replyLabel}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  replyContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  replyContextText: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    color: T.ACCENT,
    flex: 1,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 12 },
  handle: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10 },
  time: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10, marginLeft: 'auto' },
  // Pill-shaped text area — consistent with MsTextBubble styling
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

function CommentsModal({
  visible,
  onClose,
  postId,
  totalCount,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string;
  totalCount: number;
}) {
  const insets = useSafeAreaInsets();
  const { comments, setComments, isLoading } = useComments(postId);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const handleSend = async () => {
    if (!text.trim()) return;
    const newComment: Comment = {
      id: `local_${Date.now()}`,
      authorName: 'You',
      authorHandle: '',
      avatarUrl: null,
      text: text.trim(),
      timestamp: 'just now',
      likes: 0,
      likedByMe: false,
      replyTo: replyTo?.authorName ?? null,
    };
    setComments((prev) => [newComment, ...prev]);
    setText('');
    setReplyTo(null);
    // TODO: call createComment API
  };

  const handleLike = (id: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, likedByMe: !c.likedByMe, likes: c.likes + (c.likedByMe ? -1 : 1) }
          : c,
      ),
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={modalStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[modalStyles.sheet, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
          {/* Handle */}
          <View style={modalStyles.handle} />

          {/* Header */}
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Comments</Text>
            <Text style={modalStyles.count}>{totalCount}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={modalStyles.closeBtn}>
              <X size={18} color={T.TEXT_2} />
            </TouchableOpacity>
          </View>

          {/* List */}
          {isLoading ? (
            <ActivityIndicator style={modalStyles.loader} color={T.TEXT_3} />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              renderItem={({ item, index }) => (
                <CommentRow
                  comment={item}
                  showDivider={index < comments.length - 1}
                  onLike={handleLike}
                  onReply={(c) => setReplyTo(c)}
                />
              )}
              contentContainerStyle={modalStyles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={modalStyles.emptyWrap}>
                  <Text style={modalStyles.emptyText}>No comments yet. Be the first!</Text>
                </View>
              }
            />
          )}

          {/* Composer */}
          <View style={modalStyles.composerWrap}>
            <MsComposer
              mode="comment"
              value={text}
              onChangeText={setText}
              onSend={handleSend}
              placeholder={replyTo ? `Reply to ${replyTo.authorName}…` : 'Add a comment…'}
              replyTo={replyTo ? { authorName: replyTo.authorName, onDismiss: () => setReplyTo(null) } : null}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,5,8,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '88%',
    paddingTop: 12,
    ...T.SHADOWS.hard,
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
  emptyWrap: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 14 },
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
  const { comments, setComments, isLoading } = useComments(postId);
  const [modalOpen, setModalOpen] = useState(false);
  const totalCount = comments.length;
  const preview = comments.slice(0, previewCount);

  const handleLike = (id: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, likedByMe: !c.likedByMe, likes: c.likes + (c.likedByMe ? -1 : 1) }
          : c,
      ),
    );
  };

  return (
    <View style={sectionStyles.wrap}>
      <View style={sectionStyles.header}>
        <Text style={sectionStyles.title}>💬 Comments</Text>
        <Text style={sectionStyles.total}>{totalCount.toLocaleString()}</Text>
      </View>

      {preview.map((c, i) => (
        <CommentRow
          key={c.id}
          comment={c}
          showDivider={i < preview.length - 1}
          onLike={handleLike}
          onReply={() => setModalOpen(true)}
        />
      ))}

      <TouchableOpacity style={sectionStyles.viewAll} onPress={() => setModalOpen(true)} activeOpacity={0.7}>
        <Text style={sectionStyles.viewAllText}>
          View all {totalCount.toLocaleString()} comments
        </Text>
      </TouchableOpacity>

      <CommentsModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        postId={postId}
        totalCount={totalCount}
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
