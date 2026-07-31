/**
 * MsMediaCard — ~5px radius media message card.
 * Used for image, video, and thumbnail previews.
 * Premium card appearance with elegant shadows.
 * Includes shimmer placeholder, error state, and retry.
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

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = SCREEN_W * 0.62;
const CARD_H = CARD_W * 0.75;

interface Props {
  message: MsMessage;
  position: 'left' | 'right';
  onPress?: () => void;
  /** For paid locked content */
  isLocked?: boolean;
}

function ShimmerPlaceholder({ width, height }: { width: number; height: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        width,
        height,
        backgroundColor: T.SURFACE_2,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] }),
      }}
    />
  );
}

export function MsMediaCard({ message, position, onPress, isLocked }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const isOwn = position === 'right';
  const isVideo = message.msMediaType === 'video' || !!message.video;
  const uri = message.image || message.video || message.audio || '';

  const handleRetry = useCallback(() => {
    setError(false);
    setLoading(true);
    setRetryKey((k) => k + 1);
  }, []);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, isOwn ? styles.containerRight : styles.containerLeft]}
    >
      <View style={[styles.card, isLocked && styles.cardLocked]}>
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>Failed to load</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.7}>
              <ArrowClockwise size={16} color={T.ACCENT} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {loading && (
              <View style={styles.shimmerWrap} pointerEvents="none">
                <ShimmerPlaceholder width={CARD_W} height={CARD_H} />
              </View>
            )}
            <Image
              key={retryKey}
              source={{ uri }}
              style={[styles.image, isLocked && styles.imageLocked, loading && styles.imageHidden]}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              resizeMode="cover"
            />
            {isVideo && !loading && (
              <View style={styles.playOverlay}>
                <View style={styles.playButton}>
                  <Play size={22} color="#fff" weight="fill" />
                </View>
              </View>
            )}
          </>
        )}

        {/* Caption */}
        {message.msCaption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.caption} numberOfLines={2}>
              {message.msCaption}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
  },
  containerLeft: {
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  containerRight: {
    alignSelf: 'flex-end',
    marginRight: 8,
  },

  card: {
    width: CARD_W,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
    ...T.SHADOWS.medium,
  },
  cardLocked: {
    opacity: 0.6,
  },

  shimmerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },

  image: {
    width: CARD_W,
    height: CARD_H,
  },
  imageHidden: {
    opacity: 0,
  },
  imageLocked: {
    opacity: 0.3,
  },

  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
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
    height: CARD_H * 0.5,
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
