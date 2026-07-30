/**
 * MsLongFormPlayer — thin wrapper around MsVideoPlayer for long-form video.
 *
 * All playback logic, custom controls, buffering, gestures, double-tap seek,
 * and fullscreen live in MsVideoPlayer (mode='standard').
 * This wrapper preserves the existing public API so call sites need no changes.
 */
import React from 'react';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  videoId: string;
  uri: string | null;
  posterUri?: string | null;
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
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsLongFormPlayer({
  videoId,
  uri,
  posterUri,
  autoPlay          = false,
  isPremium         = false,
  onPremiumRequired,
  initialAspectRatio,
  fillContainer     = false,
}: Props) {
  return (
    <MsVideoPlayer
      videoId={videoId}
      uri={uri}
      posterUri={posterUri}
      autoPlay={autoPlay}
      isPremium={isPremium}
      onPremiumRequired={onPremiumRequired}
      initialAspectRatio={initialAspectRatio}
      fillContainer={fillContainer}
      mode="standard"
    />
  );
}
