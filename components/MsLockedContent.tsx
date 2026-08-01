/**
 * MsLockedContent — compact premium content overlay.
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

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 1100, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (unlocked) return null;

  return (
    <View style={[styles.container, { height, borderRadius }, style]}>
      {previewUri ? (
        <MsMediaLoader
          uri={previewUri}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          resizeMode="cover"
          blurRadius={18}
          accessibleLabel="Locked media preview"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { borderRadius, backgroundColor: T.SURFACE_2 }]} />
      )}

      {/* Gradient scrim */}
      <LinearGradient
        colors={['rgba(10,8,14,0.45)', 'rgba(10,8,14,0.86)']}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
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
            <Lock size={16} color={T.TEXT} weight="bold" />
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
              <Lock size={10} color={T.TEXT} weight="bold" />
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
    gap: 8,
    paddingHorizontal: 20,
  },
  premiumBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: T.RADIUS.full,
    marginBottom: 2,
  },
  premiumText: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    letterSpacing: 0.5,
  },
  lockCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
  },
  lockGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  price: {
    fontSize: 14,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 18,
  },
  btnWrap: {},
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: T.RADIUS.full,
    marginTop: 2,
  },
  unlockLabel: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
});
