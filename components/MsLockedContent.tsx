/**
 * MsLockedContent — reusable locked/premium content overlay.
 * Drop it over any image, video, or content area that requires purchase.
 * Supports blurred preview, animated lock, credit price, and unlock CTA.
 * Does NOT include any download or save button — access is in-app only.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { Lock } from 'phosphor-react-native';
import { T } from '@/constants/theme';

interface MsLockedContentProps {
  /** URI of the preview image/thumbnail — will be blurred */
  previewUri?: string | null;
  /** Credit cost to unlock. Omit to hide price line. */
  price?: number;
  /** Optional descriptor shown below price */
  label?: string;
  /** Called when "Unlock" button is pressed */
  onUnlock?: () => void;
  /** If true, renders nothing (content is already unlocked) */
  unlocked?: boolean;
  /** Height of the locked area (default 240) */
  height?: number;
  /** Border radius (default T.RADIUS.lg) */
  borderRadius?: number;
  /** Show a gold ✦ Premium badge above the lock */
  showPremiumBadge?: boolean;
  /** Additional container styles */
  style?: ViewStyle;
}

export function MsLockedContent({
  previewUri,
  price,
  label,
  onUnlock,
  unlocked = false,
  height = 240,
  borderRadius = T.RADIUS.lg,
  showPremiumBadge = false,
  style,
}: MsLockedContentProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (unlocked) return null;

  return (
    <View style={[styles.container, { height, borderRadius }, style]}>
      {/* Blurred background */}
      {previewUri ? (
        <Image
          source={{ uri: previewUri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          resizeMode="cover"
          blurRadius={20}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius, backgroundColor: T.SURFACE_2 },
          ]}
        />
      )}

      {/* Dark scrim */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius, backgroundColor: 'rgba(0,0,0,0.72)' },
        ]}
      />

      {/* Content */}
      <View style={styles.inner}>
        {showPremiumBadge && (
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumText}>✦ Premium</Text>
          </View>
        )}

        <Animated.View
          style={[styles.lockCircle, { transform: [{ scale: pulse }] }]}
        >
          <Lock size={22} color={T.TEXT} weight="bold" />
        </Animated.View>

        {price !== undefined && (
          <Text style={styles.price}>
            {price === 0 ? 'Subscribe to view' : `${price} credits`}
          </Text>
        )}

        {label ? <Text style={styles.label}>{label}</Text> : null}

        {onUnlock && (
          <TouchableOpacity
            style={styles.unlockBtn}
            onPress={onUnlock}
            activeOpacity={0.85}
          >
            <Lock size={12} color={T.BG} weight="bold" />
            <Text style={styles.unlockLabel}>
              {price === 0 ? 'Subscribe' : 'Unlock'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  premiumBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
    backgroundColor: 'rgba(255,215,0,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.28)',
    marginBottom: 2,
  },
  premiumText: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: '#FFD700',
    letterSpacing: 0.5,
  },
  lockCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  price: {
    fontSize: 15,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 19,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
  },
  unlockLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
});
