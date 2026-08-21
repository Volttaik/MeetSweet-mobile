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
  prebuffer?: boolean;
  pageHeight?: number;
  onViewProgress?: (seconds: number) => void;
  onDoubleTap?: () => void;
  onPremiumRequired?: () => void;
  onError?: () => void;
  /** Fired when the short's playback state changes (play ↔ pause). */
  onPlayStateChange?: (playing: boolean) => void;
  /** Fired when the user taps the video (host restores overlays). */
  onShortsTap?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsShortsPlayer({
  item,
  active,
  prebuffer = false,
  pageHeight,
  onViewProgress,
  onDoubleTap,
  onPremiumRequired,
  onError,
  onPlayStateChange,
  onShortsTap,
}: Props) {
  return (
    <MsVideoPlayer
      videoId={item.id}
      uri={item.videoUrl ?? null}
      posterUri={item.thumbnailUrl ?? null}
      qualities={item.qualities}
      mode="shorts"
      active={active}
      prebuffer={prebuffer}
      pageHeight={pageHeight}
      isPremium={false}
      onViewProgress={onViewProgress}
      onDoubleTap={onDoubleTap}
      onError={onError}
      onPlayStateChange={onPlayStateChange}
      onShortsTap={onShortsTap}
    />
  );
}
