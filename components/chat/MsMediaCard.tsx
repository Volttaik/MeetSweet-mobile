/**
 * MsMediaCard — premium media message card.
 *
 * Images:
 *  • Skeleton shimmer while loading
 *  • Smooth Animated fade-in on load
 *  • Rounded 6 px corners
 *  • Tap → fullscreen (handled by parent)
 *
 * Videos:
 *  • Dark placeholder (first-frame thumbnails not available without native module)
 *  • Small centred play indicator — NOT a full-width play button
 *  • Duration badge bottom-right (if msAudioDuration supplied)
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
import { Play, ArrowClockwise } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';
import { formatDuration } from '@/types/chat-message';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = SCREEN_W * 0.62;
const CARD_H   = CARD_W  * 0.75;

// ── Shimmer placeholder ───────────────────────────────────────────────────────

function Shimmer({ width, height }: { width: number; height: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 850, useNativeDriver: true }),
      ]),
    ).start();
    return () => anim.stopAnimation();
  }, []);

  return (
    <Animated.View
      style={{
        width,
        height,
        backgroundColor: T.SURFACE_2,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }),
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
  message: MsMessage;
  position: 'left' | 'right';
  onPress?: () => void;
  isLocked?: boolean;
}

export function MsMediaCard({ message, position, onPress, isLocked }: Props) {
  const isOwn  = position === 'right';
  const isVideo = message.msMediaType === 'video' || !!message.video;

  // For images, use image URI; for videos, try image field as thumbnail fallback
  const imageUri  = message.image || (isVideo ? undefined : message.audio) || '';
  const hasThumb  = !isVideo && !!imageUri;
  const videoDur  = message.msAudioDuration ?? 0;

  const [loading,  setLoading]  = useState(hasThumb);
  const [error,    setError]    = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Smooth fade-in
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const handleLoad = useCallback(() => {
    setLoading(false);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

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
    >
      <View style={[s.card, isLocked && s.cardLocked]}>
        {error ? (
          <View style={s.errorWrap}>
            <Text style={s.errorText}>Failed to load</Text>
            <TouchableOpacity style={s.retryBtn} onPress={handleRetry} activeOpacity={0.7}>
              <ArrowClockwise size={16} color={T.ACCENT} />
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : isVideo ? (
          /* ── Video: dark placeholder + centred play ring + duration badge ── */
          <View style={s.videoPlaceholder}>
            <View style={s.videoPlayRing}>
              <Play size={20} color="#fff" weight="fill" />
            </View>
            <DurationBadge secs={videoDur} />
          </View>
        ) : (
          /* ── Image: shimmer → fade-in image ─────────────────────────────── */
          <>
            {loading && (
              <View style={s.shimmerWrap} pointerEvents="none">
                <Shimmer width={CARD_W} height={CARD_H} />
              </View>
            )}
            <Animated.Image
              key={retryKey}
              source={{ uri: imageUri }}
              style={[
                s.image,
                isLocked && s.imageLocked,
                { opacity: error ? 0 : fadeAnim },
              ]}
              onLoad={handleLoad}
              onError={() => { setLoading(false); setError(true); }}
              resizeMode="cover"
            />
          </>
        )}

        {/* Caption */}
        {message.msCaption ? (
          <View style={s.captionWrap}>
            <Text style={s.caption} numberOfLines={2}>{message.msCaption}</Text>
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
    width: CARD_W,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
    ...T.SHADOWS.medium,
  },
  cardLocked: { opacity: 0.55 },

  shimmerWrap: {
    position: 'absolute',
    top: 0, left: 0,
    zIndex: 1,
  },

  image: {
    width: CARD_W,
    height: CARD_H,
  },
  imageLocked: { opacity: 0.3 },

  // Video placeholder
  videoPlaceholder: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: '#111116',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.62)',
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
    width: CARD_W,
    height: CARD_H * 0.55,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  errorText: {
    fontSize: 13,
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
