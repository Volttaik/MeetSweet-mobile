/**
 * MsMediaCard — premium media message card.
 *
 * Images:
 *  • Natural aspect ratio from onLoad dimensions
 *  • Skeleton shimmer while loading
 *  • Smooth Animated fade-in on load
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
import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Play, ArrowClockwise, Image as ImageIcon } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';
import { formatDuration } from '@/types/chat-message';

const SCREEN_W    = Dimensions.get('window').width;
/** Maximum width a media bubble may occupy */
const MAX_CARD_W  = Math.round(SCREEN_W * 0.68);
const MIN_CARD_W  = 160;
/** Default height while we wait for natural dimensions */
const DEFAULT_H   = Math.round(MAX_CARD_W * 0.65);

// ── Shimmer placeholder ───────────────────────────────────────────────────────

function Shimmer({ width, height }: { width: number; height: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 820, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 820, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        width,
        height,
        backgroundColor: T.SURFACE_2,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
      }}
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
  isLocked?:  boolean;
}

export function MsMediaCard({ message, position, onPress, isLocked }: Props) {
  const isOwn   = position === 'right';
  const isVideo = message.msMediaType === 'video' || !!message.video;

  const imageUri = message.image || (isVideo ? undefined : message.audio) || '';
  const hasThumb = !isVideo && !!imageUri;
  const videoDur = message.msAudioDuration ?? 0;

  // Natural image dimensions
  const [imgW, setImgW] = useState<number>(MAX_CARD_W);
  const [imgH, setImgH] = useState<number>(DEFAULT_H);

  const [loading,  setLoading]  = useState(hasThumb);
  const [error,    setError]    = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Smooth fade-in
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleLoad = useCallback((e: { nativeEvent: { source: { width: number; height: number } } }) => {
    const { width: nw, height: nh } = e.nativeEvent.source;
    if (nw > 0 && nh > 0) {
      // Fit within MAX_CARD_W while preserving ratio
      const ratio = nh / nw;
      const fw    = Math.min(Math.max(nw, MIN_CARD_W), MAX_CARD_W);
      const fh    = Math.round(fw * ratio);
      // Clamp height: no taller than screen * 0.55, no shorter than MIN_CARD_W * 0.5
      const clampedH = Math.max(80, Math.min(fh, Math.round(SCREEN_W * 0.55)));
      setImgW(fw);
      setImgH(clampedH);
    }
    setLoading(false);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleError = useCallback(() => {
    setLoading(false);
    setError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setError(false);
    setLoading(true);
    fadeAnim.setValue(0);
    setRetryKey((k) => k + 1);
  }, [fadeAnim]);

  return (
    <Pressable
      onPress={onPress}
      style={[s.container, isOwn ? s.containerRight : s.containerLeft]}
      android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
      accessibilityLabel={isVideo ? 'Video message. Tap to play.' : 'Image message. Tap to view.'}
      accessibilityRole="button"
    >
      <View
        style={[
          s.card,
          isLocked && s.cardLocked,
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
            <TouchableOpacity style={s.retryBtn} onPress={handleRetry} activeOpacity={0.7}>
              <ArrowClockwise size={16} color={T.ACCENT} />
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : isVideo ? (
          /* ── Video: dark placeholder + large play ring + duration ──────── */
          <View style={[s.videoPlaceholder, { width: MAX_CARD_W, height: DEFAULT_H }]}>
            {/* Large semi-transparent play circle */}
            <View style={s.videoPlayRing}>
              <View style={s.videoPlayInner}>
                <Play size={26} color="#fff" weight="fill" style={{ marginLeft: 3 }} />
              </View>
            </View>
            <DurationBadge secs={videoDur} />
          </View>
        ) : (
          /* ── Image: shimmer → fade-in ────────────────────────────────────── */
          <>
            {loading && (
              <View style={[s.shimmerWrap, { width: imgW, height: imgH }]} pointerEvents="none">
                <Shimmer width={imgW} height={imgH} />
              </View>
            )}
            <Animated.Image
              key={retryKey}
              source={{ uri: imageUri }}
              style={[
                { width: imgW, height: imgH },
                isLocked && s.imageLocked,
                { opacity: error ? 0 : fadeAnim },
              ]}
              onLoad={handleLoad as any}
              onError={handleError}
              resizeMode="cover"
              accessibilityLabel="Photo"
            />
          </>
        )}

        {/* Caption */}
        {message.msCaption ? (
          <View style={s.captionWrap}>
            <Text style={s.caption} numberOfLines={3}>{message.msCaption}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  container:      { marginVertical: 2 },
  containerLeft:  { alignSelf: 'flex-start', marginLeft: 8 },
  containerRight: { alignSelf: 'flex-end',   marginRight: 8 },

  card: {
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  cardLocked: { opacity: 0.55 },

  shimmerWrap: {
    position: 'absolute',
    top: 0, left: 0,
    zIndex: 1,
  },

  imageLocked: { opacity: 0.3 },

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

  errorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
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
