/**
 * MsActionSheet — reusable native-feeling context menu bottom sheet.
 *
 * Physics upgrade:
 *   - Spring entry animation (slides up with bounce)
 *   - Scale press on each action item
 *   - Haptic feedback when opened and on action press
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { GradientTopFade } from '@/components/GradientTopFade';
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
  const translateY = useRef(new Animated.Value(300)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  // The Modal stays mounted while the exit animation runs so closing is a
  // smooth slide/fade — never an instant vanish ("no sheet remaining mounted
  // invisibly" — it unmounts when the exit finishes).
  const [mounted, setMounted] = useState(visible);

  const finishClose = useCallback(() => {
    translateY.setValue(300);
    dragY.setValue(0);
    overlayOpacity.setValue(0);
    setMounted(false);
    onClose();
  }, [onClose, translateY, dragY, overlayOpacity]);

  // Animated exit shared by backdrop taps, the X button, Android back and
  // action presses — the sheet slides down + fades, then unmounts.
  const requestClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 420,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(finishClose);
  }, [translateY, overlayOpacity, finishClose]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          dragY.setValue(g.dy * 0.55);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.8) {
          Animated.parallel([
            Animated.timing(dragY, {
              toValue: 420,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(finishClose);
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 280,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      setMounted(true);
      tapLight();
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 300,
          mass: 1,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(300);
      dragY.setValue(0);
      overlayOpacity.setValue(0);
      setMounted(false);
    }
  }, [visible, translateY, dragY, overlayOpacity]);

  const combinedTranslateY = Animated.add(translateY, dragY);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlayWrap, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheetWrap,
          { transform: [{ translateY: combinedTranslateY }] },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 4, 20) }]}>
          <GradientTopFade height={56} radius={22} />
          <View style={styles.handle} />

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
              <TouchableOpacity onPress={requestClose} hitSlop={12}>
                <X size={18} color={T.TEXT_2} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.actionsWrap}>
            {actions.map((action, idx) => (
              <TouchableOpacity
                key={action.label ?? idx}
                style={[styles.action, idx > 0 && styles.actionSpaced]}
                activeOpacity={0.55}
                onPress={() => {
                  action.destructive ? tapMedium() : tapLight();
                  requestClose();
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
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center',
    marginBottom: 16,
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
    color: T.ERROR,
  },
});
