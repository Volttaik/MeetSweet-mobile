/**
 * MsShortsPlayer — thin wrapper around MsVideoPlayer for the Shorts feed.
 *
 * Maps the Short data type to MsVideoPlayer props with mode='shorts'.
 * All playback logic, buffering, gestures and UI live in MsVideoPlayer.
 */
import React from 'react';
import type { Short } from '@/services/content';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item: Short;
  active: boolean;
  pageHeight?: number;
  onViewProgress?: (seconds: number) => void;
  onDoubleTap?: () => void;
  onPremiumRequired?: () => void;
  onError?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsShortsPlayer({
  item,
  active,
  pageHeight,
  onViewProgress,
  onDoubleTap,
  onPremiumRequired,
  onError,
}: Props) {
  return (
    <MsVideoPlayer
      videoId={item.id}
      uri={item.videoUrl ?? null}
      posterUri={item.thumbnailUrl ?? null}
      mode="shorts"
      active={active}
      pageHeight={pageHeight}
      isPremium={false}
      onViewProgress={onViewProgress}
      onDoubleTap={onDoubleTap}
      onError={onError}
    />
  );
}
