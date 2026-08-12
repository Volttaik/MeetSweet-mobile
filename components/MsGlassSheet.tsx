/**
 * MsGlassSheet — unified glassmorphic bottom sheet base.
 *
 * All messaging bottom sheets use this component as their foundation:
 * • BlurView frosted glass (iOS native blur, Android fallback)
 * • Semi-transparent glass surface with soft border
 * • Smooth spring slide-up / timing slide-down
 * • Backdrop tap to dismiss
 * • Safe-area aware
 * • Dark theme integrated
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { T } from '@/constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** How tall the sheet is (default: auto based on children) */
  fixedHeight?: number;
  /** Extra style applied to the glass surface */
  surfaceStyle?: ViewStyle;
  /** Extra bottom padding beyond safe area (default 0) */
  extraBottomPad?: number;
  /** Backdrop opacity (default 0.6) */
  backdropOpacity?: number;
}

export function MsGlassSheet({
  visible,
  onClose,
  children,
  fixedHeight,
  surfaceStyle,
  extraBottomPad = 0,
  backdropOpacity = 0.6,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim   = useRef(new Animated.Value(SCREEN_H)).current;
  const bgAnim      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 240,
          mass: 0.9,
        }),
        Animated.timing(bgAnim, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_H,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const paddingBottom = Math.max(insets.bottom, 16) + extraBottomPad;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Animated backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: `rgba(0,0,0,${backdropOpacity})`,
            opacity: bgAnim,
          },
        ]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Glass sheet */}
      <Animated.View
        style={[
          s.sheetOuter,
          fixedHeight ? { height: fixedHeight } : undefined,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Blur layer (iOS only — Android uses opaque surface) */}
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={60}
            tint="dark"
            style={[s.glassInner, { paddingBottom }, surfaceStyle]}
          >
            <View style={s.glassBorder} pointerEvents="none" />
            <View style={s.handle} />
            {children}
          </BlurView>
        ) : (
          <View style={[s.androidSurface, { paddingBottom }, surfaceStyle]}>
            <View style={s.glassBorder} pointerEvents="none" />
            <View style={s.handle} />
            {children}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheetOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    // Soft drop shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 20,
  },
  glassInner: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  androidSurface: {
    backgroundColor: 'rgba(22,22,28,0.97)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  // Inset border at the top for "glass edge" feel
  glassBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 16,
  },
});
