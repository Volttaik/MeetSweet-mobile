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

/**
 * One premium-media implementation for feed cards, posts, messages and
 * collections. Video previews stop themselves and transition into the same
 * lock state used by blurred images.
 */
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
  const fade = useRef(new Animated.Value(0)).current;
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    setPreviewEnded(false);
    fade.setValue(0);
  }, [uri, locked, mediaType, fade]);

  const isLocked = !unlocked && locked && (mediaType !== 'video' || previewEnded);
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
        {!overlayOnly && uri && mediaType === 'image' && (
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            blurRadius={isLocked ? 20 : 0}
          />
        )}
        {!overlayOnly && uri && mediaType === 'video' && (
          <Video
            ref={videoRef}
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            shouldPlay={!isLocked && !unlocked}
            isLooping={!locked || unlocked}
            onPlaybackStatusUpdate={(status: any) => {
              if (
                locked &&
                !unlocked &&
                status?.isLoaded &&
                status.positionMillis >= previewSeconds * 1000
              ) {
                setPreviewEnded(true);
                Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
              }
            }}
          />
        )}
        {!uri && !overlayOnly && <View style={styles.emptyMedia} />}

        {isLocked && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
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
    height: 38,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
  },
  unlockLabel: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 13 },
});