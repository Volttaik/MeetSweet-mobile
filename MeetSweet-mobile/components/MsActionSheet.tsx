/**
 * MsActionSheet — reusable native context-menu bottom sheet.
 *
 * Presentation is a native bottom sheet (@gorhom/bottom-sheet) driven by
 * Reanimated worklets on the UI thread — no JS-thread Modal animation, no
 * web-style transitions, no PanResponder drag simulation. Each action item
 * gets native scale press feedback (MsPressable) plus haptics.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { X } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsPressable } from '@/components/MsPressable';
import { tapLight, tapMedium } from '@/lib/haptics';

export interface ActionItem {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface MsActionSheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: ActionItem[];
  onClose: () => void;
}

export function MsActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: MsActionSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);

  // Present/dismiss natively when the parent toggles `visible`. Dismissals
  // initiated inside the sheet (backdrop tap / swipe down / X) report back
  // through onDismiss → onClose.
  useEffect(() => {
    if (visible) {
      tapLight();
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const renderBackdrop = useMemo(
    () => (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.65}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={['auto']}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: T.SURFACE }}
      handleIndicatorStyle={styles.handle}
      onDismiss={onClose}
    >
      <BottomSheetView
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 4, 20) }]}
      >
        {(title || subtitle) && (
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              {title && (
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
              )}
              {subtitle && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
            <MsPressable onPress={onClose} hitSlop={12}>
              <X size={18} color={T.TEXT_2} />
            </MsPressable>
          </View>
        )}

        <View style={styles.actionsWrap}>
          {actions.map((action, idx) => (
            <MsPressable
              key={action.label ?? idx}
              style={[styles.action, idx > 0 && styles.actionSpaced]}
              onPress={() => {
                action.destructive ? tapMedium() : tapLight();
                onClose();
                setTimeout(action.onPress, 80);
              }}
            >
              <Text
                style={[
                  styles.actionLabel,
                  action.destructive && styles.destructiveLabel,
                ]}
              >
                {action.label}
              </Text>
            </MsPressable>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: T.SURFACE,
    paddingTop: 4,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    marginTop: 2,
  },
  actionsWrap: {
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  action: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  actionSpaced: { marginTop: 2 },
  actionLabel: {
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  destructiveLabel: {
    color: '#EF4444',
  },
});
