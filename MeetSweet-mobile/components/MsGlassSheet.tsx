/**
 * MsGlassSheet — unified glassmorphic bottom sheet base.
 *
 * All messaging bottom sheets use this component as their foundation.
 * Presentation is a native bottom sheet (@gorhom/bottom-sheet) driven by
 * Reanimated worklets on the UI thread — native swipe-to-dismiss, native
 * backdrop, no JS-thread Modal animation, no PanResponder.
 *
 * • BlurView frosted glass (iOS native blur, Android opaque surface fallback)
 * • Semi-transparent glass surface with soft border
 * • Safe-area aware
 * • Dark theme integrated
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { T } from '@/constants/theme';

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
  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (visible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [visible]);

  const renderBackdrop = useMemo(
    () => (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={backdropOpacity}
      />
    ),
    [backdropOpacity]
  );

  const paddingBottom = Math.max(insets.bottom, 16) + extraBottomPad;

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={['auto']}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={s.sheetBackground}
      handleIndicatorStyle={s.handle}
      onDismiss={onClose}
    >
      {/* Blur layer (iOS only — Android uses opaque surface) */}
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={60}
          tint="dark"
          style={[
            s.glassInner,
            fixedHeight ? { height: fixedHeight } : undefined,
            { paddingBottom },
            surfaceStyle,
          ]}
        >
          <View style={s.glassBorder} pointerEvents="none" />
          {children}
        </BlurView>
      ) : (
        <BottomSheetView
          style={[
            s.androidSurface,
            fixedHeight ? { height: fixedHeight } : undefined,
            { paddingBottom },
            surfaceStyle,
          ]}
        >
          <View style={s.glassBorder} pointerEvents="none" />
          {children}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}

const s = StyleSheet.create({
  sheetBackground: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(22,22,28,0.97)',
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
  },
});
