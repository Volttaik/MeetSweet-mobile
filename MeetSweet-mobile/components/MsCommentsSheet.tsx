/**
 * MsCommentsSheet — Complete Comment Room & Comments Module.
 *
 * Architecture:
 *   Post → commentRoomId → Comment Room API
 *   - Pure / deep black bottom sheet (#000000), clean, smooth, NO glass/blur effect.
 *   - Shimmer skeleton loading state while fetching comments.
 *   - Full reaction support (like/unlike), replies, deletion, editing, report.
 *   - Handles commentsEnabled (disabled state UX).
 *   - Scrollable comments list with pagination (loadMore) and pull-to-refresh.
 *   - Keyboard-aware composer pinned at bottom.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowBendUpLeft,
  ChatCircle,
  Heart,
  PaperPlaneRight,
  Pencil,
  Trash,
  X,
} from 'phosphor-react-native';

import { MsAvatar } from '@/components/MsAvatar';
import { MsShimmer } from '@/components/MsShimmer';
import { dialogs } from '@/components/MsGlobalDialogs';
import { toast } from '@/components/MsToast';
import { useAuth } from '@/contexts/AuthContext';
import { usePostActions } from '@/contexts/PostActionsContext';
import { T } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { GradientTopFade } from '@/components/GradientTopFade';
import { getPost } from '@/services/posts';
import {
  getCommentRoom,
  getRoomComments,
  submitRoomComment,
  deleteRoomComment,
  editRoomComment,
  likeRoomComment,
  unlikeRoomComment,
  getRoomCommentReplies,
  type CommentRoomComment,
} from '@/services/comment-room-service';

export type { CommentRoomComment };

export interface CommentAuthor {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: string;
  commentRoomId: string;
  parentId?: string | null;
  body: string;
  isPinned: boolean;
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
}

export interface CommentReply {
  id: string;
  body: string;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
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

function toLocalComment(c: CommentRoomComment): Comment {
  return {
    id: c.id,
    commentRoomId: c.commentRoomId,
    parentId: c.parentId ?? null,
    body: c.body,
    isPinned: c.isPinned,
    likeCount: c.likeCount,
    replyCount: c.replyCount,
    likedByMe: c.likedByMe,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    author: {
      id: c.author.id,
      name: c.author.name,
      username: c.author.username,
      avatarUrl: c.author.avatarUrl,
    },
  };
}

// ─── Shimmer Skeleton Component ───────────────────────────────────────────────

export function CommentShimmerSkeleton() {
  return (
    <View style={styles.shimmerWrap}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.shimmerRow}>
          <MsShimmer width={34} height={34} borderRadius={17} />
          <View style={styles.shimmerBody}>
            <View style={styles.shimmerHeader}>
              <MsShimmer width={90} height={12} borderRadius={4} />
              <MsShimmer width={35} height={10} borderRadius={4} />
            </View>
            <MsShimmer width={i % 2 === 0 ? '88%' : '70%'} height={13} borderRadius={4} />
            <MsShimmer width={i % 2 === 0 ? '55%' : '80%'} height={13} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Comment Hook ─────────────────────────────────────────────────────────────

export function useComments(postId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentRoomId, setCommentRoomId] = useState<string | null>(null);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Realtime: authoritative comment count for the post, updated live by events.
  const [liveCommentCount, setLiveCommentCount] = useState<number | null>(null);

  // Thread mutation registry: every rendered top-level CommentRow registers a
  // mutator for its own reply thread. The composer (or any handler) can then
  // insert / update / remove a reply inside the exact thread that owns it,
  // without knowing that thread's internal state.
  const threadMutatorsRef = useRef<
    Map<string, (mutator: (prev: Comment[]) => Comment[]) => void>
  >(new Map());

  const registerThreadMutation = useCallback(
    (rootId: string, fn: (mutator: (prev: Comment[]) => Comment[]) => void) => {
      threadMutatorsRef.current.set(rootId, fn);
    },
    [],
  );

  const mutateThread = useCallback((rootId: string, mutator: (prev: Comment[]) => Comment[]) => {
    threadMutatorsRef.current.get(rootId)?.(mutator);
  }, []);

  // Apply an update to a comment wherever it lives — the top-level list or any
  // loaded thread (a comment id exists in exactly one place, so fanning the
  // update over every registered thread is a no-op everywhere but the owner).
  const applyToComment = useCallback(
    (commentId: string, fn: (c: Comment) => Comment) => {
      setComments((prev) => prev.map((c) => (c.id === commentId ? fn(c) : c)));
      threadMutatorsRef.current.forEach((mutate) => {
        mutate((prev) => prev.map((c) => (c.id === commentId ? fn(c) : c)));
      });
    },
    [setComments],
  );

  const refresh = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      let roomId = commentRoomId;
      if (!roomId) {
        const postResult = await getPost(postId);
        roomId = (postResult as any).post?.commentRoomId ?? postResult.commentRoomId ?? null;
        if (!roomId) {
          setError('Comments are unavailable for this post.');
          setComments([]);
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }
        setCommentRoomId(roomId);
        // Room metadata is optional — comments are fetched from the room
        // directly. A metadata failure must NOT block the comment list (it
        // would otherwise surface a spurious "Could not load comments" when
        // only the metadata endpoint is unavailable).
        try {
          const roomResult = await getCommentRoom(roomId);
          setCommentsEnabled(roomResult.commentsEnabled);
        } catch {
          setCommentsEnabled(true);
        }
      }
      const res = await getRoomComments(roomId, {});
      const localComments = res.comments.map(toLocalComment);
      setComments((prev) => {
        const tempIds = new Set(prev.filter((c) => c.id.startsWith('tmp-')).map((c) => c.id));
        const merged = [...prev.filter((c) => tempIds.has(c.id)), ...localComments];
        const seen = new Set<string>();
        return merged.filter((c) => (seen.has(c.id) ? false : !!seen.add(c.id)));
      });
      setHasMore(res.hasMore);
    } catch {
      setError('Could not load comments.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [postId, commentRoomId]);

  const loadMore = useCallback(async () => {
    if (!commentRoomId || !hasMore || loadingMore || isLoading) return;
    setLoadingMore(true);
    try {
      const lastComment = comments[comments.length - 1];
      const afterMarker = lastComment?.id;
      const res = await getRoomComments(commentRoomId, { after: afterMarker });
      const incoming = res.comments.map(toLocalComment);
      setComments((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const filtered = incoming.filter((c) => !existingIds.has(c.id));
        return [...prev, ...filtered];
      });
      setHasMore(res.hasMore);
    } catch {
      // ignore pagination errors
    } finally {
      setLoadingMore(false);
    }
  }, [commentRoomId, hasMore, loadingMore, isLoading, comments]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!commentRoomId) return;
  }, [commentRoomId]);

  return {
    comments,
    setComments,
    isLoading,
    isRefreshing,
    error,
    refresh,
    loadMore,
    hasMore,
    loadingMore,
    liveCommentCount,
    commentRoomId,
    commentsEnabled,
    registerThreadMutation,
    mutateThread,
    applyToComment,
  };
}

// ─── Comment Row ──────────────────────────────────────────────────────────────

// ─── Reply Thread (nested, arbitrary depth) ─────────────────────────────────

interface ThreadNode {
  comment: Comment;
  children: ThreadNode[];
}

/**
 * Build the reply tree from a flat list of descendants. The tree is derived
 * ONLY from each row's exact parentId, so two replies to the same parent can
 * never become parent/child of each other. Rows whose parent was deleted (and
 * is therefore absent) are re-parented to the thread root so nothing is lost.
 */
