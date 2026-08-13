/**
 * MsEmojiPicker — glassmorphic animated emoji keyboard.
 * Category tabs use @expo/vector-icons (Ionicons).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from '@/constants/theme';
import { MsGlassSheet } from '@/components/MsGlassSheet';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.46;
const CELL_SIZE = Math.floor((Dimensions.get('window').width - 16) / 8);

// ─── Emoji data ────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORIES: { label: string; icon: IoniconName; emojis: string[] }[] = [
  {
    label: 'Recent',
    icon: 'time-outline',
    emojis: ['😀', '😂', '❤️', '🔥', '👍', '😍', '🙏', '💯', '😭', '🥰', '💀', '✨'],
  },
  {
    label: 'Smileys',
    icon: 'happy-outline',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇',
      '🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪',
      '😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒',
      '🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤧',
      '🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😈','👿',
      '💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖',
    ],
  },
  {
    label: 'Gestures',
    icon: 'hand-left-outline',
    emojis: [
      '👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉',
      '👆','🖕','👇','☝️','👋','🤚','🖐','✋','🖖','👏','🙌','🤲',
      '🤜','🤛','💪','🦾','✍️','💅','🫶','🤝','🙏','👐','🫵',
    ],
  },
  {
    label: 'Hearts',
    icon: 'heart-outline',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕',
      '💞','💓','💗','💖','💝','💘','💟','❤️‍🔥','❤️‍🩹','💌','💋',
    ],
  },
  {
    label: 'People',
    icon: 'people-outline',
    emojis: [
      '👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵',
      '🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷',
      '👮','🕵️','💂','🥷','👷','🤴','👸','👳','👲','🧕',
      '🤵','👰','🤰','🤱','👼','🎅','🤶','🦸','🦹','🧙',
    ],
  },
  {
    label: 'Animals',
    icon: 'paw-outline',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁',
      '🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆',
      '🦅','🦉','🦇','🐝','🦋','🐌','🐞','🐜','🐢','🐍','🦎',
      '🦖','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳',
      '🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦣','🐘','🦏','🦛',
    ],
  },
  {
    label: 'Food',
    icon: 'fast-food-outline',
    emojis: [
      '🍎','🍊','🍋','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥',
      '🥝','🍅','🥑','🍆','🥦','🌽','🌶️','🧄','🥔',
      '🍔','🍟','🌭','🍕','🌮','🌯','🍝','🍜','🍲','🍛','🍣',
      '🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥮','🧁','🍰','🎂',
      '🍭','🍬','🍫','🍿','🍩','🍪','☕','🍵','🧋','🍺','🍻',
      '🥂','🍷','🥃','🍸','🍹','🧃','🥤',
    ],
  },
  {
    label: 'Travel',
    icon: 'airplane-outline',
    emojis: [
      '🚀','🛸','🚁','✈️','🛩️','🚂','🚃','🚄','🚅','🚆','🚇','🚊',
      '🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘',
      '🚙','🛻','🚚','🛶','⛵','🚤','🛥️','🛳️','🚢','⚓',
      '🗺️','🧭','🏔️','⛰️','🌋','🏕️','🏖️','🏜️','🏝️','🏞️',
      '🏟️','🏛️','🏗️','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤',
    ],
  },
  {
    label: 'Objects',
    icon: 'cube-outline',
    emojis: [
      '💡','🔦','🕯️','💰','💵','💳','🪙','📈','📉','📊','📋','📌',
      '📍','📎','✂️','🗃️','🗄️','🗑️','🔒','🔓','🔑','🗝️',
      '🔨','🪓','⛏️','🛠️','🔧','🪛','🔩','⚙️','⚖️','🧲','🪜',
      '🧰','🧪','🧫','🧬','🔬','🔭','📡','💉','💊','🩹','🩺',
      '🎭','🎨','🖼️','🎪','🎠','🎡','🎢','🎯','🎲','🎮','🕹️',
    ],
  },
  {
    label: 'Symbols',
    icon: 'star-outline',
    emojis: [
      '✨','🌟','💫','⭐','🌠','🌌','🌙','☀️','⛅','🌈','⚡',
      '❄️','🌊','💧','🔥','🌪️','🌀','♾️','✅','❎','❓','❗',
      '💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤',
      '♠️','♥️','♦️','♣️','🎴','🀄','🎲','🏆','🥇','🥈','🥉','🏅',
      '#️⃣','*️⃣','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣',
      '🔞','📵','🚫','⛔','🚳','🚭','🚯','🚱','🚷','📳','📴',
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
  const [activeCat, setActiveCat] = useState(0);

  const currentEmojis = CATEGORIES[activeCat]?.emojis ?? [];

  return (
    <MsGlassSheet visible={visible} onClose={onClose} fixedHeight={SHEET_H}>
      {/* Category tabs — Ionicons */}
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
            <Ionicons
              name={item.icon}
              size={20}
              color={activeCat === index ? T.ACCENT : T.TEXT_2}
            />
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
    </MsGlassSheet>
  );
}

const s = StyleSheet.create({
  catList: { paddingHorizontal: 8, gap: 4, paddingBottom: 6 },
  catBtn: {
    width: 38, height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catBtnActive: { backgroundColor: T.ACCENT_LIGHT },
  emojiGrid: { paddingHorizontal: 8, paddingBottom: 16 },
  emojiCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 24 },
});
