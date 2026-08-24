/**
 * MsModal — shared modal/sheet shell.
 *
 * • 'sheet'  → native bottom sheet (@gorhom/bottom-sheet): Reanimated
 *              worklet-driven presentation, native swipe-to-dismiss and
 *              backdrop — no JS-thread Modal animation, no PanResponder.
 * • 'center' → native RN Modal (renders as a real native dialog) with the
 *              platform's native fade animation — no JS-driven animation.
 */
import React, { ReactNode, useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { X } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/constants/theme';

export interface MsModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  presentation?: 'sheet' | 'center';
  style?: ViewStyle;
}

export function MsModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  presentation = 'sheet',
  style,
}: MsModalProps) {
  const insets = useSafeAreaInsets();
  const isSheet = presentation === 'sheet';
  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (!isSheet) return;
    if (visible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [visible, isSheet]);

  const renderBackdrop = useMemo(
    () => (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.72}
      />
    ),
    []
  );

  // ── Sheet presentation: native bottom sheet ───────────────────────────────
  if (isSheet) {
    return (
      <BottomSheetModal
        ref={sheetRef}
        index={0}
        snapPoints={['auto']}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handle}
        onDismiss={onClose}
      >
        <BottomSheetView
          style={[
            styles.sheetBody,
            { paddingBottom: Math.max(insets.bottom + 8, 20) },
            style,
          ]}
        >
          {(title || subtitle) && (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                {title && <Text style={styles.title}>{title}</Text>}
                {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
              <MsPressable onPress={onClose} hitSlop={12} style={styles.close}>
                <X size={18} color={T.TEXT_2} />
              </MsPressable>
            </View>
          )}
          <View style={styles.body}>{children}</View>
          {footer && <View style={styles.footer}>{footer}</View>}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }

  // ── Center presentation: native dialog modal ─────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlayWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.centerSurface, style]}>
          {(title || subtitle) && (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                {title && <Text style={styles.title}>{title}</Text>}
                {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
              <MsPressable onPress={onClose} hitSlop={12} style={styles.close}>
                <X size={18} color={T.TEXT_2} />
              </MsPressable>
            </View>
          )}
          <View style={styles.body}>{children}</View>
          {footer && <View style={styles.footer}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(8,5,8,0.72)',
  },
  sheetBackground: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: T.SHADOW,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 18,
  },
  sheetBody: {
    backgroundColor: T.SURFACE,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  centerSurface: {
    width: '86%',
    borderRadius: 24,
    backgroundColor: T.SURFACE,
    padding: 20,
    shadowColor: T.SHADOW,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 18,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  headerCopy: { flex: 1 },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: 12 },
  footer: { marginTop: 18 },
});
