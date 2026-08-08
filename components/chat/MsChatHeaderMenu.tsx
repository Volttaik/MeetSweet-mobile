/**
 * MsChatHeaderMenu — dropdown menu anchored to the header info button.
 *
 * Options:
 *  - Chat Background (opens bg picker)
 *  - Search Chat
 *  - View Profile
 *  - Block / Unblock User
 *  - Clear Chat
 *  - Delete Chat
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Image as ImageIcon,
  MagnifyingGlass,
  User,
  UserMinus,
  Trash,
  Broom,
  CaretRight,
  BellSlash,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';

export interface ChatMenuAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible:      boolean;
  onClose:      () => void;
  isBlocked:    boolean;
  isMuted:      boolean;
  otherName:    string;
  onBackground: () => void;
  onSearch:     () => void;
  onProfile:    () => void;
  onMute:       () => void;
  onBlock:      () => void;
  onClear:      () => void;
  onDelete:     () => void;
}

export function MsChatHeaderMenu({
  visible,
  onClose,
  isBlocked,
  isMuted,
  otherName,
  onBackground,
  onSearch,
  onProfile,
  onMute,
  onBlock,
  onClear,
  onDelete,
}: Props) {
  const scaleAnim   = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.88);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(scaleAnim,   { toValue: 1, duration: 200, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const dismiss = (fn: () => void) => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 130, useNativeDriver: true }),
      Animated.timing(scaleAnim,   { toValue: 0.92, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      onClose();
      fn();
    });
  };

  const ITEMS = [
    {
      key: 'bg',
      label: 'Chat Background',
      icon: <ImageIcon size={18} color={T.TEXT_2} />,
      onPress: () => dismiss(onBackground),
    },
    {
      key: 'search',
      label: 'Search Chat',
      icon: <MagnifyingGlass size={18} color={T.TEXT_2} />,
      onPress: () => dismiss(onSearch),
    },
    {
      key: 'profile',
      label: 'View Profile',
      icon: <User size={18} color={T.TEXT_2} />,
      onPress: () => dismiss(onProfile),
    },
    {
      key: 'mute',
      label: isMuted ? `Unmute ${otherName}` : `Mute ${otherName}`,
      icon: <BellSlash size={18} color={T.TEXT_2} />,
      onPress: () => dismiss(onMute),
    },
    {
      key: 'divider1',
      divider: true,
    },
    {
      key: 'block',
      label: isBlocked ? `Unblock ${otherName}` : `Block ${otherName}`,
      icon: <UserMinus size={18} color={isBlocked ? T.TEXT_2 : T.DANGER} />,
      destructive: !isBlocked,
      onPress: () => dismiss(onBlock),
    },
    {
      key: 'clear',
      label: 'Chat',
      icon: <Broom size={18} color={T.DANGER} />,
      destructive: true,
      onPress: () => dismiss(onClear),
    },
    {
      key: 'delete',
      label: 'Chat',
      icon: <Trash size={18} color={T.DANGER} />,
      destructive: true,
      onPress: () => dismiss(onDelete),
    },
  ] as const;

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Animated.View
          style={[
            s.menu,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {([...ITEMS] as any[]).map((item: any) => {
            if (item.divider) {
              return <View key={item.key} style={s.divider} />;
            }
            return (
              <TouchableOpacity
                key={item.key}
                style={s.item}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={s.itemIcon}>{item.icon}</View>
                <Text style={[s.itemLabel, item.destructive && s.itemLabelDestructive]}>
                  {item.label}
                </Text>
                <CaretRight size={14} color={T.TEXT_3} />
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'flex-end',
    paddingTop: 52,
    paddingRight: 10,
  },
  menu: {
    width: 240,
    backgroundColor: T.SURFACE,
    borderRadius: 16,
    overflow: 'hidden',
    transformOrigin: 'top right',
    ...T.SHADOWS.hard,
  },
  divider: {
    height: 1,
    backgroundColor: T.BORDER,
    marginHorizontal: 14,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemIcon: {
    width: 22,
    alignItems: 'center',
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  itemLabelDestructive: {
    color: T.DANGER,
  },
});