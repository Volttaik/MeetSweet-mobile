/**
 * PostActionsContext — global post mutation state.
 *
 * When a post is deleted from ANY screen (profile, home feed, post detail),
 * every other screen that renders that post ID will automatically hide it.
 *
 * When a post is edited, every screen shows the updated caption/visibility.
 *
 * Not-Interested / Hide-Creator: hidden posts and hidden creators are removed
 * from every feed immediately (server persists the preference; these sets are
 * the in-session mirror so no refetch is needed).
 *
 * REAL-TIME SYNC (beyond deletes/edits):
 *  - likeOverrides / bookmarkOverrides: the shared mirror of like/bookmark
 *    state. Any screen that performs a like/bookmark publishes the confirmed
 *    value here, so every other mounted view of the same post (Home feed card,
 *    creator page, profile, video watch page) re-renders with the new state —
 *    no app restart, no blind refetch.
 *  - commentCounts: server-confirmed comment counts keyed by post id, so
 *    cards show the count that actually includes the comment the user just
 *    added.
 *  - contentCreatedAt: bumped after a successful content creation so feed
 *    screens know to refresh their (previously mounted) lists on next focus.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Post } from '@/services/posts';

export interface LikeOverride {
  likedByMe: boolean;
  likeCount: number;
}

export interface BookmarkOverride {
  bookmarkedByMe: boolean;
  bookmarkCount: number;
}

interface PostActionsContextValue {
  /** IDs of posts that have been deleted in this session. */
  deletedIds: string[];
  /** IDs of posts hidden via Not Interested (in-session). */
  hiddenIds: string[];
  /** Creator ids hidden via Hide Creator / Mute (in-session). */
  hiddenCreatorIds: string[];
  /** Map of postId → partial overrides from in-session edits. */
  editedPosts: Record<string, Partial<Post>>;
  /** Map of postId → confirmed like state (published by any like surface). */
  likeOverrides: Record<string, LikeOverride>;
  /** Map of postId → confirmed bookmark state. */
  bookmarkOverrides: Record<string, BookmarkOverride>;
  /** Map of postId → confirmed comment count (from comment mutations). */
  commentCounts: Record<string, number>;
  /** Monotonic version bumped after a successful content creation. */
  contentCreatedAt: number;
  /** Call after a successful deletePost() to propagate removal everywhere. */
  markDeleted: (id: string) => void;
  /** Call after a successful hidePost() to propagate removal everywhere. */
  markHidden: (id: string) => void;
  /** Call after a successful hideCreator() to drop the creator everywhere. */
  markCreatorHidden: (creatorId: string) => void;
  /** Call after a successful editPost() to propagate updates everywhere. */
  markEdited: (id: string, fields: Partial<Post>) => void;
  /** Publish confirmed like state for a post (server response / success). */
  markLiked: (id: string, likedByMe: boolean, likeCount: number) => void;
  /** Publish confirmed bookmark state for a post. */
  markBookmarked: (id: string, bookmarkedByMe: boolean, bookmarkCount: number) => void;
  /** Publish a confirmed comment count for a post. */
  setCommentCount: (id: string, count: number) => void;
  /** Call after a successful content creation so feeds refresh on next focus. */
  markContentCreated: () => void;
}

const PostActionsContext = createContext<PostActionsContextValue>({
  deletedIds: [],
  hiddenIds: [],
  hiddenCreatorIds: [],
  editedPosts: {},
  likeOverrides: {},
  bookmarkOverrides: {},
  commentCounts: {},
  contentCreatedAt: 0,
  markDeleted: () => {},
  markHidden: () => {},
  markCreatorHidden: () => {},
  markEdited: () => {},
  markLiked: () => {},
  markBookmarked: () => {},
  setCommentCount: () => {},
  markContentCreated: () => {},
});

export function PostActionsProvider({ children }: { children: React.ReactNode }) {
  const [deletedIds, setDeletedIds]   = useState<string[]>([]);
  const [hiddenIds, setHiddenIds]     = useState<string[]>([]);
  const [hiddenCreatorIds, setHiddenCreatorIds] = useState<string[]>([]);
  const [editedPosts, setEditedPosts] = useState<Record<string, Partial<Post>>>({});
  const [likeOverrides, setLikeOverrides]       = useState<Record<string, LikeOverride>>({});
  const [bookmarkOverrides, setBookmarkOverrides] = useState<Record<string, BookmarkOverride>>({});
  const [commentCounts, setCommentCounts]       = useState<Record<string, number>>({});
  const [contentCreatedAt, setContentCreatedAt] = useState(0);

  const markDeleted = useCallback((id: string) => {
    setDeletedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const markHidden = useCallback((id: string) => {
    setHiddenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const markCreatorHidden = useCallback((creatorId: string) => {
    setHiddenCreatorIds((prev) => (prev.includes(creatorId) ? prev : [...prev, creatorId]));
  }, []);

  const markEdited = useCallback((id: string, fields: Partial<Post>) => {
    setEditedPosts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...fields } }));
  }, []);

  const markLiked = useCallback((id: string, likedByMe: boolean, likeCount: number) => {
    setLikeOverrides((prev) => ({ ...prev, [id]: { likedByMe, likeCount } }));
  }, []);

  const markBookmarked = useCallback((id: string, bookmarkedByMe: boolean, bookmarkCount: number) => {
    setBookmarkOverrides((prev) => ({ ...prev, [id]: { bookmarkedByMe, bookmarkCount } }));
  }, []);

  const setCommentCount = useCallback((id: string, count: number) => {
    setCommentCounts((prev) => ({ ...prev, [id]: Math.max(0, count) }));
  }, []);

  const markContentCreated = useCallback(() => {
    setContentCreatedAt((v) => v + 1);
  }, []);

  return (
    <PostActionsContext.Provider
      value={{
        deletedIds,
        hiddenIds,
        hiddenCreatorIds,
        editedPosts,
        likeOverrides,
        bookmarkOverrides,
        commentCounts,
        contentCreatedAt,
        markDeleted,
        markHidden,
        markCreatorHidden,
        markEdited,
        markLiked,
        markBookmarked,
        setCommentCount,
        markContentCreated,
      }}
    >
      {children}
    </PostActionsContext.Provider>
  );
}

export function usePostActions() {
  return useContext(PostActionsContext);
}
