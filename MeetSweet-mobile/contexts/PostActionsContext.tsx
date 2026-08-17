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
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Post } from '@/services/posts';

interface PostActionsContextValue {
  /** IDs of posts that have been deleted in this session. */
  deletedIds: string[];
  /** IDs of posts hidden via Not Interested (in-session). */
  hiddenIds: string[];
  /** Creator ids hidden via Hide Creator / Mute (in-session). */
  hiddenCreatorIds: string[];
  /** Map of postId → partial overrides from in-session edits. */
  editedPosts: Record<string, Partial<Post>>;
  /** Call after a successful deletePost() to propagate removal everywhere. */
  markDeleted: (id: string) => void;
  /** Call after a successful hidePost() to propagate removal everywhere. */
  markHidden: (id: string) => void;
  /** Call after a successful hideCreator() to drop the creator everywhere. */
  markCreatorHidden: (creatorId: string) => void;
  /** Call after a successful editPost() to propagate updates everywhere. */
  markEdited: (id: string, fields: Partial<Post>) => void;
}

const PostActionsContext = createContext<PostActionsContextValue>({
  deletedIds: [],
  hiddenIds: [],
  hiddenCreatorIds: [],
  editedPosts: {},
  markDeleted: () => {},
  markHidden: () => {},
  markCreatorHidden: () => {},
  markEdited: () => {},
});

export function PostActionsProvider({ children }: { children: React.ReactNode }) {
  const [deletedIds, setDeletedIds]   = useState<string[]>([]);
  const [hiddenIds, setHiddenIds]     = useState<string[]>([]);
  const [hiddenCreatorIds, setHiddenCreatorIds] = useState<string[]>([]);
  const [editedPosts, setEditedPosts] = useState<Record<string, Partial<Post>>>({});

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

  return (
    <PostActionsContext.Provider
      value={{ deletedIds, hiddenIds, hiddenCreatorIds, editedPosts, markDeleted, markHidden, markCreatorHidden, markEdited }}
    >
      {children}
    </PostActionsContext.Provider>
  );
}

export function usePostActions() {
  return useContext(PostActionsContext);
}
