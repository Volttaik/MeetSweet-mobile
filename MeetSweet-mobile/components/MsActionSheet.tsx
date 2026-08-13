/**
 * MsActionSheet — reusable native-feeling context menu bottom sheet.
 *
 * Physics upgrade:
 *   - Spring entry animation (slides up with bounce)
 *   - Scale press on each action item
 *   - Haptic feedback when opened and on action press
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
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
          Animated.timing(dragY, {
            toValue: 400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            dragY.setValue(0);
            onClose();
          });
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
    }
  }, [visible, translateY, dragY, overlayOpacity]);

  const combinedTranslateY = Animated.add(translateY, dragY);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlayWrap, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheetWrap,
          { transform: [{ translateY: combinedTranslateY }] },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 4, 20) }]}>
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
              <TouchableOpacity onPress={onClose} hitSlop={12}>
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
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    color: '#EF4444',
  },
});
