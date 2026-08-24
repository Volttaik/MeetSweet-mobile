/**
 * MsMediaCard — premium media message card.
 *
 * Images / GIFs:
 *  • Rendered with expo-image (native, animated-GIF support) using the
 *    persistent local file first (localUri) and the remote URL as fallback
 *  • Natural aspect ratio from onLoad dimensions
 *  • Skeleton shimmer while loading
 *  • Smooth fade-in on load
 *  • 5px rounded corners
 *  • Soft shadow
 *  • Tap → fullscreen (handled by parent)
 *
 * Videos:
 *  • Large centred play button with semi-transparent ring
 *  • Duration badge bottom-right
 *  • Tap → shared VideoPlayer
 *
 * Never shows in-bubble playback controls.
 */
import React, { useCallback, useState } from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Reanimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { MsPressable } from '@/components/MsPressable';
import { Play, ArrowClockwise, DownloadSimple, Image as ImageIcon } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';
import { formatDuration } from '@/types/chat-message';

const SCREEN_W    = Dimensions.get('window').width;
/** Cards use 90% of the full message-column width */
const MAX_CARD_W  = Math.round((SCREEN_W - 32) * 0.9);
const MIN_CARD_W  = 160;
/** Default height while we wait for natural dimensions */
const DEFAULT_H   = Math.round(MAX_CARD_W * 0.65);

// ── Shimmer placeholder ───────────────────────────────────────────────────────

function Shimmer({ width, height }: { width: number; height: number }) {
  const anim = useSharedValue(0);

  React.useEffect(() => {
    anim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 820 }),
        withTiming(0, { duration: 820 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(anim);
  }, [anim]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + anim.value * 0.4,
  }));

  return (
    <Reanimated.View
      style={[
        { width, height, backgroundColor: T.SURFACE_2 },
        style,
      ]}
    />
  );
}

// ── Duration badge ────────────────────────────────────────────────────────────

