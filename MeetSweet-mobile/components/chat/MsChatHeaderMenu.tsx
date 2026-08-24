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
import React, { useCallback, useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
  // Dropdown is anchored top-right, so it animates with a downward slide + fade
  // (no scale, no transformOrigin) — a scale-from-center is what caused the menu
  // to visually "jump" from the wrong position on open. Runs as Reanimated
  // worklets on the UI thread (no JS-thread Animated orchestration).
  const translateAnim = useSharedValue(-10);
  const opacityAnim   = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateAnim.value = -10;
      opacityAnim.value = 0;
      opacityAnim.value = withTiming(1, { duration: 160 });
      translateAnim.value = withTiming(0, { duration: 200 });
    }
  }, [visible, translateAnim, opacityAnim]);

  // Animate out (worklet-driven), then close the modal and run the action.
  // `onClose` unmounts the menu; the action (open search / profile / picker)
  // runs after the animation so the two overlays never stack mid-transition.
  const dismiss = useCallback((fn: () => void) => {
    opacityAnim.value = withTiming(0, { duration: 120 });
    translateAnim.value = withTiming(-8, { duration: 120 });
    setTimeout(() => {
      onClose();
      fn();
    }, 120);
  }, [onClose, opacityAnim, translateAnim]);

  const menuStyle = useAnimatedStyle(() => ({
    opacity: opacityAnim.value,
    transform: [{ translateY: translateAnim.value }],
  }));

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
      label: 'Clear Chat',
      icon: <Broom size={18} color={T.DANGER} />,
      destructive: true,
      onPress: () => dismiss(onClear),
    },
    {
      key: 'delete',
      label: 'Delete Chat',
      icon: <Trash size={18} color={T.DANGER} />,
      destructive: true,
      onPress: () => dismiss(onDelete),
    },
  ] as const;

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        {/* Backdrop is a sibling of the menu — tapping it closes, but taps on the
            menu itself never fall through to the backdrop. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close menu"
          accessibilityRole="button"
        />
        <Reanimated.View style={[s.menu, menuStyle]}>
          {([...ITEMS] as any[]).map((item: any) => {
            if (item.divider) {
              return <View key={item.key} style={s.divider} />;
            }
            return (
              <MsPressable
                key={item.key}
                style={s.item}
                onPress={item.onPress}
              >
                <View style={s.itemIcon}>{item.icon}</View>
                <Text style={[s.itemLabel, item.destructive && s.itemLabelDestructive]}>
                  {item.label}
                </Text>
                <CaretRight size={14} color={T.TEXT_3} />
              </MsPressable>
            );
          })}
        </Reanimated.View>
      </View>
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