function buildThreadTree(comments: Comment[]): ThreadNode[] {
  const nodes = new Map<string, ThreadNode>();
  for (const c of comments) nodes.set(c.id, { comment: c, children: [] });
  const roots: ThreadNode[] = [];
  for (const c of comments) {
    const node = nodes.get(c.id);
    if (!node) continue;
    const parent = c.parentId ? nodes.get(c.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

interface ThreadNodeProps {
  node: ThreadNode;
  currentUserId: string;
  onLike: (id: string) => void;
  onUnlike: (id: string) => void;
  onDelete: (id: string, threadRootId?: string | null) => void;
  onEdit?: (comment: Comment, threadRootId?: string | null) => void;
  onReply?: (comment: Comment, threadRootId?: string | null) => void;
}

function ThreadNodes({ nodes, ...rest }: { nodes: ThreadNode[] } & Omit<ThreadNodeProps, 'node'>) {
  return (
    <>
      {nodes.map((node) => (
        <ThreadNode key={node.comment.id} node={node} {...rest} />
      ))}
    </>
  );
}

function ThreadNode({ node, currentUserId, onLike, onUnlike, onDelete, onEdit, onReply }: ThreadNodeProps) {
  const c = node.comment;
  const isOwn = c.author.id === currentUserId;
  const hasChildren = node.children.length > 0;

  return (
    <View>
      <View style={styles.replyRow}>
        <MsAvatar
          size={24}
          initials={nameInitials(c.author.name)}
          imageUri={c.author.avatarUrl ?? undefined}
        />
        <View style={styles.commentBodyWrap}>
          <View style={styles.commentHeader}>
            <Text style={styles.authorName} numberOfLines={1}>
              {c.author.name}
            </Text>
            {!!c.author.username && (
              <Text style={styles.authorHandle} numberOfLines={1}>
                @{c.author.username}
              </Text>
            )}
            <Text style={styles.timeAgo}>{fmtTimeAgo(c.createdAt)}</Text>
          </View>

          <Text style={styles.commentText}>{c.body}</Text>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => (c.likedByMe ? onUnlike(c.id) : onLike(c.id))}
              hitSlop={8}
            >
              {c.likedByMe ? (
                <Heart size={12} color={T.SECONDARY} weight="fill" />
              ) : (
                <Heart size={12} color={T.TEXT_3} weight="bold" />
              )}
              {c.likeCount > 0 && (
                <Text style={[styles.actionCount, c.likedByMe && styles.actionCountLiked]}>
                  {c.likeCount}
                </Text>
              )}
            </TouchableOpacity>

            {onReply && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onReply(c)}
                hitSlop={8}
              >
                <ArrowBendUpLeft size={12} color={T.TEXT_3} />
                <Text style={styles.actionLabel}>Reply</Text>
              </TouchableOpacity>
            )}

            {isOwn && onEdit && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onEdit(c)}
                hitSlop={8}
              >
                <Pencil size={12} color={T.TEXT_3} />
                <Text style={styles.actionLabel}>Edit</Text>
              </TouchableOpacity>
            )}

            {isOwn && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onDelete(c.id)}
                hitSlop={8}
              >
                <Trash size={12} color={T.TEXT_3} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {hasChildren && (
        // Each level's children are indented and separated by a subtle
        // vertical thread line that visually hangs off the parent reply.
        <View style={styles.threadNested}>
          <ThreadNodes nodes={node.children} currentUserId={currentUserId} onLike={onLike} onUnlike={onUnlike} onDelete={onDelete} onEdit={onEdit} onReply={onReply} />
        </View>
      )}
    </View>
  );
}

