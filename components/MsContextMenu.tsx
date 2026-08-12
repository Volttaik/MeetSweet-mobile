/**
 * MsContextMenu — spring-animated context menu that appears on long press.
 * Renders as a compact bottom sheet with grouped actions.
 * Usage: wrap any content with <MsContextMenuTrigger> or call imperatively.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/constants/theme';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export interface ContextMenuGroup {
  items: ContextMenuItem[];
}

interface MsContextMenuProps {
  visible: boolean;
  onClose: () => void;
  groups: ContextMenuGroup[];
  /** Optional title shown at top */
  title?: string;
  /** Optional subtitle */
  subtitle?: string;
}

export function MsContextMenu({ visible, onClose, groups, title, subtitle }: MsContextMenuProps) {
  const insets = useSafeAreaInsets();
  const slideAnim  = useRef(new Animated.Value(300)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 24, stiffness: 380, mass: 0.8, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, damping: 20, stiffness: 300, mass: 0.8, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 300, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 300, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(onClose);
  };

  const handleItemPress = (item: ContextMenuItem) => {
    handleClose();
    setTimeout(() => item.onPress(), 160);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 8 },
          { transform: [{ translateY: slideAnim }, { scale: scaleAnim }] },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        {(title || subtitle) && (
          <View style={styles.header}>
            {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
            {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {groups.map((group, gi) => (
            <View key={gi} style={[styles.group, gi < groups.length - 1 && styles.groupBorder]}>
              {group.items.map((item, ii) => (
                <TouchableOpacity
                  key={ii}
                  style={[
                    styles.item,
                    item.disabled && styles.itemDisabled,
                    ii < group.items.length - 1 && styles.itemBorder,
                  ]}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.65}
                  disabled={item.disabled}
                >
                  {item.icon ? (
                    <View style={styles.itemIcon}>{item.icon}</View>
                  ) : null}
                  <Text style={[styles.itemLabel, item.destructive && styles.itemDestructive, item.disabled && styles.itemLabelDisabled]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    ...{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
      elevation: 20,
    },
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginTop: 10,
    marginBottom: 10,
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    marginTop: 1,
  },
  group: {
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    overflow: 'hidden',
  },
  groupBorder: {},
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  itemIcon: {
    width: 20,
    alignItems: 'center',
  },
  itemLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    flex: 1,
  },
  itemDestructive: {
    color: T.ERROR,
  },
  itemDisabled: { opacity: 0.4 },
  itemLabelDisabled: { color: T.TEXT_3 },
});
