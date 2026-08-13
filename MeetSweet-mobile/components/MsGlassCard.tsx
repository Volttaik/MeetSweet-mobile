/**
 * MsGlassCard — Premium glassmorphic container with specular edge highlight & micro-springs.
 *
 * Provides a dark frosted glass surface with:
 * • Specular top edge highlight for glass depth
 * • iOS native BlurView (with translucent Android surface fallback)
 * • Optional tactile spring-bounce press feedback
 * • Custom radius, glow, and shadow levels
 */
import React, { useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from '@/constants/theme';
import { tapLight } from '@/lib/haptics';

interface MsGlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Radius scale from T.RADIUS (default 'lg' / 16) */
  radius?: keyof typeof T.RADIUS | number;
  /** Blur intensity on iOS (default 45) */
  intensity?: number;
  /** Enable scale spring micro-interaction on press (default false) */
  interactive?: boolean;
  /** Specular border tint opacity (default 0.12) */
  borderOpacity?: number;
  /** Background opacity multiplier (default 0.85) */
  bgOpacity?: number;
}

export function MsGlassCard({
  children,
  style,
  onPress,
  onLongPress,
  radius = 'lg',
  intensity = 45,
  interactive = false,
  borderOpacity = 0.12,
  bgOpacity = 0.85,
}: MsGlassCardProps) {
  const borderRadius = typeof radius === 'number' ? radius : T.RADIUS[radius] ?? T.RADIUS.lg;

  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!interactive && !onPress) return;
    tapLight();
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        damping: 14,
        stiffness: 350,
        mass: 0.6,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.88,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    if (!interactive && !onPress) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 12,
        stiffness: 260,
        mass: 0.6,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const isClickable = Boolean(onPress || onLongPress || interactive);

  const containerContent = (
    <View style={[styles.cardOuter, { borderRadius }, T.SHADOWS.medium, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={intensity}
          tint="dark"
          style={[styles.glassContent, { borderRadius }]}
        >
          {/* Specular top-edge shine */}
          <LinearGradient
            colors={[`rgba(255, 255, 255, ${borderOpacity * 1.8})`, 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.topShine, { borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius }]}
            pointerEvents="none"
          />
          {children}
        </BlurView>
      ) : (
        <View style={[styles.androidGlass, { borderRadius, backgroundColor: `rgba(22, 22, 28, ${bgOpacity})` }]}>
          <View
            style={[
              styles.borderOverlay,
              { borderRadius, borderColor: `rgba(255, 255, 255, ${borderOpacity})` },
            ]}
            pointerEvents="none"
          />
          {/* Specular top-edge shine */}
          <LinearGradient
            colors={[`rgba(255, 255, 255, ${borderOpacity * 1.5})`, 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.topShine, { borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius }]}
            pointerEvents="none"
          />
          {children}
        </View>
      )}
    </View>
  );

  if (!isClickable) {
    return containerContent;
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressableWrap}
      >
        {containerContent}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressableWrap: {
    width: '100%',
  },
  cardOuter: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  glassContent: {
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  androidGlass: {
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  topShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
  },
});