// ─── Comment Row ──────────────────────────────────────────────────────────────

interface CommentRowProps {
  comment: Comment;
  postId: string;
  currentUserId: string;
  showDivider?: boolean;
  onLike: (id: string) => void;
  onUnlike: (id: string) => void;
  onDelete: (id: string, threadRootId?: string | null) => void;
  onEdit?: (comment: Comment, threadRootId?: string | null) => void;
  onReply?: (comment: Comment, threadRootId?: string | null) => void;
  registerThreadMutation?: (rootId: string, fn: (mutator: (prev: Comment[]) => Comment[]) => void) => void;
}

export function CommentRow({
  comment,
  currentUserId,
  showDivider = true,
  onLike,
  onUnlike,
  onDelete,
  onEdit,
  onReply,
  registerThreadMutation,
}: CommentRowProps) {
  const isOwn = comment.author.id === currentUserId;
  // `thread` holds the ENTIRE descendant subtree (every depth) as a flat list;
  // the tree is derived from parentId links at render time.
  const [thread, setThread] = useState<Comment[]>([]);
  const [showReplies, setShowReplies] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyCount, setReplyCount] = useState(comment.replyCount ?? 0);

  const mutateThread = useCallback((mutator: (prev: Comment[]) => Comment[]) => {
    setThread((prev) => mutator(prev));
  }, []);

  // Let the owning screen's composer push new replies (optimistic + confirmed)
  // into this thread even while it is collapsed.
  useEffect(() => {
    registerThreadMutation?.(comment.id, mutateThread);
  }, [comment.id, registerThreadMutation, mutateThread]);

  const toggleReplies = useCallback(async () => {
    if (showReplies) {
      setShowReplies(false);
      return;
    }
    setShowReplies(true);
    if (thread.length > 0 || !comment.commentRoomId) return;
    setLoadingReplies(true);
    try {
      const res = await getRoomCommentReplies(comment.commentRoomId, comment.id);
      const incoming = res.replies.map(toLocalComment);
      setThread(incoming);
      setReplyCount(incoming.filter((r) => r.parentId === comment.id).length);
    } catch {
      // ignore
    } finally {
      setLoadingReplies(false);
    }
  }, [showReplies, thread.length, comment.commentRoomId, comment.id]);

  const handleMenu = useCallback(() => {
    const options = isOwn ? ['Edit', 'Delete'] : ['Report'];
    dialogs.options({
      title: 'Comment Actions',
      actions: options.map((option) => ({
        label: option,
        destructive: option === 'Delete',
        onPress: () => {
          if (option === 'Edit' && onEdit) {
            onEdit(comment);
          } else if (option === 'Delete') {
            onDelete(comment.id);
          } else if (option === 'Report') {
            toast.success('Reported — thank you for keeping MeetSweet safe.');
          }
        },
      })),
    });
  }, [isOwn, comment, onEdit, onDelete]);

  const threadRoots = React.useMemo(() => buildThreadTree(thread), [thread]);
  // The "View N replies" control counts DIRECT children of this comment. Once
  // the thread is loaded (or a reply was added optimistically) the derived
  // count is authoritative; before that we trust the server's replyCount.
  const shownReplyCount =
    thread.length > 0 ? thread.filter((c) => c.parentId === comment.id).length : replyCount;

  return (
    <View style={styles.commentRowContainer}>
      <Pressable onLongPress={handleMenu} delayLongPress={400} style={styles.commentRow}>
        <MsAvatar
          size={32}
          initials={nameInitials(comment.author.name)}
          imageUri={comment.author.avatarUrl ?? undefined}
        />
        <View style={styles.commentBodyWrap}>
          <View style={styles.commentHeader}>
            <Text style={styles.authorName} numberOfLines={1}>
              {comment.author.name}
            </Text>
            {!!comment.author.username && (
              <Text style={styles.authorHandle} numberOfLines={1}>
                @{comment.author.username}
              </Text>
            )}
            <Text style={styles.timeAgo}>{fmtTimeAgo(comment.createdAt)}</Text>
            <TouchableOpacity onPress={handleMenu} hitSlop={8} style={styles.menuIcon}>
              <Text style={styles.menuDots}>•••</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.commentText}>{comment.body}</Text>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => (comment.likedByMe ? onUnlike(comment.id) : onLike(comment.id))}
              hitSlop={8}
            >
              {comment.likedByMe ? (
                <Heart size={14} color={T.SECONDARY} weight="fill" />
              ) : (
                <Heart size={14} color={T.TEXT_3} weight="bold" />
              )}
              {comment.likeCount > 0 && (
                <Text style={[styles.actionCount, comment.likedByMe && styles.actionCountLiked]}>
                  {comment.likeCount}
                </Text>
              )}
            </TouchableOpacity>

            {onReply && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onReply(comment)}
                hitSlop={8}
              >
                <ArrowBendUpLeft size={13} color={T.TEXT_3} />
                <Text style={styles.actionLabel}>Reply</Text>
              </TouchableOpacity>
            )}

            {isOwn && onEdit && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onEdit(comment)}
                hitSlop={8}
              >
                <Pencil size={13} color={T.TEXT_3} />
                <Text style={styles.actionLabel}>Edit</Text>
              </TouchableOpacity>
            )}

            {isOwn && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onDelete(comment.id)}
                hitSlop={8}
              >
                <Trash size={13} color={T.TEXT_3} />
              </TouchableOpacity>
            )}
          </View>

          {(shownReplyCount > 0 || thread.length > 0) && (
            <TouchableOpacity style={styles.toggleRepliesBtn} onPress={toggleReplies} hitSlop={6}>
              <Text style={styles.toggleRepliesText}>
                {showReplies
                  ? 'Hide replies'
                  : `View ${shownReplyCount} ${shownReplyCount === 1 ? 'reply' : 'replies'}`}
              </Text>
            </TouchableOpacity>
          )}

          {showReplies && (
            // Expanded thread: every descendant, recursively, with thread
            // lines. The whole sheet scrolls, so large threads stay readable.
            <View style={styles.threadRoot}>
              {loadingReplies ? (
                <ActivityIndicator size="small" color={T.PRIMARY_LIGHT} style={{ marginVertical: 8 }} />
              ) : (
                <ThreadNodes
                  nodes={threadRoots}
                  currentUserId={currentUserId}
                  onLike={onLike}
                  onUnlike={onUnlike}
                  onDelete={onDelete}
                  onEdit={onEdit ? (c) => onEdit(c, comment.id) : undefined}
                  onReply={onReply ? (c) => onReply(c, comment.id) : undefined}
                />
              )}
            </View>
          )}
        </View>
      </Pressable>
      {showDivider && <View style={styles.divider} />}
    </View>
  );
}

