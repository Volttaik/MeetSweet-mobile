/**
 * useOfflineQueue — drains pending offline actions when network is restored.
 * Each action is scoped to the authenticated user (userId).
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import {
  getPendingOfflineActions,
  completeOfflineAction,
  type OfflineAction,
} from '@/lib/posts-db';
import { likePost, unlikePost, bookmarkPost, unbookmarkPost } from '@/services/posts';
import { sendRoomMessage } from '@/services/room-service';

async function executeAction(action: OfflineAction): Promise<void> {
  switch (action.type) {
    case 'like_post':
      if (action.liked) await likePost(action.postId);
      else await unlikePost(action.postId);
      break;
    case 'save_post':
      if (action.saved) await bookmarkPost(action.postId);
      else await unbookmarkPost(action.postId);
      break;
    case 'send_message':
      await sendRoomMessage(action.chatRoomId, { body: action.text });
      break;
  }
}

export function useOfflineQueue() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const isProcessing = useRef(false);
  const userId = user?.id;

  useEffect(() => {
    if (!isOnline || !userId || isProcessing.current) return;

    (async () => {
      isProcessing.current = true;
      try {
        const pending = await getPendingOfflineActions(userId);
        for (const { id, action } of pending) {
          try {
            await executeAction(action);
            await completeOfflineAction(id, userId);
          } catch {
            // Leave in queue — will retry next time network is restored
          }
        }
      } finally {
        isProcessing.current = false;
      }
    })();
  }, [isOnline, userId]);
}