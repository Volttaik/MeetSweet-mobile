/**
 * MsCommentRoomPanel — reusable Comment Room panel (POST ↓ COMMENTS).
 *
 * Implements the "Comment Room feels like part of the post, not an unrelated
 * screen" requirement:
 *
 *   BEFORE  = full post visible
 *   AFTER   = reduced post on top + comments panel below filling the freed space
 *
 * The panel is designed to be mounted INSIDE the post screen's layout. The
 * post screen animates the post content height (shrink) and this panel takes
 * the remaining space. When the panel closes, the post expands back.
 *
 * Visual/interaction reference: YouTube comments (positioning, density,
 * hierarchy, sort bar, inline composer, like/reply actions) — adapted to
 * MeetSweet's design system. No YouTube branding/icons are used.
 *
 * Serverless refresh: polls ONLY this Comment Room (change marker), never
 * every post. No typing indicators, presence, or live cursors.
 *
 * Data model: post → commentRoomId → comments[]. Each comment has authorId.
 * The Comment Room is the destination/context; the author is who created it.
 *
 * Usage:
 *   <MsCommentRoomPanel
 *     postId={post.id}
 *     commentRoomId={post.commentRoomId}
 *     commentsEnabled={post.commentsEnabled}
 *   />
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowBendUpLeft, ChatCircle, Heart, SlidersHorizontal, Trash } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { CommentShimmerSkeleton } from '@/components/MsCommentsSheet';
import { useAuth } from '@/contexts/AuthContext';
import {
  getCommentRoom,
  getRoomComments,
  submitRoomComment,
  editRoomComment,
  deleteRoomComment,
  likeRoomComment,
  unlikeRoomComment,
  checkCommentRoomChanges,
  type CommentRoomComment,
} from '@/services/comment-room-service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function nameInitials(name: string): string {
  return (name ?? '')
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function fmtTimeAgo(iso: string | undefined | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type SortMode = 'top' | 'new';

// ─── Comment row (YouTube-style visual hierarchy) ───────────────────────────

interface PanelCommentRowProps {
  comment: CommentRoomComment;
  currentUserId: string;
  isNewest?: boolean;
  onLike: (id: string) => void;
  onUnlike: (id: string) => void;
  onMenu: (comment: CommentRoomComment) => void;
  onReply: (comment: CommentRoomComment) => void;
}

function PanelCommentRow({
  comment,
  currentUserId,
  isNewest = false,
  onLike,
  onUnlike,
  onMenu,
  onReply,
}: PanelCommentRowProps) {
  const isOwn = comment.author.id === currentUserId;

  return (
    <MsCommentIn animateOnMount={comment.id} enabled={isNewest}>
      <View style={styles.row}>
        <MsAvatar
          size={34}
          initials={nameInitials(comment.author.name)}
          imageUri={comment.author.avatarUrl ?? undefined}
        />
        <View style={styles.rowBody}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowAuthor} numberOfLines={1}>
              {comment.author.name}
            </Text>
            {!!comment.author.username && (
              <Text style={styles.rowHandle} numberOfLines={1}>
                @{comment.author.username}
              </Text>
            )}
            <Text style={styles.rowTime}>{fmtTimeAgo(comment.createdAt)}</Text>
            {isOwn && (
              <Pressable onPress={() => onMenu(comment)} hitSlop={8} style={styles.rowMenuBtn}>
                <Trash size={12} color={T.TEXT_3} />
              </Pressable>
            )}
          </View>
          <Text style={styles.rowText}>{comment.body}</Text>
          <View style={styles.rowActions}>
            <TouchableOpacity
              style={styles.rowActionBtn}
              onPress={() => (comment.likedByMe ? onUnlike(comment.id) : onLike(comment.id))}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Heart
                size={14}
                color={comment.likedByMe ? T.ACCENT : T.TEXT_3}
                weight={comment.likedByMe ? 'fill' : 'regular'}
              />
              {comment.likeCount > 0 && (
                <Text style={[styles.rowLikeCount, comment.likedByMe && styles.rowLikeCountActive]}>
                  {comment.likeCount}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rowActionBtn}
              onPress={() => onReply(comment)}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <ArrowBendUpLeft size={14} color={T.TEXT_3} />
              <Text style={styles.rowReplyLabel}>Reply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </MsCommentIn>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export interface MsCommentRoomPanelProps {
  postId: string;
  commentRoomId: string | null | undefined;
  commentsEnabled?: boolean;
  /** Called when the user closes the panel (post expands back). */
  onClose?: () => void;
  /** Total comment count from the post (used for the header count). */
  totalCount?: number;
  /** Render a custom header element above the sort bar (e.g. "Post" title). */
  headerExtra?: React.ReactNode;
  /**
   * Optional SHARED progress value (0 = closed, 1 = open). When provided, the
   * panel uses it for its own fade AND the parent screen can interpolate the
   * SAME value to push the post content up / reduce its height. When omitted
   * the panel creates its own internal value.
   */
  progress?: Animated.Value;
}

