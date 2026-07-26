/**
 * MsPremiumContent — one component for premium/locked media in feed, posts, messages.
 * Added: image fade-in loading state, video poster frame + buffering indicator.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import { LockSimple, Play } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsPaymentSheet } from '@/components/MsPaymentSheet';

export interface MsPremiumContentProps {
  uri?: string | null;
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
}

export function MsPremiumContent({
  uri,
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
}: MsPremiumContentProps) {
  const [previewEnded, setPreviewEnded] = useState(false);
  const [paymentVisible, setPaymentVisible] = useState(false);

  // Image loading fade-in
  const imageFade = useRef(new Animated.Value(0)).current;
  const [imageLoaded, setImageLoaded] = useState(false);

  // Lock overlay fade-in
  const lockFade = useRef(new Animated.Value(0)).current;

  // Video buffering state
  const [videoBuffering, setVideoBuffering] = useState(true);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    setPreviewEnded(false);
    imageFade.setValue(0);
    lockFade.setValue(0);
    setImageLoaded(false);
    setVideoBuffering(true);
  }, [uri, locked, mediaType]);

  const isLocked = !unlocked && locked && (mediaType !== 'video' || previewEnded);

  const handleImageLoad = () => {
    setImageLoaded(true);
    Animated.timing(imageFade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  };

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
        {/* Image with loading placeholder + fade-in */}
        {!overlayOnly && uri && mediaType === 'image' && (
          <>
            {/* Skeleton shown while loading */}
            {!imageLoaded && (
              <View style={[StyleSheet.absoluteFill, styles.imagePlaceholder]} />
            )}
            <Animated.Image
              source={{ uri }}
              style={[StyleSheet.absoluteFill, { opacity: imageFade }]}
              resizeMode={ResizeMode.COVER as any}
              blurRadius={isLocked ? 20 : 0}
              onLoad={handleImageLoad}
            />
          </>
        )}

        {/* Video with buffering indicator */}
        {!overlayOnly && uri && mediaType === 'video' && (
          <>
            <Video
              ref={videoRef}
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.COVER}
              shouldPlay={!isLocked && !unlocked}
              isLooping={!locked || unlocked}
              isMuted
              onReadyForDisplay={() => setVideoBuffering(false)}
              onPlaybackStatusUpdate={(status: any) => {
                if (status?.isLoaded) {
                  setVideoBuffering(status.isBuffering ?? false);
                  if (
                    locked &&
                    !unlocked &&
                    status.positionMillis >= previewSeconds * 1000
                  ) {
                    setPreviewEnded(true);
                    Animated.timing(lockFade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
                  }
                }
              }}
            />
            {/* Buffering indicator */}
            {videoBuffering && !isLocked && (
              <View style={styles.videoBufferingWrap} pointerEvents="none">
                <View style={styles.videoBufferingRing} />
              </View>
            )}
          </>
        )}

        {!uri && !overlayOnly && <View style={styles.emptyMedia} />}

        {/* Lock overlay */}
        {isLocked && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: mediaType === 'video' && previewEnded ? lockFade : 1 }]}>
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
  imagePlaceholder: { backgroundColor: T.SURFACE_2 },
  emptyMedia: { ...StyleSheet.absoluteFillObject, backgroundColor: T.SURFACE_2 },

  videoBufferingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBufferingRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopColor: 'rgba(255,255,255,0.85)',
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
