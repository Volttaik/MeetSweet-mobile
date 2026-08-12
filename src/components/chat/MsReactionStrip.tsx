/**
 * MsReactionStrip - Interactive reaction strip below chat messages.
 * FIXED ISSUE-005: Fully connected with onPress handler for toggling reactions.
 */

import React from 'react';

interface MsReactionStripProps {
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  currentUserId?: string;
  onPress?: (emoji: string) => void;
  isOwn?: boolean;
}

export const MsReactionStrip: React.FC<MsReactionStripProps> = ({
  reactions = [],
  currentUserId,
  onPress,
  isOwn,
}) => {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {reactions.map((r) => {
        const hasReacted = currentUserId ? r.userIds.includes(currentUserId) : false;
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPress?.(r.emoji);
            }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
              hasReacted
                ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-xs dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-300'
                : 'bg-stone-100 border-stone-200 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300'
            }`}
          >
            <span>{r.emoji}</span>
            <span>{r.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
};