function DurationBadge({ secs }: { secs: number }) {
  if (secs <= 0) return null;
  return (
    <View style={s.durationBadge} pointerEvents="none">
      <Text style={s.durationText}>{formatDuration(secs)}</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  message:    MsMessage;
  position:   'left' | 'right';
  onPress?:   () => void;
  onDownload?: () => void;
  onLongPress?: () => void;
}

export function MsMediaCard({ message, position, onPress, onDownload, onLongPress }: Props) {
  const isOwn   = position === 'right';
  const isVideo = message.msMediaType === 'video' || !!message.video;

  // Rendering priority: localUri (persistent local file) → library field.
  const imageUri = message.localUri || message.image || (isVideo ? undefined : message.audio) || '';
  const needsDownload = !isVideo && !message.localUri && !!imageUri;
  const hasThumb = !isVideo && !!imageUri && !needsDownload;
  const videoDur = message.msAudioDuration ?? 0;

  // Animated GIF detection — from the file type / mime / extension. GIFs are
  // rendered as compact image bubbles with expo-image (animation preserved,
  // local file after first download).
  const isGif = !isVideo && (
    message.msFileType === 'gif' ||
    message.msMimeType === 'image/gif' ||
    /\.gif($|\?)/i.test(imageUri)
  );

  // Natural image dimensions
  const [imgW, setImgW] = useState<number>(MAX_CARD_W);
  const [imgH, setImgH] = useState<number>(DEFAULT_H);

  const [loading,  setLoading]  = useState(hasThumb);
  const [error,    setError]    = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Smooth fade-in — Reanimated worklet on the UI thread
  const fadeAnim = useSharedValue(0);

  const handleLoad = useCallback((e: { nativeEvent: { source: { width: number; height: number } } }) => {
    const { width: nw, height: nh } = e.nativeEvent.source;
    if (nw > 0 && nh > 0) {
      // Fit width within MAX_CARD_W, let height follow natural aspect ratio.
      // Animated GIFs get a height cap so a tall GIF stays a compact bubble
      // (contain fit letterboxes it — no cropping, animation preserved).
      const ratio = nh / nw;
      const fw    = Math.min(Math.max(nw, MIN_CARD_W), MAX_CARD_W);
      const fh    = Math.max(80, Math.round(fw * ratio));
      setImgW(fw);
      setImgH(isGif ? Math.min(fh, Math.round(MAX_CARD_W * 1.2)) : fh);
    }
    setLoading(false);
    fadeAnim.value = withTiming(1, { duration: 240 });
  }, [fadeAnim]);

  const handleError = useCallback(() => {
    setLoading(false);
    setError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setError(false);
    setLoading(true);
    fadeAnim.value = 0;
    setRetryKey((k) => k + 1);
  }, [fadeAnim]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fadeAnim.value }));

  return (
    <MsPressable
      onPress={onPress}
      delayLongPress={350}
      onLongPress={onLongPress}
      style={[s.container, isOwn ? s.containerRight : s.containerLeft]}
      scale={0.98}
      pressOpacity={1}
      haptic
      accessibilityLabel={isVideo ? 'Video message. Tap to play.' : isGif ? 'Animated GIF message. Tap to view.' : 'Image message. Tap to view.'}
      accessibilityRole="button"
    >
      <View
        style={[
          s.card,
          { width: isVideo ? MAX_CARD_W : imgW },
        ]}
      >
        {error ? (
          /* ── Error state ─────────────────────────────────────────────────── */
          <View style={[s.errorWrap, { width: MAX_CARD_W, height: DEFAULT_H * 0.55 }]}>
            <View style={s.errorIcon}>
              <ImageIcon size={24} color={T.TEXT_3} weight="regular" />
            </View>
            <Text style={s.errorText}>Failed to load</Text>
            <MsPressable style={s.retryBtn} onPress={handleRetry}>
              <ArrowClockwise size={16} color={T.ACCENT} />
              <Text style={s.retryText}>Retry</Text>
            </MsPressable>
          </View>
        ) : needsDownload ? (
          <View style={[s.downloadWrap, { width: MAX_CARD_W, height: DEFAULT_H * 0.72 }]}>
            <ImageIcon size={26} color={T.TEXT_3} />
            <Text style={s.downloadTitle}>Image ready</Text>
            <MsPressable style={s.downloadBtn} onPress={onDownload}>
              <DownloadSimple size={16} color="#fff" weight="bold" />
              <Text style={s.downloadText}>Download image</Text>
            </MsPressable>
          </View>
        ) : isVideo ? (
          /* ── Video: dark placeholder + large play ring + duration ──────── */
          <View style={[s.videoPlaceholder, { width: MAX_CARD_W, height: Math.round(MAX_CARD_W * (3 / 4)) }]}>
            {/* Large semi-transparent play circle */}
            <View style={s.videoPlayRing}>
              <View style={s.videoPlayInner}>
                <Play size={26} color="#fff" weight="fill" style={{ marginLeft: 3 }} />
              </View>
            </View>
            <DurationBadge secs={videoDur} />
          </View>
        ) : (
          /* ── Image / GIF: shimmer → fade-in (expo-image animates GIFs) ─── */
          <>
            {loading && (
              <View style={[s.shimmerWrap, { width: imgW, height: imgH }]} pointerEvents="none">
                <Shimmer width={imgW} height={imgH} />
              </View>
            )}
            <Reanimated.View style={error ? { opacity: 0 } : fadeStyle}>
              <ExpoImage
                key={retryKey}
                source={{ uri: imageUri }}
                style={{ width: imgW, height: imgH }}
                contentFit="contain"
                transition={120}
                onLoad={handleLoad as any}
                onError={handleError}
                accessibilityLabel={isGif ? 'Animated GIF' : 'Photo'}
              />
            </Reanimated.View>
          </>
        )}

        {/* Caption */}
        {message.msCaption ? (
          <View style={s.captionWrap}>
            <Text style={s.caption} numberOfLines={3}>{message.msCaption}</Text>
          </View>
        ) : null}
      </View>
    </MsPressable>
  );
}

const s = StyleSheet.create({
  container:      { marginVertical: 2 },
  containerLeft:  { alignSelf: 'flex-start', marginLeft: 8 },
  containerRight: { alignSelf: 'flex-end',   marginRight: 8 },

  card: {
    borderRadius: 5,
    overflow: 'hidden',
    // No background — image/video shows without a bubble wrapper
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 5,
  },

  shimmerWrap: {
    position: 'absolute',
    top: 0, left: 0,
    zIndex: 1,
  },

  // Video placeholder
  videoPlaceholder: {
    backgroundColor: '#0E0E14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    fontSize: 10,
    fontFamily: T.FONT.medium,
    color: '#fff',
    letterSpacing: 0.2,
  },

  captionWrap: {
    padding: 10,
    backgroundColor: T.SURFACE_2,
  },
  caption: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },

  downloadWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.SURFACE_2,
  },
  downloadTitle: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.ACCENT,
  },
  downloadText: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },

  errorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
    backgroundColor: T.SURFACE_2,
  },
  errorIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
  },
  retryText: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.ACCENT,
  },
});
