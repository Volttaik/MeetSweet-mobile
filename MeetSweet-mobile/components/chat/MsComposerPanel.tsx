/**
 * MsComposerPanel — Emoji panel that behaves exactly like the keyboard.
 *
 * Architecture
 * ────────────
 * • Rendered inside MsChatInputBar's root View, below the input row.
 * • Height animates from 0 → panelHeight on open, and back to 0 on close.
 * • Because it lives inside `renderInputToolbar`, the Chat list naturally
 *   shrinks when the panel is open — same effect as the keyboard rising.
 *
 * One tab:
 * ── Emoji : system-style emoji packs sent as text characters (offline, zero deps)
 *
 * No borders. Separation via shadows, elevation, and spacing.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { T } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PanelTab = 'emoji';

interface Props {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Target height (should match keyboard height) */
  panelHeight: number;
  /** Currently active tab (always 'emoji') */
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  /** Called when user taps an emoji character */
  onEmojiPress: (emoji: string) => void;
}

// ─── Emoji packs (system emoji, sent as text) ────────────────────────────────

interface EmojiPack {
  id: string;
  name: string;
  icon: string;
  items: string[];
}

const EMOJI_PACKS: EmojiPack[] = [
  {
    id: 'expressions',
    name: 'Expressions',
    icon: '😊',
    items: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊',
      '😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛',
      '😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏',
      '😒','🙄','😬','🤥','😔','😪','🤤','😴','🥸','😎','🤓','🧐',
    ],
  },
  {
    id: 'animals',
    name: 'Animals',
    icon: '🐶',
    items: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮',
      '🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺',
      '🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️',
      '🐢','🦎','🐍','🦕','🦖','🐙','🦑','🦐','🦀','🐡','🐠','🐟',
    ],
  },
  {
    id: 'food',
    name: 'Food',
    icon: '🍕',
    items: [
      '🍕','🍔','🌮','🌯','🥗','🍣','🍱','🍜','🍝','🍛','🍚','🍙',
      '🍦','🍩','🍪','🎂','🍰','🧁','🍫','🍬','🍭','🍮','🍯','🍧',
      '🥤','🧃','☕','🍵','🧋','🍺','🍻','🥂','🍷','🍸','🍹','🧉',
      '🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥭','🍍','🥝','🥑','🍆',
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts',
    icon: '❤️',
    items: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕',
      '💞','💓','💗','💖','💝','💘','💟','❤️‍🔥','❤️‍🩹','💌','💋','😍',
      '🥰','😘','🫀','🩷','🩵','🩶','🌹','🌷','💐','✨','💫','⭐',
      '🌟','💥','❄️','🎀','🎁','🎊','🥳','🎈','🫶','💏','👫','👨‍❤️‍👨',
    ],
  },
  {
    id: 'activities',
    name: 'Activities',
    icon: '⚽',
    items: [
      '⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','⛸️',
      '🎿','🛷','🏋️','🤸','⛹️','🏌️','🏇','🤺','🥋','🥅','⛳','🎣',
      '🤿','🎽','🎯','🎳','🎮','🕹️','🎲','🧩','🎨','🎭','🎪','🎬',
      '🎤','🎸','🎹','🥁','🎷','🎺','🎻','🪕','🎵','🎶','🎼','🎧',
    ],
  },
  {
    id: 'travel',
    name: 'Travel',
    icon: '✈️',
    items: [
      '✈️','🚀','🛸','🚁','🛥️','⛵','🚢','🚂','🚆','🚌','🚎','🏎️',
      '🚓','🚑','🚒','🛻','🚐','🚚','🚛','🏍️','🛵','🚲','🛴','🛹',
      '🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🌅','🌄',
      '🌠','🎇','🎆','🌃','🌆','🌇','🌉','🌌','🌁','🗼','🗽','🗿',
    ],
  },
];

// ─── Shared animated press helper ────────────────────────────────────────────

function usePressScale(
  toValue = 0.82,
  config = { damping: 14, stiffness: 380 },
) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue,   useNativeDriver: true, ...config }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 280 }).start();
  return { scale, pressIn, pressOut };
}

// ─── EmojiItem ────────────────────────────────────────────────────────────────

const EmojiItem = memo(function EmojiItem({
  emoji,
  onPress,
}: {
  emoji: string;
  onPress: (e: string) => void;
}) {
  const { scale, pressIn, pressOut } = usePressScale(0.78, { damping: 14, stiffness: 400 });
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => onPress(emoji)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={ss.emojiCell}
      >
        <Text style={ss.emojiText}>{emoji}</Text>
      </Pressable>
    </Animated.View>
  );
});

// ─── EmojiContent ─────────────────────────────────────────────────────────────

const EmojiContent = memo(function EmojiContent({
  onEmojiPress,
}: {
  onEmojiPress: (emoji: string) => void;
}) {
  const [activePack, setActivePack] = useState(0);
  const items = useMemo(() => EMOJI_PACKS[activePack]?.items ?? [], [activePack]);
  const renderItem = useCallback(
    ({ item }: { item: string }) => <EmojiItem emoji={item} onPress={onEmojiPress} />,
    [onEmojiPress],
  );

  return (
    <View style={ss.fillContent}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={ss.packTabScroll}
        contentContainerStyle={ss.packTabContent}
      >
        {EMOJI_PACKS.map((pack, i) => (
          <TouchableOpacity
            key={pack.id}
            onPress={() => setActivePack(i)}
            style={[ss.packTab, activePack === i && ss.packTabActive]}
          >
            <Text style={ss.packTabIcon}>{pack.icon}</Text>
            {activePack === i && <Text style={ss.packTabName}>{pack.name}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item, i) => `${item}-${i}`}
        numColumns={7}
        columnWrapperStyle={ss.emojiRow}
        contentContainerStyle={ss.emojiGrid}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      />
    </View>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

const PANEL_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

export const MsComposerPanel = memo(function MsComposerPanel({
  isOpen,
  panelHeight,
  onEmojiPress,
}: Props) {
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: isOpen ? panelHeight : 0,
      duration: 260,
      easing: PANEL_EASING,
      useNativeDriver: false,
    }).start();
  }, [isOpen, panelHeight]);

  return (
    <Animated.View style={[ss.panel, { height: heightAnim }]}>
      {isOpen && <EmojiContent onEmojiPress={onEmojiPress} />}
    </Animated.View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  panel: {
    backgroundColor: T.BG,
    overflow: 'hidden',
    ...require('react-native').Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },

  fillContent: { flex: 1 },

  // Pack tabs (emoji categories)
  packTabScroll: {
    flexShrink: 0,
    maxHeight: 48,
    backgroundColor: T.SURFACE,
  },
  packTabContent: {
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  packTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  packTabActive: {
    backgroundColor: T.ACCENT_LIGHT ?? `${T.ACCENT}22`,
  },
  packTabIcon: { fontSize: 20 },
  packTabName: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.ACCENT,
  },

  // Emoji grid
  emojiGrid: { padding: 8 },
  emojiRow: { justifyContent: 'space-around' },
  emojiCell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  emojiText: { fontSize: 30 },
});