export function MsCommentRoomPanel({
  postId,
  commentRoomId,
  commentsEnabled = true,
  onClose,
  totalCount = 0,
  headerExtra,
  progress: externalProgress,
}: MsCommentRoomPanelProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';

  const [comments, setComments] = useState<CommentRoomComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sort, setSort] = useState<SortMode>('top');
  const [roomEnabled, setRoomEnabled] = useState(commentsEnabled);
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<CommentRoomComment | null>(null);
  const [sending, setSending] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const pollMarkerRef = useRef<string | null>(null);

  // Push/reduce animation: when the panel opens, the post content above is
  // pushed upward (translateY) and its visible height reduced (scaleY).
  // When it closes, the post expands back. Lightweight + native driver.
  const internalProgress = useRef(new Animated.Value(0)).current;
  const openProgress = externalProgress ?? internalProgress;
  const openingRef = useRef(false);

  const openPanel = useCallback(() => {
    if (openingRef.current) return;
    openingRef.current = true;
    setPanelOpen(true);
    Animated.timing(openProgress, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start(() => {
      openingRef.current = false;
    });
  }, [openProgress]);

  const closePanel = useCallback(() => {
    if (openingRef.current) return;
    openingRef.current = true;
    Animated.timing(openProgress, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      openingRef.current = false;
      setPanelOpen(false);
      onClose?.();
    });
  }, [openProgress, onClose]);

  const postTranslateY = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -120],
  });
  const postScaleY = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.7],
  });
  const panelOpacity = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  // Resolve the room (identity comes from POST DATA — never guessed).
  const resolveRoom = useCallback(async () => {
    if (!commentRoomId) {
      setRoomEnabled(commentsEnabled);
      return;
    }
    try {
      const room = await getCommentRoom(commentRoomId);
      setRoomEnabled(room.commentsEnabled);
    } catch {
      setRoomEnabled(commentsEnabled);
    }
  }, [commentRoomId, commentsEnabled]);

  useEffect(() => {
    resolveRoom();
  }, [resolveRoom]);

  // Initial load + incremental marker seeding.
  const loadComments = useCallback(async () => {
    if (!commentRoomId) return;
    setLoading(true);
    try {
      const res = await getRoomComments(commentRoomId, {});
      setComments((prev) => {
        const tempIds = new Set(prev.filter((c) => c.id.startsWith('tmp-')).map((c) => c.id));
        const merged = [...prev.filter((c) => tempIds.has(c.id)), ...res.comments];
        const seen = new Set<string>();
        return merged.filter((c) => (seen.has(c.id) ? false : !!seen.add(c.id)));
      });
      pollMarkerRef.current = res.comments[0]?.id ?? null;
      setLoadError('');
    } catch {
      setLoadError('Could not load comments');
    } finally {
      setLoading(false);
    }
  }, [commentRoomId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Poll ONLY this Comment Room (incremental change marker, serverless).
  // New comments appear without manual refresh. No typing indicators.
  useEffect(() => {
    if (!commentRoomId) return;
    const interval = setInterval(async () => {
      const changes = await checkCommentRoomChanges(
        commentRoomId,
        pollMarkerRef.current,
      ).catch(() => null);
      if (!changes || !changes.changed) return;
      pollMarkerRef.current = changes.marker ?? pollMarkerRef.current;
      const fresh = changes.comments;
      if (!fresh?.length) return;
      setComments((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newOnes = fresh.filter((c) => !existingIds.has(c.id));
        return newOnes.length ? [...newOnes, ...prev] : prev;
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [commentRoomId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleLike = useCallback(async (commentId: string) => {
    if (!commentRoomId) return;
    setComments((prev) =>
      prev.map((c) => c.id === commentId ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 } : c),
    );
    try {
      const res = await likeRoomComment(commentRoomId, commentId);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, likeCount: res.likeCount } : c));
    } catch {
      setComments((prev) =>
        prev.map((c) => c.id === commentId ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) } : c),
      );
    }
  }, [commentRoomId]);

  const handleUnlike = useCallback(async (commentId: string) => {
    if (!commentRoomId) return;
    setComments((prev) =>
      prev.map((c) => c.id === commentId ? { ...c, likedByMe: false, likeCount: Math.max(0, c.likeCount - 1) } : c),
    );
    try {
      const res = await unlikeRoomComment(commentRoomId, commentId);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, likeCount: res.likeCount } : c));
    } catch {
      setComments((prev) =>
        prev.map((c) => c.id === commentId ? { ...c, likedByMe: true, likeCount: c.likeCount + 1 } : c),
      );
    }
  }, [commentRoomId]);

  const handleMenu = useCallback((comment: CommentRoomComment) => {
    const own = comment.author.id === currentUserId;
    const options = own ? ['Edit', 'Delete'] : ['Report'];
    Alert.alert('Comment', undefined, [
      ...options.map((option) => ({
        text: option,
        style: option === 'Delete' ? 'destructive' as const : 'default' as const,
        onPress: () => {
          if (option === 'Edit') {
            Alert.prompt(
              'Edit comment',
              undefined,
              async (body) => {
                if (!body?.trim() || !commentRoomId) return;
                try {
                  await editRoomComment(commentRoomId, comment.id, body.trim());
                  setComments((items) => items.map((item) =>
                    item.id === comment.id ? { ...item, body: body.trim() } : item,
                  ));
                } catch {
                  Alert.alert('Could not edit comment', 'Please try again.');
                }
              },
              'plain-text',
              comment.body,
            );
          } else if (option === 'Delete') {
            Alert.alert('Delete comment?', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  if (!commentRoomId) return;
                  try {
                    await deleteRoomComment(commentRoomId, comment.id);
                    setComments((items) => items.filter((item) => item.id !== comment.id));
                  } catch {
                    Alert.alert('Could not delete comment', 'Please try again.');
                  }
                },
              },
            ]);
          } else if (option === 'Report') {
            Alert.alert('Report comment', 'Thanks — our team will review this.');
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [commentRoomId, currentUserId]);

  const submit = useCallback(async () => {
    const body = draft.trim();
    if (!body || !commentRoomId || sending) return;
    if (!roomEnabled) {
      Alert.alert('Comments are disabled', 'The author has turned off comments for this post.');
      return;
    }
    setSending(true);
    try {
      const result = await submitRoomComment(commentRoomId, body, { parentCommentId: replyingTo?.id });
      const next = [result.comment, ...comments];
      const seen = new Set<string>();
      setComments(next.filter((c) => (seen.has(c.id) ? false : !!seen.add(c.id))));
      pollMarkerRef.current = result.comment.id ?? pollMarkerRef.current;
      setDraft('');
      setReplyingTo(null);
    } catch {
      Alert.alert('Could not post comment', 'Please try again.');
    } finally {
      setSending(false);
    }
  }, [draft, commentRoomId, sending, roomEnabled, comments]);

  // Sorted list: "Top" = likeCount desc, "New" = createdAt desc.
  const sorted = useMemo(() => {
    const list = [...comments];
    if (sort === 'top') {
      list.sort((a, b) => b.likeCount - a.likeCount);
    } else {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [comments, sort]);

  // Whether the send button is enabled (empty comments cannot be submitted).
  const canSubmit = draft.trim().length > 0 && !sending && roomEnabled;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Collapsed entry — part of the post experience.
  if (!panelOpen) {
    return (
      <View style={styles.collapsedWrap}>
        {headerExtra}
        <Pressable style={styles.entryRow} onPress={openPanel} android_ripple={{ color: T.SURFACE_2 }}>
          <View style={styles.entryIconWrap}>
            <ChatCircle size={16} color={roomEnabled ? T.ACCENT : T.TEXT_3} weight="fill" />
          </View>
          <View style={styles.entryTextWrap}>
            <Text style={styles.entryTitle}>
              {roomEnabled ? 'Comments' : 'Comments · Off'}
            </Text>
            <Text style={styles.entrySubtitle}>
              {roomEnabled
                ? totalCount > 0
                  ? `${totalCount.toLocaleString()} ${totalCount === 1 ? 'comment' : 'comments'}`
                  : 'Add a comment…'
                : 'Comments are turned off'}
            </Text>
          </View>
          <Text style={styles.entryChevron}>›</Text>
        </Pressable>
      </View>
    );
  }

  // Expanded — comments fill the freed space (POST ↓ COMMENTS).
  return (
    <Animated.View style={[styles.panel, { opacity: panelOpacity }]}>
      <KeyboardAvoidingView
        style={styles.panelKav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderLeft}>
            <ChatCircle size={18} color={T.ACCENT} weight="fill" />
            <Text style={styles.panelTitle}>Comments</Text>
            <Text style={styles.panelCount}>
              {Math.max(totalCount, comments.length).toLocaleString()}
            </Text>
          </View>
          <View style={styles.panelHeaderRight}>
            {!roomEnabled && <Text style={styles.panelOff}>Off</Text>}
            <TouchableOpacity style={styles.closeBtn} onPress={closePanel} hitSlop={8} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sort bar (YouTube-style) */}
        <View style={styles.sortRow}>
          <SlidersHorizontal size={13} color={T.TEXT_2} />
          <TouchableOpacity onPress={() => setSort('top')} hitSlop={6} activeOpacity={0.7}>
            <Text style={[styles.sortOption, sort === 'top' && styles.sortOptionActive]}>Top</Text>
          </TouchableOpacity>
          <Text style={styles.sortSep}>·</Text>
          <TouchableOpacity onPress={() => setSort('new')} hitSlop={6} activeOpacity={0.7}>
            <Text style={[styles.sortOption, sort === 'new' && styles.sortOptionActive]}>Newest</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panelDivider} />

        {/* Comment list */}
        {loading && comments.length === 0 ? (
          <CommentShimmerSkeleton />
        ) : loadError && comments.length === 0 ? (
          <View style={styles.centerFill}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item, index) => `${item.id || 'comment'}-${index}`}
            renderItem={({ item, index }) => (
              <PanelCommentRow
                comment={item}
                currentUserId={currentUserId}
                isNewest={index === 0}
                onLike={handleLike}
                onUnlike={handleUnlike}
                onMenu={handleMenu}
                onReply={setReplyingTo}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <ChatCircle size={26} color={T.TEXT_3} />
                <Text style={styles.emptyTitle}>
                  {roomEnabled ? 'No comments yet' : 'Comments are off'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {roomEnabled
                    ? 'Be the first to share your thoughts.'
                    : 'The author has turned off comments for this post.'}
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Composer — stays accessible while the panel is open; keyboard-safe. */}
        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {replyingTo && (
            <View style={styles.replyBar}>
              <Text style={styles.replyBarText} numberOfLines={1}>
                Replying to @{replyingTo.author.username || replyingTo.author.name}
              </Text>
              <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                <Text style={styles.replyBarX}>✕</Text>
              </Pressable>
            </View>
          )}
          {roomEnabled ? (
            <View style={styles.composerRow}>
              <MsAvatar
                size={30}
                initials={nameInitials(user?.name ?? 'U')}
                imageUri={user?.avatarUrl ?? undefined}
              />
              <View style={styles.inputPill}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Add a comment…"
                  placeholderTextColor={T.TEXT_3}
                  style={styles.input}
                  returnKeyType="send"
                  onSubmitEditing={canSubmit ? submit : undefined}
                  editable={roomEnabled}
                />
              </View>
              <TouchableOpacity
                style={[styles.sendBtn, (!canSubmit) && styles.sendBtnDisabled]}
                onPress={submit}
                disabled={!canSubmit}
                activeOpacity={0.7}
                hitSlop={6}
                accessibilityLabel="Send comment"
              >
                {sending ? (
                  <ActivityIndicator size={12} color="#fff" />
                ) : (
                  <Text style={styles.sendBtnText}>↑</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.disabledBar}>
              <Text style={styles.disabledBarText}>Comments are disabled for this post</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ─── Shared transform helpers for the post-content push/reduce animation ────
// The parent post screen uses these with the SAME progress Animated.Value that
// the panel animates, so the post is pushed upward and its visible height
// reduced while the panel fills the freed space — and expands back on close.

export function postContentTranslateY(progress: Animated.Value): Animated.AnimatedInterpolation<string | number> {
  return progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -120],
  });
}

export function postContentScaleY(progress: Animated.Value): Animated.AnimatedInterpolation<string | number> {
  return progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.7],
  });
}

export function postContentOpacity(progress: Animated.Value): Animated.AnimatedInterpolation<string | number> {
  return progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [1, 0.75, 0.6],
  });
}

const styles = StyleSheet.create({
  collapsedWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.BORDER,
    backgroundColor: T.BG,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  entryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryTextWrap: { flex: 1 },
  entryTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  entrySubtitle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, marginTop: 2 },
  entryChevron: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 20, paddingRight: 2 },

  panel: { flex: 1, backgroundColor: T.BG },
  panelKav: { flex: 1 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
  },
  panelHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 16 },
  panelCount: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13 },
  panelHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panelOff: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 12 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12 },

  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  sortOption: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 12 },
  sortOptionActive: { color: T.TEXT, fontFamily: T.FONT.semibold },
  sortSep: { color: T.TEXT_3, fontSize: 12 },

  panelDivider: { height: StyleSheet.hairlineWidth, backgroundColor: T.BORDER },

  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  errorText: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13 },

  listContent: { paddingBottom: 12 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 12 },
  rowSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: T.BORDER, marginLeft: 62 },
  rowBody: { flex: 1, gap: 3 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowAuthor: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 12, flexShrink: 1 },
  rowHandle: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10, flexShrink: 1 },
  rowTime: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10, marginLeft: 'auto' },
  rowMenuBtn: { padding: 2 },
  rowText: { color: T.TEXT, fontFamily: T.FONT.regular, fontSize: 13, lineHeight: 19, marginTop: 1 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  rowActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowLikeCount: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 11 },
  rowLikeCountActive: { color: T.ACCENT },
  rowReplyLabel: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 11 },

  emptyWrap: { alignItems: 'center', gap: 6, paddingVertical: 44, paddingHorizontal: 24 },
  emptyTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  emptySubtitle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, textAlign: 'center' },

  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.BORDER, paddingTop: 8, paddingHorizontal: 12 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.SURFACE_2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 6,
  },
  replyBarText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 11, flex: 1 },
  replyBarX: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 12, paddingLeft: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputPill: {
    flex: 1,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.full,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontFamily: T.FONT.bold, fontSize: 14 },
  disabledBar: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  disabledBarText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12 },
});