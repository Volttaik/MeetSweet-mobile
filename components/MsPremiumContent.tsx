/**
 * MsPremiumContent — one component for premium/locked media in feed, posts, messages.
 * Added: image fade-in loading state, video poster frame + buffering indicator.
 */
import React, { useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { LockSimple, Play } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsPaymentSheet } from '@/components/MsPaymentSheet';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoThumbnail } from '@/components/MsVideoThumbnail';

export interface MsPremiumContentProps {
  uri?: string | null;
  posterUri?: string | null;
  /** Video URL used as fallback when posterUri is absent — first frame is extracted natively. */
  videoThumbnailUri?: string | null;
  mediaType?: 'image' | 'video';
  locked?: boolean;
  unlocked?: boolean;
  price?: number;
  previewSeconds?: number;
  onUnlock?: () => void;
  onPurchase?: () => void;
  height?: number;
  aspectRatio?: number;
  borderRadius?: number;
  style?: ViewStyle;
  overlayOnly?: boolean;
  showPaymentSheet?: boolean;
  /**
   * When provided, tapping the play button on a video card calls this instead
   * of starting inline playback — use in feed/card contexts to navigate to the
   * dedicated player so there is only one active playback controller.
   */
  onPlayPress?: () => void;
}

export function MsPremiumContent({
  uri,
  posterUri,
  videoThumbnailUri,
  mediaType = 'image',
  locked = false,
  unlocked = false,
  price = 0,
  previewSeconds = 2,
  onUnlock,
  onPurchase,
  height = 240,
  aspectRatio,
  borderRadius = T.RADIUS.lg,
  style,
  overlayOnly = false,
  showPaymentSheet = false,
  onPlayPress,
}: MsPremiumContentProps) {
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);

  useEffect(() => {
    setVideoStarted(false);
  }, [uri, locked, mediaType]);

  const isLocked = !unlocked && locked;

  const handleUnlock = () => {
    if (showPaymentSheet) {
      setPaymentVisible(true);
      return;
    }
    onUnlock?.();
  };

  const handlePayment = async () => {
    setPaymentVisible(false);
    onPurchase?.();
    onUnlock?.();
  };

  if (unlocked && overlayOnly) return null;

  return (
    <>
      <View
        style={[
          styles.container,
          { height: aspectRatio ? undefined : height, borderRadius },
          aspectRatio ? { aspectRatio } : undefined,
          style,
        ]}
      >
        {/* Image with shared loading, fade-in and retry states */}
        {!overlayOnly && uri && mediaType === 'image' && (
          <>
            <MsMediaLoader
              uri={uri}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              blurRadius={isLocked ? 20 : 0}
              accessibleLabel="Post image"
            />
          </>
        )}

        {/* Video: poster first; mount the stream only after an explicit play. */}
        {!overlayOnly && uri && mediaType === 'video' && (
          <>
            {!videoStarted && (
              posterUri ? (
                <MsMediaLoader
                  uri={posterUri}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  accessibleLabel="Video poster"
                />
              ) : videoThumbnailUri ? (
                /* First-frame extraction — never shows a blank/black rectangle */
                <MsVideoThumbnail
                  videoUri={videoThumbnailUri}
                  style={StyleSheet.absoluteFill}
                  visible
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.videoPosterFallback]} accessible accessibilityLabel="Video poster placeholder" />
              )
            )}
            {videoStarted && (
              <View style={StyleSheet.absoluteFill}>
                <MsVideoPlayer
                  videoId={uri}
                  uri={uri}
                  autoPlay
                  fillContainer
                  mode="standard"
                />
              </View>
            )}
            {!isLocked && !videoStarted && (
              <TouchableOpacity
                style={styles.playButton}
                onPress={() => {
                  if (onPlayPress) {
                    // Navigate to dedicated player — no inline playback in card mode
                    onPlayPress();
                  } else {
                    setVideoStarted(true);
                  }
                }}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Play video"
              >
                <Play size={26} color={T.TEXT} weight="fill" />
              </TouchableOpacity>
            )}
            {/* Native player handles loading state; no custom spinner needed */}
          </>
        )}

        {!uri && !overlayOnly && <View style={styles.emptyMedia} />}

        {/* Lock overlay */}
        {isLocked && (
          <Animated.View style={StyleSheet.absoluteFill}>
            <View style={styles.scrim} />
            <View style={styles.lockContent}>
              <View style={styles.lockCircle}>
                <LockSimple size={19} color={T.TEXT} weight="bold" />
              </View>
              <Text style={styles.lockTitle}>{price > 0 ? `${price} credits` : 'Subscribers only'}</Text>
              <Text style={styles.lockSubtitle}>Unlock to keep watching</Text>
              <TouchableOpacity onPress={handleUnlock} style={styles.unlockButton} activeOpacity={0.82}>
                <Play size={13} color={T.BG} weight="fill" />
                <Text style={styles.unlockLabel}>{price > 0 ? 'Unlock' : 'Subscribe'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
      {showPaymentSheet && (
        <MsPaymentSheet
          visible={paymentVisible}
          onClose={() => setPaymentVisible(false)}
          amount={Math.max(0, price)}
          onConfirm={handlePayment}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden', backgroundColor: T.SURFACE },
  emptyMedia: { ...StyleSheet.absoluteFillObject, backgroundColor: T.SURFACE_2 },

  playButton: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  videoPosterFallback: {
    backgroundColor: T.SURFACE_2,
  },

  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18,11,16,0.76)',
  },
  lockContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 20,
  },
  lockCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  lockTitle: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 16 },
  lockSubtitle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12 },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 6,
    paddingHorizontal: 20,
    height: 40,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
  },
  unlockLabel: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 13 },
});
