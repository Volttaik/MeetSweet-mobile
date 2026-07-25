import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChatCircle, DotsThree, Lock, PaperPlaneTilt } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsPostCard } from '@/components/MsPostCard';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { toast } from '@/components/MsToast';
import { useAuth } from '@/contexts/AuthContext';
import {
  addComment,
  addReply,
  deleteComment,
  editComment,
  getComments,
  getPost,
  reportPost,
  type Comment,
  type Post,
} from '@/services/posts';

function initials(name: string) {
  return name.split(' ').map((part) => part[0]?.toUpperCase() ?? '').slice(0, 2).join('');
}

export default function PostDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);

  // Comment action sheet state
  const [menuComment, setMenuComment] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Comment | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [postResult, commentResult] = await Promise.all([getPost(id), getComments(id)]);
      setPost(postResult.post);
      setComments(commentResult.comments);
      setError('');
    } catch {
      setError('This post is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const submitComment = async () => {
    const body = draft.trim();
    if (!body || !id || sending) return;
    setSending(true);
    try {
      const result = replyingTo
        ? await addReply(id, replyingTo.id, body)
        : await addComment(id, body);
      if (replyingTo) {
        setComments((items) =>
          items.map((item) =>
            item.id === replyingTo.id
              ? { ...item, replyCount: item.replyCount + 1 }
              : item,
          ),
        );
      } else {
        setComments((items) => [...items, result.comment]);
        setPost((current) =>
          current ? { ...current, commentCount: current.commentCount + 1 } : current,
        );
      }
      setDraft('');
      setReplyingTo(null);
    } catch {
      toast.error('Could not post comment');
    } finally {
      setSending(false);
    }
  };

  const submitEdit = async () => {
    if (!editingComment || !editDraft.trim() || !id) return;
    const prev = editingComment.body;
    setComments((items) =>
      items.map((item) =>
        item.id === editingComment.id ? { ...item, body: editDraft.trim() } : item,
      ),
    );
    setEditingComment(null);
    try {
      await editComment(id, editingComment.id, editDraft.trim());
      toast.success('Comment updated');
    } catch {
      // revert
      setComments((items) =>
        items.map((item) =>
          item.id === editingComment.id ? { ...item, body: prev } : item,
        ),
      );
      toast.error('Could not update comment');
    }
  };

  const doDeleteComment = async () => {
    if (!deleteConfirm || !id) return;
    const target = deleteConfirm;
    setComments((items) => items.filter((item) => item.id !== target.id));
    setPost((current) =>
      current
        ? { ...current, commentCount: Math.max(0, current.commentCount - (target.parentId ? 0 : 1)) }
        : current,
    );
    setDeleteConfirm(null);
    try {
      await deleteComment(id, target.id);
      toast.success('Comment deleted');
    } catch {
      toast.error('Could not delete comment');
      load();
    }
  };

  const copyComment = (comment: Comment) => {
    Share.share({ message: comment.body }).catch(() => {});
  };

  const mentionUser = (comment: Comment) => {
    setReplyingTo(comment);
    setDraft(`@${comment.author.username} `);
  };

  const buildCommentActions = (comment: Comment): ActionItem[] => {
    const own = comment.author.id === user?.id;
    if (own) {
      return [
        { label: 'Edit', onPress: () => { setEditingComment(comment); setEditDraft(comment.body); } },
        { label: 'Copy', onPress: () => copyComment(comment) },
        { label: 'Delete', destructive: true, onPress: () => setDeleteConfirm(comment) },
      ];
    }
    return [
      { label: 'Reply', onPress: () => setReplyingTo(comment) },
      { label: 'Mention', onPress: () => mentionUser(comment) },
      { label: 'Copy', onPress: () => copyComment(comment) },
      {
        label: 'Report',
        destructive: true,
        onPress: () => {
          reportPost(id!, 'inappropriate').catch(() => {});
          toast.info('Comment reported');
        },
      },
    ];
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Loading post…</Text>
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <MsEmptyState
          title="Post unavailable"
          message={error}
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 48}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.iconButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        <Pressable
          style={styles.iconButton}
          onPress={() =>
            Share.share({
              message: `Check out this post on MeetSweet!`,
            }).catch(() => {})
          }
          accessibilityLabel="Share post"
        >
          <DotsThree size={22} color={T.TEXT_2} />
        </Pressable>
      </View>

      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <MsPostCard
              post={post}
              currentUserId={user?.id}
              onAuthorPress={() => router.push(`/creator/${post.author.username}`)}
            />
            <View style={styles.commentsHeader}>
              <ChatCircle size={18} color={T.TEXT_2} />
              <Text style={styles.commentsTitle}>Comments</Text>
              <Text style={styles.commentsCount}>{comments.length}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.commentRow}
            onLongPress={() => setMenuComment(item)}
            delayLongPress={400}
          >
            <MsAvatar
              size={34}
              initials={initials(item.author.name)}
              imageUri={item.author.avatarUrl ?? undefined}
            />
            <View style={styles.commentBody}>
              <View style={styles.commentTop}>
                <Text style={styles.commentAuthor}>{item.author.name}</Text>
                <Pressable onPress={() => setMenuComment(item)} hitSlop={8}>
                  <DotsThree size={18} color={T.TEXT_2} />
                </Pressable>
              </View>
              <Text style={styles.commentText}>{item.body}</Text>
              <View style={styles.commentMeta}>
                <Pressable onPress={() => setReplyingTo(item)}>
                  <Text style={styles.replyAction}>
                    {item.replyCount > 0 ? `${item.replyCount} replies · Reply` : 'Reply'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyComments}>
            <Lock size={18} color={T.TEXT_3} />
            <Text style={styles.muted}>Start the conversation.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Inline edit bar */}
      {editingComment ? (
        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.replyingBar}>
            <Text style={styles.replyingText}>Editing comment</Text>
            <Pressable onPress={() => setEditingComment(null)}>
              <Text style={styles.cancelReply}>Cancel</Text>
            </Pressable>
          </View>
          <View style={styles.composer}>
            <TextInput
              value={editDraft}
              onChangeText={setEditDraft}
              placeholder="Edit your comment…"
              placeholderTextColor={T.TEXT_3}
              style={styles.input}
              multiline
              maxLength={500}
              autoFocus
            />
            <Pressable
              style={[styles.sendButton, !editDraft.trim() && styles.sendDisabled]}
              onPress={submitEdit}
              disabled={!editDraft.trim()}
            >
              <PaperPlaneTilt size={17} color={editDraft.trim() ? T.BG : T.TEXT_3} weight="fill" />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {replyingTo && (
            <View style={styles.replyingBar}>
              <Text style={styles.replyingText}>
                Replying to {replyingTo.author.name}
              </Text>
              <Pressable onPress={() => { setReplyingTo(null); setDraft(''); }}>
                <Text style={styles.cancelReply}>Cancel</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={replyingTo ? 'Write a reply…' : 'Add a comment…'}
              placeholderTextColor={T.TEXT_3}
              style={styles.input}
              multiline
              maxLength={500}
            />
            <Pressable
              style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]}
              onPress={submitComment}
              disabled={!draft.trim() || sending}
            >
              <PaperPlaneTilt
                size={17}
                color={draft.trim() ? T.BG : T.TEXT_3}
                weight="fill"
              />
            </Pressable>
          </View>
        </View>
      )}

      {/* Comment action sheet */}
      <MsActionSheet
        visible={!!menuComment}
        title={menuComment?.author.name}
        subtitle={`@${menuComment?.author.username ?? ''}`}
        actions={menuComment ? buildCommentActions(menuComment) : []}
        onClose={() => setMenuComment(null)}
      />

      {/* Delete comment confirmation */}
      <MsConfirmDialog
        visible={!!deleteConfirm}
        title="Delete comment?"
        message="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={doDeleteComment}
        onCancel={() => setDeleteConfirm(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },
  muted: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 14 },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  headerTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 16 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingBottom: 12 },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },
  commentsTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 16 },
  commentsCount: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 14 },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  commentBody: { flex: 1 },
  commentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentAuthor: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13 },
  commentText: {
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  commentMeta: { flexDirection: 'row', gap: 16, marginTop: 7 },
  replyAction: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12 },
  emptyComments: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  composerWrap: {
    backgroundColor: T.SURFACE,
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
  },
  replyingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  replyingText: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12 },
  cancelReply: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.lg,
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 10,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: T.SURFACE_2 },
});
