/**
 * MsLongFormPlayer — thin wrapper around MsVideoPlayer for long-form video.
 *
 * All playback logic, custom controls, buffering, gestures, double-tap seek,
 * and fullscreen live in MsVideoPlayer (mode='standard').
 * This wrapper preserves the existing public API so call sites need no changes.
 */
import React from 'react';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import type { MediaQuality } from '@/services/posts';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  videoId: string;
  uri: string | null;
  posterUri?: string | null;
  /** Server-authoritative playable quality variants. */
  qualities?: MediaQuality[];
  autoPlay?: boolean;
  isPremium?: boolean;
  onPremiumRequired?: () => void;
  /** Eliminate initial layout flash by passing the known aspect ratio. */
  initialAspectRatio?: number;
  /**
   * When true the player fills its parent (flex:1) instead of sizing by
   * aspect ratio. Use for full-screen video-detail screens.
   */
  fillContainer?: boolean;
  /**
   * When false, playback is immediately paused (e.g. screen loses focus).
   * Returning to true does NOT auto-resume — the user must press Play.
   * Pass `active={screenFocused}` via useFocusEffect to prevent background playback.
   */
  active?: boolean;
  /** Called with ADDITIONAL seconds watched since the last report (deltas). */
  onViewProgress?: (seconds: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsLongFormPlayer({
  videoId,
  uri,
  posterUri,
  qualities,
  autoPlay          = false,
  isPremium         = false,
  onPremiumRequired,
  initialAspectRatio,
  fillContainer     = false,
  active,
  onViewProgress,
}: Props) {
  return (
    <MsVideoPlayer
      videoId={videoId}
      uri={uri}
      posterUri={posterUri}
      qualities={qualities}
      autoPlay={autoPlay}
      isPremium={isPremium}
      onPremiumRequired={onPremiumRequired}
      initialAspectRatio={initialAspectRatio}
      fillContainer={fillContainer}
      active={active}
      mode="standard"
      onViewProgress={onViewProgress}
    />
  );
}
