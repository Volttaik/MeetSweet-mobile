/**
 * MsLongFormPlayer — long-form video using Expo's native controls.
 *
 * Native play/pause, seek, volume and fullscreen are handled by the OS.
 * This component manages: aspect-ratio sizing, poster thumbnail, error
 * recovery, and the premium paywall gate.
 *
 * Modes:
 *   fillContainer — fills parent (flex:1); used on full-screen detail screens.
 *   aspectRatio   — sizes the box by the video's natural aspect ratio (default).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { ArrowCounterClockwise, Lock } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsMediaLoader } from '@/components/MsMediaLoader';

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
  autoPlay = false,
  isPremium = false,
  onPremiumRequired,
  initialAspectRatio,
  fillContainer = false,
}: Props) {
  const ref  = useRef<Video>(null);
  const premiumFired    = useRef(false);
  const premiumGatedRef = useRef(false);

  const [error,        setError]        = useState(false);
  const [premiumGated, setPremiumGated] = useState(false);
  const [aspectRatio,  setAspectRatio]  = useState(initialAspectRatio ?? 16 / 9);

  // Reset when the video source changes.
  useEffect(() => {
    premiumFired.current    = false;
    premiumGatedRef.current = false;
    setPremiumGated(false);
    setError(false);
    if (initialAspectRatio) setAspectRatio(initialAspectRatio);
  }, [videoId, uri, initialAspectRatio]);

  // Track position for premium gate; re-enforce while gated.
  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      if (isPremium && !premiumFired.current && status.positionMillis >= 3000) {
        premiumFired.current    = true;
        premiumGatedRef.current = true;
        ref.current?.pauseAsync().catch(() => {});
        setPremiumGated(true);
        onPremiumRequired?.();
        return;
      }

      // Re-enforce: native controls must not resume gated content.
      if (premiumGatedRef.current && status.isPlaying) {
        ref.current?.pauseAsync().catch(() => {});
      }
    },
    [isPremium, onPremiumRequired],
  );

  const onReadyForDisplay = useCallback(
    (event: { naturalSize?: { width: number; height: number } }) => {
      const w = event.naturalSize?.width;
      const h = event.naturalSize?.height;
      if (w && h && h > 0 && !initialAspectRatio) setAspectRatio(w / h);
    },
    [initialAspectRatio],
  );

  const outerStyle = fillContainer
    ? [styles.player, styles.playerFill]
    : [styles.player, { aspectRatio }];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={outerStyle}>
      {/* Poster thumbnail — sits behind the video */}
      {posterUri ? (
        <MsMediaLoader
          uri={posterUri}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel="Video thumbnail"
        />
      ) : null}

      {/* Native video player */}
      {uri && !error ? (
        <Video
          ref={ref}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={autoPlay && !premiumGated}
          useNativeControls
          onPlaybackStatusUpdate={onStatus}
          onReadyForDisplay={onReadyForDisplay}
          onError={() => setError(true)}
        />
      ) : null}

      {/* Error state */}
      {(!uri || error) ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>
            {error ? 'Video could not load' : 'Video unavailable'}
          </Text>
          {error ? (
            <Pressable
              onPress={() => {
                setError(false);
                premiumFired.current = false;
                setPremiumGated(false);
              }}
              style={styles.retryBtn}
              accessibilityLabel="Retry loading video"
            >
              <ArrowCounterClockwise size={16} color={T.ACCENT} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Premium gate — blocks all touches so native controls cannot resume */}
      {premiumGated ? (
        <View style={styles.premiumOverlay}>
          <View style={styles.premiumCircle}>
            <Lock size={22} color={T.ACCENT} />
          </View>
          <Text style={styles.premiumTitle}>Premium content</Text>
          <Text style={styles.premiumSub}>Subscribe to keep watching</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  player: {
    width: '100%',
    backgroundColor: '#050506',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: T.RADIUS.xl,
  },
  playerFill: {
    flex: 1,
    borderRadius: 0,
  },

  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 4,
  },
  errorTitle: { color: '#fff', fontFamily: T.FONT.medium, fontSize: 13 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 4,
  },
  retryText: { color: T.ACCENT, fontFamily: T.FONT.semibold, fontSize: 13 },

  premiumOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  premiumCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  premiumTitle: { color: '#fff', fontFamily: T.FONT.bold, fontSize: 16 },
  premiumSub:   { color: 'rgba(255,255,255,0.65)', fontFamily: T.FONT.regular, fontSize: 12 },
});
