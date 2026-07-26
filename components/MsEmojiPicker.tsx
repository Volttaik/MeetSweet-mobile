/**
 * MsEmojiPicker — animated bottom-sheet emoji keyboard.
 * Categorised emoji grid, slides up from bottom, pushes input upward.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.45;

// ─── Emoji data ────────────────────────────────────────────────────────────────

const CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: 'Recent',
    icon: '🕐',
    emojis: ['😀', '😂', '❤️', '🔥', '👍', '😍', '🙏', '💯'],
  },
  {
    label: 'Smileys',
    icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇',
      '🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪',
      '😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒',
      '🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤧',
      '🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐',
    ],
  },
  {
    label: 'Gestures',
    icon: '👍',
    emojis: [
      '👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉',
      '👆','🖕','👇','☝️','👋','🤚','🖐','✋','🖖','👏','🙌','🤲',
      '🤜','🤛','💪','🦾','🖐️','✍️','💅','🫶','🫱','🫲','🤝','🙏',
      '👐','🫵','🤜','🤛','💪','🦵','🦶',
    ],
  },
  {
    label: 'Hearts',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕',
      '💞','💓','💗','💖','💝','💘','💟','❤️‍🔥','❤️‍🩹','💌',
    ],
  },
  {
    label: 'People',
    icon: '👤',
    emojis: [
      '👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵',
      '🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷',
      '👮','🕵️','💂','🥷','👷','🫅','🤴','👸','👳','👲','🧕',
      '🤵','👰','🤰','🫃','🫄','🤱','👼','🎅','🤶','🦸','🦹','🧙',
    ],
  },
  {
    label: 'Animals',
    icon: '🐶',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁',
      '🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅',
      '🦉','🦇','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🐢',
      '🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟',
      '🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘',
    ],
  },
  {
    label: 'Food',
    icon: '🍕',
    emojis: [
      '🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥',
      '🥝','🍅','🫒','🥑','🍆','🥦','🥬','🌽','🌶️','🧄','🧅','🥔',
      '🍠','🥐','🥯','🍞','🥖','🧀','🥚','🍳','🧈','🥞','🧇',
      '🍔','🍟','🌭','🍕','🫔','🌮','🌯','🫙','🥫','🍝','🍜','🍲',
      '🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢',
      '🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜',
      '🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🧃','☕','🍵','🧋',
    ],
  },
  {
    label: 'Travel',
    icon: '✈️',
    emojis: [
      '🚀','🛸','🚁','✈️','🛩️','🛫','🛬','🪂','💺','🚂','🚃','🚄',
      '🚅','🚆','🚇','🚈','🚉','🚊','🚞','🚝','🚋','🚌','🚍','🚎',
      '🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚',
      '🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','🛟','⚓','⛽','🚧','🚦',
      '🗺️','🧭','🏔️','⛰️','🌋','🗾','🏕️','🏖️','🏜️','🏝️','🏞️',
      '🏟️','🏛️','🏗️','🧱','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤',
    ],
  },
  {
    label: 'Objects',
    icon: '💡',
    emojis: [
      '💡','🔦','🕯️','🪔','🧯','🛢️','💰','💵','💴','💶','💷','💸',
      '💳','🪙','💹','📈','📉','📊','📋','📌','📍','📎','🖇️','📏',
      '📐','✂️','🗃️','🗄️','🗑️','🔒','🔓','🔏','🔐','🔑','🗝️',
      '🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🛡️','🪚','🔧','🪛',
      '🔩','⚙️','🗜️','⚖️','🪝','🧲','🪜','🧰','🪣','🧪','🧫','🧬',
      '🔬','🔭','📡','💈','🛎️','🧲','💉','🩸','💊','🩹','🩺','🚪',
    ],
  },
  {
    label: 'Symbols',
    icon: '✨',
    emojis: [
      '✨','🌟','💫','⭐','🌠','🌌','🌙','☀️','⛅','🌤️','🌈','⚡',
      '❄️','🌊','💧','🔥','🌪️','🌫️','🌀','🌈','♾️','✅','❎','🔴',
      '🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','❤️','💛','💚','💙',
      '💜','🖤','🤍','🤎','♠️','♥️','♦️','♣️','♟️','🃏','🎴','🀄',
      '🎲','🎰','🧩','🎮','🕹️','🎯','🎱','🏆','🥇','🥈','🥉','🏅',
      '#️⃣','*️⃣','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣',
    ],
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onEmojiSelect: (emoji: string) => void;
}

export function MsEmojiPicker({ visible, onClose, onEmojiSelect }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;
  const [activeCat, setActiveCat] = useState(0);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_H,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const currentEmojis = CATEGORIES[activeCat]?.emojis ?? [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[
          s.sheet,
          { paddingBottom: Math.max(insets.bottom, 8) },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={s.handle} />

        {/* Category tabs */}
        <FlatList
          data={CATEGORIES}
          keyExtractor={(_, i) => String(i)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catList}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[s.catBtn, activeCat === index && s.catBtnActive]}
              onPress={() => setActiveCat(index)}
              activeOpacity={0.7}
            >
              <Text style={s.catIcon}>{item.icon}</Text>
            </TouchableOpacity>
          )}
        />

        {/* Emoji grid */}
        <FlatList
          data={currentEmojis}
          keyExtractor={(e) => e}
          numColumns={8}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.emojiGrid}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.emojiCell}
              onPress={() => onEmojiSelect(item)}
              activeOpacity={0.7}
            >
              <Text style={s.emojiText}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </Animated.View>
    </Modal>
  );
}

const CELL_SIZE = Math.floor((Dimensions.get('window').width - 16) / 8);

const s = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_H,
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  catList: { paddingHorizontal: 8, gap: 4, paddingBottom: 6 },
  catBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catBtnActive: { backgroundColor: T.ACCENT_LIGHT },
  catIcon: { fontSize: 20 },
  emojiGrid: { paddingHorizontal: 8, paddingBottom: 16 },
  emojiCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 24 },
});
