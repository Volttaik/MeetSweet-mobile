/**
 * MsPremiumContent — one component for premium/locked media in feed, posts, messages.
 * Compact blur overlay with dynamic payment button + wallet-based payment.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { MsVideoPreview } from '@/components/MsVideoPreview';
import { LockSimple, Play, Lightning } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsPaymentSheet } from '@/components/MsPaymentSheet';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoThumbnail } from '@/components/MsVideoThumbnail';

export interface MsPremiumContentProps {
  uri?: string | null;
  posterUri?: string | null;
  videoThumbnailUri?: string | null;
  mediaType?: 'image' | 'video';
  locked?: boolean;
  unlocked?: boolean;
  /** Price in Naira (₦) */
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
  onPlayPress?: () => void;
  previewMode?: boolean;
  active?: boolean;
  /** User's wallet balance in Naira — shown on the pay button */
  walletBalance?: number;
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
  previewMode = false,
  active = true,
  walletBalance,
}: MsPremiumContentProps) {
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [localUnlocked, setLocalUnlocked] = useState(false);

  // Overlay fade-out on unlock
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const btnScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    setVideoStarted(false);
    setLocalUnlocked(false);
    overlayOpacity.setValue(1);
  }, [uri, locked, mediaType]);

  // Animate button in
  useEffect(() => {
    if (locked && !unlocked) {
      Animated.spring(btnScale, {
        toValue: 1,
        damping: 12,
        stiffness: 280,
        mass: 1,
        useNativeDriver: true,
      }).start();
    }
  }, [locked, unlocked]);

  const isLocked = !unlocked && !localUnlocked && locked;

  const handleUnlock = () => {
    if (showPaymentSheet) {
      setPaymentVisible(true);
      return;
    }
    onUnlock?.();
  };

  const handleCreditPay = async () => {
    setUnlocking(true);
    // Animate overlay out
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setLocalUnlocked(true));

    try {
      onPurchase?.();
      onUnlock?.();
    } finally {
      setUnlocking(false);
    }
  };

  const handlePayment = async () => {
    setPaymentVisible(false);
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setLocalUnlocked(true));
    onPurchase?.();
    onUnlock?.();
  };

  if (unlocked && overlayOnly) return null;

  const hasSufficientBalance = walletBalance !== undefined && walletBalance >= price;

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
        {/* Image */}
        {!overlayOnly && uri && mediaType === 'image' && (
          <MsMediaLoader
            uri={uri}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            blurRadius={isLocked ? 18 : 0}
            accessibleLabel="Post image"
          />
        )}

        {/* Video — feed preview */}
        {!overlayOnly && uri && mediaType === 'video' && previewMode && !isLocked && (
          <MsVideoPreview
            uri={uri}
            posterUri={posterUri ?? videoThumbnailUri ?? null}
            active={active}
          />
        )}

        {/* Video — standard mode */}
        {!overlayOnly && uri && mediaType === 'video' && !previewMode && (
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
                <MsVideoThumbnail
                  videoUri={videoThumbnailUri}
                  style={StyleSheet.absoluteFill}
                  visible
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.videoPosterFallback]} />
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
                    onPlayPress();
                  } else {
                    setVideoStarted(true);
                  }
                }}
                activeOpacity={0.82}
              >
                <Play size={22} color={T.TEXT} weight="fill" />
              </TouchableOpacity>
            )}
          </>
        )}

        {!uri && !overlayOnly && <View style={styles.emptyMedia} />}

        {/* Lock overlay — compact, blur-based, gradient fade */}
        {isLocked && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
            {/* Dark scrim with gradient fade top→bottom */}
            <View style={styles.scrimTop} />
            <View style={styles.scrimBottom} />

            <View style={styles.lockContent}>
              {/* Small lock icon */}
              <View style={styles.lockIcon}>
                <LockSimple size={16} color={T.TEXT} weight="bold" />
              </View>

              <Text style={styles.lockTitle}>
                {price > 0 ? 'Premium Content' : 'Subscribers Only'}
              </Text>

              {/* Primary: unlock/pay button */}
              <Animated.View style={{ transform: [{ scale: btnScale }] }}>
                <TouchableOpacity
                  onPress={handleUnlock}
                  style={styles.unlockBtn}
                  activeOpacity={0.82}
                  disabled={unlocking}
                >
                  <Play size={11} color={T.BG} weight="fill" />
                  <Text style={styles.unlockLabel}>
                    {price > 0 ? `Unlock for ₦${price.toLocaleString()}` : 'Subscribe'}
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Secondary: quick wallet pay (if user has balance) */}
              {price > 0 && walletBalance !== undefined && (
                <TouchableOpacity
                  onPress={hasSufficientBalance ? handleCreditPay : handleUnlock}
                  style={styles.walletBtn}
                  activeOpacity={0.75}
                  disabled={unlocking}
                >
                  <Lightning size={10} color={hasSufficientBalance ? T.ACCENT : T.TEXT_3} weight="fill" />
                  <Text style={[styles.walletLabel, !hasSufficientBalance && { color: T.TEXT_3 }]}>
                    {hasSufficientBalance
                      ? `Pay from wallet (₦${walletBalance.toLocaleString()} available)`
                      : `Need ₦${(price - (walletBalance ?? 0)).toLocaleString()} more`}
                  </Text>
                </TouchableOpacity>
              )}
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
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  videoPosterFallback: { backgroundColor: T.SURFACE_2 },

  // Gradient scrim — top dark fade + bottom stronger dark
  scrimTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,6,12,0.52)',
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'rgba(8,6,12,0.38)',
  },

  lockContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  lockIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  lockTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 34,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
  },
  unlockLabel: {
    color: T.BG,
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
  walletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: T.RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: -2,
  },
  walletLabel: {
    color: T.ACCENT,
    fontFamily: T.FONT.medium,
    fontSize: 10,
    letterSpacing: 0.1,
  },
});