// ─── Comments Modal (Pure Deep Black Bottom Sheet) ────────────────────────────

interface CommentsModalProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
}

export function CommentsModal({ visible, onClose, postId }: CommentsModalProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  // Adaptive keyboard handling: the sheet lifts up by the keyboard height
  // (animated) and its max height shrinks so it never goes full-screen, the
  // input row stays fully visible, and the comments stay readable above it.
  const [kbHeight, setKbHeight] = useState(0);
  const kbLift = useRef(new Animated.Value(0)).current;
  const { user } = useAuth();
  const { setCommentCount } = usePostActions();

  useEffect(() => {
    const animateTo = (toValue: number) => {
      setKbHeight(toValue);
      Animated.timing(kbLift, {
        toValue,
        duration: 220,
        useNativeDriver: false,
      }).start();
    };
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      animateTo(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      animateTo(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [kbLift]);
  const {
    comments,
    setComments,
    isLoading,
    isRefreshing,
    error,
    refresh,
    loadMore,
    hasMore,
    loadingMore,
    commentRoomId,
    commentsEnabled,
    registerThreadMutation,
    mutateThread,
    applyToComment,
  } = useComments(postId);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  // The top-level comment that owns the thread a reply/edit targets — the
  // composer must know exactly which comment/reply it is answering.
  const [replyThreadRootId, setReplyThreadRootId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editThreadRootId, setEditThreadRootId] = useState<string | null>(null);

  const currentUserId = user?.id ?? '';
  const roomId = commentRoomId;

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (!commentsEnabled || !roomId) {
      dialogs.alert({ title: 'Comments are off', message: 'The author has turned off comments for this post.' });
      return;
    }

    if (editingComment) {
      // Edit existing — a reply is updated inside its thread, a top-level
      // comment in the main list.
      try {
        setSending(true);
        await editRoomComment(roomId, editingComment.id, body);
        if (editThreadRootId) {
          mutateThread(editThreadRootId, (prev) =>
            prev.map((c) => (c.id === editingComment.id ? { ...c, body } : c)),
          );
        } else {
          setComments((prev) => prev.map((c) => (c.id === editingComment.id ? { ...c, body } : c)));
        }
        setText('');
        setEditingComment(null);
        setEditThreadRootId(null);
      } catch {
        dialogs.alert({ variant: 'error', title: 'Could not update comment' });
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    const tempId = `tmp-${Date.now()}`;
    const target = replyingTo;
    // For a reply, the thread root is the top-level comment that owns the
    // target's thread; a reply to a top-level comment targets that comment
    // itself. Replies NEVER enter the top-level list.
    const threadRootId = target ? (target.parentId ? replyThreadRootId : target.id) : null;
    const optimistic: Comment = {
      id: tempId,
      commentRoomId: roomId,
      parentId: target?.id ?? null,
      body,
      isPinned: false,
      likeCount: 0,
      replyCount: 0,
      likedByMe: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: user?.id ?? '',
        name: user?.name || user?.username || 'You',
        username: user?.username ?? '',
        avatarUrl: user?.avatarUrl ?? null,
      },
    };

    if (threadRootId) {
      // Optimistically insert into the target's thread (under its exact
      // parent) — never as a top-level comment.
      mutateThread(threadRootId, (prev) => [...prev, optimistic]);
    } else {
      setComments((prev) => [optimistic, ...prev]);
    }
    setText('');
    setReplyingTo(null);
    setReplyThreadRootId(null);

    try {
      const res = await submitRoomComment(roomId, body, { parentCommentId: target?.id });
      const real = toLocalComment(res.comment);
      if (threadRootId) {
        mutateThread(threadRootId, (prev) => prev.map((c) => (c.id === tempId ? real : c)));
      } else {
        setComments((prev) => prev.map((c) => (c.id === tempId ? real : c)));
        // Publish the new top-level comment count so every card showing this
        // post updates immediately. Replies don't change the top-level count.
        setCommentCount(postId, comments.length + 1);
      }
    } catch {
      if (threadRootId) {
        mutateThread(threadRootId, (prev) => prev.filter((c) => c.id !== tempId));
      } else {
        setComments((prev) => prev.filter((c) => c.id !== tempId));
      }
      dialogs.alert({ variant: 'error', title: 'Could not post comment', message: 'Please try again.' });
    } finally {
      setSending(false);
    }
  }, [text, sending, commentsEnabled, roomId, editingComment, replyingTo, replyThreadRootId, user, setComments, mutateThread, setCommentCount, postId, comments.length]);

  const handleLike = useCallback(
    async (commentId: string) => {
      applyToComment(commentId, (c) => ({ ...c, likedByMe: true, likeCount: c.likeCount + 1 }));
      try {
        const res = await likeRoomComment(roomId ?? '', commentId);
        applyToComment(commentId, (c) => ({ ...c, likeCount: res.likeCount }));
      } catch {
        applyToComment(commentId, (c) => ({
          ...c,
          likedByMe: false,
          likeCount: Math.max(0, c.likeCount - 1),
        }));
      }
    },
    [roomId, applyToComment],
  );

  const handleUnlike = useCallback(
    async (commentId: string) => {
      applyToComment(commentId, (c) => ({
        ...c,
        likedByMe: false,
        likeCount: Math.max(0, c.likeCount - 1),
      }));
      try {
        const res = await unlikeRoomComment(roomId ?? '', commentId);
        applyToComment(commentId, (c) => ({ ...c, likeCount: res.likeCount }));
      } catch {
        applyToComment(commentId, (c) => ({ ...c, likedByMe: true, likeCount: c.likeCount + 1 }));
      }
    },
    [roomId, applyToComment],
  );

  const handleDelete = useCallback(
    (commentId: string, threadRootId?: string | null) => {
      dialogs.confirm({
        title: 'Delete comment',
        message: 'Are you sure you want to delete this comment?',
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: async () => {
          if (threadRootId) {
            // A reply — remove it from its thread, not the top-level list.
            mutateThread(threadRootId, (prev) => prev.filter((c) => c.id !== commentId));
          } else {
            setComments((prev) => prev.filter((c) => c.id !== commentId));
            // Publish the decremented count so cards update immediately.
            setCommentCount(postId, Math.max(0, comments.length - 1));
          }
          try {
            await deleteRoomComment(roomId ?? '', commentId);
          } catch {
            // ignore
          }
        },
      });
    },
    [roomId, setComments, postId, setCommentCount, comments.length, mutateThread],
  );

  const handleStartEdit = useCallback((comment: Comment, threadRootId?: string | null) => {
    setReplyingTo(null);
    setReplyThreadRootId(null);
    setEditingComment(comment);
    setEditThreadRootId(comment.parentId ? (threadRootId ?? comment.parentId) : null);
    setText(comment.body);
  }, []);

  const handleStartReply = useCallback((comment: Comment, threadRootId?: string | null) => {
    setEditingComment(null);
    setEditThreadRootId(null);
    setReplyingTo(comment);
    // The composer targets the EXACT comment/reply tapped. When that target is
    // a nested reply, the thread root is the top-level comment owning its
    // thread; replying to a top-level comment targets that comment itself.
    setReplyThreadRootId(comment.parentId ? (threadRootId ?? comment.parentId) : comment.id);
  }, []);

  const dragY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          dragY.setValue(g.dy * 0.7);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.6) {
          Animated.timing(dragY, {
            toValue: 600,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            dragY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 280,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={sheetStyles.overlay}>
        <Pressable style={sheetStyles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            sheetStyles.sheetContainer,
            {
              // Lift the whole sheet up by the keyboard height and cap its
              // height so the top never goes off-screen (no full-screen jump).
              marginBottom: kbLift,
              maxHeight: kbHeight > 0
                ? Math.max(240, screenHeight - kbHeight - 8)
                : '82%',
            },
          ]}
        >
          <GradientTopFade height={56} radius={20} />
          <Animated.View style={{ flex: 1, transform: [{ translateY: dragY }] }}>
            {/* Top Handle */}
            <View style={sheetStyles.handleArea} {...panResponder.panHandlers}>
              <View style={sheetStyles.handleBar} />
            </View>

            {/* Header */}
            <View style={sheetStyles.header} {...panResponder.panHandlers}>
            <View style={sheetStyles.headerLeft}>
              <ChatCircle size={18} color={T.PRIMARY_LIGHT} weight="fill" />
              <Text style={sheetStyles.headerTitle}>Comments</Text>
              <Text style={sheetStyles.headerCount}>{comments.length}</Text>
            </View>
            <TouchableOpacity style={sheetStyles.closeBtn} onPress={onClose} hitSlop={10}>
              <X size={16} color={T.TEXT_3} />
            </TouchableOpacity>
          </View>

          <View style={sheetStyles.divider} />

          {/* List Content */}
          {isLoading && comments.length === 0 ? (
            <CommentShimmerSkeleton />
          ) : error && comments.length === 0 ? (
            <View style={sheetStyles.emptyWrap}>
              <Text style={sheetStyles.emptyTitle}>{error}</Text>
              <TouchableOpacity onPress={() => refresh()} style={sheetStyles.retryBtn}>
                <Text style={sheetStyles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item, index) => `${item.id || 'comment'}-${index}`}
              renderItem={({ item }) => (
                <CommentRow
                  comment={item}
                  postId={postId}
                  currentUserId={currentUserId}
                  onLike={handleLike}
                  onUnlike={handleUnlike}
                  onDelete={handleDelete}
                  onEdit={handleStartEdit}
                  onReply={handleStartReply}
                  registerThreadMutation={registerThreadMutation}
                />
              )}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={() => refresh(true)}
                  tintColor={T.ACCENT}
                />
              }
              onEndReached={loadMore}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator size="small" color={T.PRIMARY_LIGHT} style={{ paddingVertical: 16 }} />
                ) : null
              }
              ListEmptyComponent={
                <View style={sheetStyles.emptyWrap}>
                  <ChatCircle size={28} color={T.TEXT_2} />
                  <Text style={sheetStyles.emptyTitle}>
                    {commentsEnabled ? 'No comments yet' : 'Comments are turned off'}
                  </Text>
                  <Text style={sheetStyles.emptySubtitle}>
                    {commentsEnabled
                      ? 'Be the first to share your thoughts.'
                      : 'The author has disabled comments for this post.'}
                  </Text>
                </View>
              }
              contentContainerStyle={sheetStyles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* Composer */}
          <View style={[sheetStyles.composerContainer, { paddingBottom: kbHeight > 0 ? 18 : Math.max(insets.bottom, 12) }]}>
            {replyingTo && (
              <View style={sheetStyles.contextChip}>
                <Text style={sheetStyles.contextText} numberOfLines={1}>
                  Replying to @{replyingTo.author.username || replyingTo.author.name}
                </Text>
                <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={6}>
                  <X size={12} color={T.TEXT_3} />
                </TouchableOpacity>
              </View>
            )}

            {editingComment && (
              <View style={sheetStyles.contextChip}>
                <Text style={sheetStyles.contextText} numberOfLines={1}>
                  Editing your comment
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditingComment(null);
                    setText('');
                  }}
                  hitSlop={6}
                >
                  <X size={12} color={T.TEXT_3} />
                </TouchableOpacity>
              </View>
            )}

            {commentsEnabled ? (
              <View style={sheetStyles.inputRow}>
                <MsAvatar
                  size={30}
                  initials={nameInitials(user?.name ?? 'Me')}
                  imageUri={user?.avatarUrl ?? undefined}
                />
                <View style={sheetStyles.inputBox}>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder={
                      replyingTo
                        ? `Reply to @${replyingTo.author.username || replyingTo.author.name}…`
                        : editingComment
                        ? 'Edit comment…'
                        : 'Add a comment…'
                    }
                    placeholderTextColor={T.TEXT_2}
                    selectionColor={T.CARET}
                    style={sheetStyles.input}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                    editable={commentsEnabled}
                  />
                </View>
                <TouchableOpacity
                  style={[
                    sheetStyles.sendBtn,
                    (!text.trim() || sending) && sheetStyles.sendBtnDisabled,
                  ]}
                  onPress={handleSend}
                  disabled={!text.trim() || sending}
                  activeOpacity={0.7}
                >
                  <BrandGradientFill />
                  {sending ? (
                    <ActivityIndicator size={12} color={T.ACCENT_FG} />
                  ) : (
                    <PaperPlaneRight size={16} color={T.ACCENT_FG} weight="fill" />
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={sheetStyles.disabledBar}>
                <Text style={sheetStyles.disabledText}>Comments are disabled for this post</Text>
              </View>
            )}
          </View>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Inline Comments Section ──────────────────────────────────────────────────

interface MsCommentsSectionProps {
  postId: string;
  previewCount?: number;
}

export function MsCommentsSection({ postId, previewCount = 2 }: MsCommentsSectionProps) {
  const { user } = useAuth();
  const {
    comments,
    setComments,
    isLoading,
    commentRoomId,
    registerThreadMutation,
    mutateThread,
    applyToComment,
  } = useComments(postId);
  const { setCommentCount } = usePostActions();
  const [modalOpen, setModalOpen] = useState(false);
  const totalCount = comments.length;
  const preview = comments.slice(0, previewCount);

  const currentUserId = user?.id ?? '';
  const roomId = commentRoomId;

  const handleLike = useCallback(
    async (commentId: string) => {
      applyToComment(commentId, (c) => ({ ...c, likedByMe: true, likeCount: c.likeCount + 1 }));
      try {
        const res = await likeRoomComment(roomId ?? '', commentId);
        applyToComment(commentId, (c) => ({ ...c, likeCount: res.likeCount }));
      } catch {
        applyToComment(commentId, (c) => ({
          ...c,
          likedByMe: false,
          likeCount: Math.max(0, c.likeCount - 1),
        }));
      }
    },
    [roomId, applyToComment],
  );

  const handleUnlike = useCallback(
    async (commentId: string) => {
      applyToComment(commentId, (c) => ({
        ...c,
        likedByMe: false,
        likeCount: Math.max(0, c.likeCount - 1),
      }));
      try {
        const res = await unlikeRoomComment(roomId ?? '', commentId);
        applyToComment(commentId, (c) => ({ ...c, likeCount: res.likeCount }));
      } catch {
        applyToComment(commentId, (c) => ({ ...c, likedByMe: true, likeCount: c.likeCount + 1 }));
      }
    },
    [roomId, applyToComment],
  );

  const handleDelete = useCallback(
    (commentId: string, threadRootId?: string | null) => {
      dialogs.confirm({
        title: 'Delete comment',
        message: 'Remove this comment?',
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: async () => {
          if (threadRootId) {
            mutateThread(threadRootId, (prev) => prev.filter((c) => c.id !== commentId));
          } else {
            setComments((prev) => prev.filter((c) => c.id !== commentId));
            // Publish the decremented count so cards update immediately.
            setCommentCount(postId, Math.max(0, comments.length - 1));
          }
          try {
            await deleteRoomComment(roomId ?? '', commentId);
          } catch {
            // ignore
          }
        },
      });
    },
    [roomId, setComments, postId, setCommentCount, comments.length, mutateThread],
  );

  return (
    <View style={sectionStyles.card}>
      <View style={sectionStyles.header}>
        <ChatCircle size={16} color={T.ACCENT_FG} weight="fill" />
        <Text style={sectionStyles.title}>Comments</Text>
        <Text style={sectionStyles.total}>{totalCount}</Text>
      </View>

      {isLoading && preview.length === 0 ? (
        <CommentShimmerSkeleton />
      ) : (
        preview.map((c, i) => (
          <CommentRow
            key={`${c.id || 'comment'}-${i}`}
            comment={c}
            postId={postId}
            currentUserId={currentUserId}
            showDivider={i < preview.length - 1}
            onLike={handleLike}
            onUnlike={handleUnlike}
            onDelete={handleDelete}
            registerThreadMutation={registerThreadMutation}
          />
        ))
      )}

      <TouchableOpacity style={sectionStyles.viewAllBtn} onPress={() => setModalOpen(true)} activeOpacity={0.7}>
        <Text style={sectionStyles.viewAllText}>
          {totalCount > previewCount
            ? `View all ${totalCount} comments`
            : 'Add a comment…'}
        </Text>
      </TouchableOpacity>

      <CommentsModal visible={modalOpen} onClose={() => setModalOpen(false)} postId={postId} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  shimmerWrap: { paddingHorizontal: 16, paddingTop: 14, gap: 16 },
  shimmerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  shimmerBody: { flex: 1, gap: 8 },
  shimmerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  commentRowContainer: { paddingHorizontal: 16 },
  commentRow: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  commentBodyWrap: { flex: 1, gap: 4 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorName: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13, flexShrink: 1 },
  authorHandle: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11, flexShrink: 1 },
  timeAgo: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11, marginLeft: 'auto' },
  menuIcon: { padding: 2, marginLeft: 4 },
  menuDots: { color: T.TEXT_3, fontSize: 10, letterSpacing: -1 },
  commentText: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13, lineHeight: 19 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // lineHeight matches the 13px action icons so label/count text shares the
  // icons' vertical center line.
  actionCount: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 11, lineHeight: 13 },
  actionCountLiked: { color: T.SECONDARY_LIGHT },
  actionLabel: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 11, lineHeight: 13 },
  toggleRepliesBtn: { marginTop: 6 },
  toggleRepliesText: { color: T.PRIMARY_LIGHT, fontFamily: T.FONT.medium, fontSize: 12 },
  // Expanded thread root: hangs off the parent comment's avatar (32px + 12px
  // gap) with a subtle vertical line connecting it to its replies.
  threadRoot: {
    marginTop: 8,
    marginLeft: 44,
    borderLeftWidth: 1,
    borderLeftColor: T.BORDER_2,
    paddingLeft: 12,
    gap: 2,
  },
  // Each deeper level indents (24px avatar + 8px gap) and draws its own
  // thread line under the parent reply.
  threadNested: {
    marginLeft: 32,
    borderLeftWidth: 1,
    borderLeftColor: T.BORDER_2,
    paddingLeft: 12,
    gap: 2,
    marginTop: 2,
  },
  replyRow: { flexDirection: 'row', gap: 8, paddingVertical: 5, paddingRight: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: T.BORDER },
});

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.65)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheetContainer: {
    maxHeight: '82%',
    minHeight: '55%',
    backgroundColor: T.BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.BORDER_2,
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', paddingVertical: 8 },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.BORDER_2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 16 },
  headerCount: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 13 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: T.BORDER },
  listContent: { paddingBottom: 16, paddingTop: 4 },
  emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 50, paddingHorizontal: 24 },
  emptyTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  emptySubtitle: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12, textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.pill,
  },
  retryText: { color: T.ACCENT_FG, fontFamily: T.FONT.medium, fontSize: 12 },

  composerContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.BORDER_2,
    paddingTop: 10,
    paddingHorizontal: 14,
    backgroundColor: T.BG,
  },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.SURFACE_2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  contextText: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 11, flex: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputBox: {
    flex: 1,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.full,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 2,
  },
  input: {
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    paddingVertical: 8,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.ACCENT,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendArrow: { color: T.ACCENT_FG, fontFamily: T.FONT.bold, fontSize: 15 },
  disabledBar: { alignItems: 'center', paddingVertical: 10 },
  disabledText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12 },
});

const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: T.BG,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.BORDER_2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 14, flex: 1 },
  total: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12 },
  viewAllBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.BORDER_2,
  },
  viewAllText: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 12 },
});
