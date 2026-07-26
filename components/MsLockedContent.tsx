/**
 * MsLockedContent — reusable locked/premium content overlay.
 * Drop over any image, video, or content area that requires purchase.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock } from 'phosphor-react-native';
import { T, AppGradients } from '@/constants/theme';
import { MsMediaLoader } from '@/components/MsMediaLoader';

interface MsLockedContentProps {
  previewUri?: string | null;
  price?: number;
  label?: string;
  onUnlock?: () => void;
  unlocked?: boolean;
  height?: number;
  borderRadius?: number;
  showPremiumBadge?: boolean;
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
  const pulse  = useRef(new Animated.Value(1)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 950, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 950, useNativeDriver: true }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    shimmerLoop.start();
    return () => { loop.stop(); shimmerLoop.stop(); };
  }, [pulse, shimmer]);

  const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.18] });

  if (unlocked) return null;

  return (
    <View style={[styles.container, { height, borderRadius }, style]}>
      {previewUri ? (
        <MsMediaLoader
          uri={previewUri}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          resizeMode="cover"
          blurRadius={22}
          accessibleLabel="Locked media preview"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { borderRadius, backgroundColor: T.SURFACE_2 }]} />
      )}

      {/* Dark scrim */}
      <LinearGradient
        colors={['rgba(14,11,18,0.55)', 'rgba(14,11,18,0.88)']}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />

      {/* Shimmer */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { borderRadius, backgroundColor: T.ROSE, opacity: shimmerOpacity }]}
      />

      <View style={styles.inner}>
        {showPremiumBadge && (
          <LinearGradient
            colors={AppGradients.premium}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.premiumBadge}
          >
            <Text style={styles.premiumText}>✦ Premium</Text>
          </LinearGradient>
        )}

        <Animated.View style={[styles.lockCircle, { transform: [{ scale: pulse }] }]}>
          <LinearGradient
            colors={AppGradients.rosePurple}
            style={styles.lockGradient}
          >
            <Lock size={20} color={T.TEXT} weight="bold" />
          </LinearGradient>
        </Animated.View>

        {price !== undefined && (
          <Text style={styles.price}>
            {price === 0 ? 'Subscribe to view' : `${price} credits`}
          </Text>
        )}

        {label ? <Text style={styles.label}>{label}</Text> : null}

        {onUnlock && (
          <TouchableOpacity onPress={onUnlock} activeOpacity={0.85} style={styles.btnWrap}>
            <LinearGradient
              colors={AppGradients.rose}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.unlockBtn}
            >
              <Lock size={12} color={T.TEXT} weight="bold" />
              <Text style={styles.unlockLabel}>
                {price === 0 ? 'Subscribe' : 'Unlock'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', width: '100%' },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  premiumBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
    marginBottom: 2,
  },
  premiumText: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    letterSpacing: 0.6,
  },
  lockCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  lockGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  price: {
    fontSize: 16,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.4,
  },
  label: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 20,
  },
  btnWrap: {},
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: T.RADIUS.full,
    marginTop: 4,
  },
  unlockLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
});
