/**
 * MsVoiceBubble - Inline voice note bubble with play/pause and waveform visualizer.
 */

import React, { useState } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

interface MsVoiceBubbleProps {
  mediaUrl?: string | null;
  duration?: number;
  isOwn?: boolean;
}

export const MsVoiceBubble: React.FC<MsVoiceBubbleProps> = ({
  duration = 12,
  isOwn,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex items-center gap-3 p-1 min-w-[200px]">
      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95 ${
          isOwn
            ? 'bg-rose-500 text-white hover:bg-rose-600'
            : 'bg-stone-900 text-white dark:bg-rose-500 hover:bg-stone-800'
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-1 h-5">
          {[40, 70, 30, 90, 60, 80, 50, 90, 40, 70, 30, 80, 60, 40, 90, 60].map((h, idx) => (
            <div
              key={idx}
              style={{ height: `${h}%` }}
              className={`w-1 rounded-full transition-colors ${
                isOwn
                  ? 'bg-stone-800 dark:bg-stone-200'
                  : 'bg-rose-500 dark:bg-rose-400'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[11px] font-medium opacity-80">
          <span className="flex items-center gap-1">
            <Mic className="w-3 h-3" /> Voice Note
          </span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};
