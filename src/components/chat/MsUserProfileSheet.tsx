/**
 * MsUserProfileSheet - Participant profile preview.
 * FIXED ISSUE-013: Differentiates Creator profile vs Standard User profile.
 */

import React from 'react';
import { X, ShieldCheck, User as UserIcon, Sparkles, MessageSquare, Ban } from 'lucide-react';
import { RoomParticipant } from '../../types';

interface MsUserProfileSheetProps {
  participant: RoomParticipant;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullProfile: (username: string, isCreator: boolean) => void;
  onToggleBlock?: (username: string) => void;
  isBlocked?: boolean;
}

export const MsUserProfileSheet: React.FC<MsUserProfileSheetProps> = ({
  participant,
  isOpen,
  onClose,
  onOpenFullProfile,
  onToggleBlock,
  isBlocked,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover Graphic */}
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-rose-500 to-purple-600 opacity-90" />

        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Profile Info */}
        <div className="relative pt-8 flex flex-col items-center text-center">
          <img
            src={participant.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300'}
            alt={participant.name}
            className="w-20 h-20 rounded-full border-4 border-white dark:border-stone-900 shadow-md object-cover"
            referrerPolicy="no-referrer"
          />

          <div className="mt-3 flex items-center gap-1.5">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">{participant.name}</h3>
            {participant.isVerified && <ShieldCheck className="w-4 h-4 text-blue-500 fill-current" />}
            {participant.isCreator && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white uppercase tracking-wider">
                Creator
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500">@{participant.username}</p>

          <div className="mt-6 w-full space-y-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullProfile(participant.username, Boolean(participant.isCreator));
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer"
            >
              {participant.isCreator ? <Sparkles className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
              <span>View {participant.isCreator ? 'Creator Profile' : 'User Profile'}</span>
            </button>

            {onToggleBlock && (
              <button
                type="button"
                onClick={() => {
                  onToggleBlock(participant.username);
                  onClose();
                }}
                className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-xs transition-colors cursor-pointer ${
                  isBlocked
                    ? 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200'
                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100'
                }`}
              >
                <Ban className="w-4 h-4" />
                <span>{isBlocked ? 'Unblock Participant' : 'Block Participant'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
