/**
 * MsStickerPicker — emoji sticker picker with packs.
 *
 * Since WhatsApp's SDK is Android-only native and unavailable in Expo managed
 * workflow, this implements a full-featured equivalent using emoji packs:
 *  - Pack tabs with icons
 *  - Recently used section
 *  - Search by keyword
 *  - Favorites (long-press to star)
 *  - Animated open/close
 *
 * Stickers are displayed as large emoji (120×120 effective area).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MagnifyingGlass, Star, X, Clock } from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';

// ─── Sticker packs ────────────────────────────────────────────────────────────

interface StickerPack {
  id:      string;
  name:    string;
  icon:    string;
  stickers: string[];
}

const STICKER_PACKS: StickerPack[] = [
  {
    id: 'faces',
    name: 'Faces',
    icon: '😊',
    stickers: ['😀','😂','🤣','😅','😆','😉','😊','😇','🥰','😍','🤩','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗','🫠','🤭','🫡','🤫','🤔','🫢','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','🫨','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸'],
  },
  {
    id: 'hearts',
    name: 'Hearts',
    icon: '❤️',
    stickers: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💌','💋','🫀','💑','👫','👬','👭','💏','🫶','🤝','👏','🙌','🫂','💐','🌹','🌷','🌸','💮','🏵️'],
  },
  {
    id: 'animals',
    name: 'Animals',
    icon: '🐶',
    stickers: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦅','🦆','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🪰','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️'],
  },
  {
    id: 'food',
    name: 'Food',
    icon: '🍕',
    stickers: ['🍕','🍔','🍟','🌭','🍿','🧂','🥓','🥚','🍳','🧇','🥞','🧈','🍞','🥐','🥨','🥯','🧀','🥗','🥙','🌮','🌯','🫔','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧆','🥜','🌰','🍫','🍬','🍭','🍮','🍯','🍰','🎂','🧁','🥧','🍩','🍪','🍦','🍧','🍨','🍡','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍵','🫖','☕','🧃','🥤','🧋'],
  },
  {
    id: 'activities',
    name: 'Fun',
    icon: '🎉',
    stickers: ['🎉','🎊','🎈','🎁','🎀','🎗️','🎟️','🎫','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎭','🎨','🖼️','🎰','🎲','🧩','🎮','🕹️','🎯','🎳','🏓','🏸','🥊','🥋','⛳','🎣','🤿','🎽','🛹','🛷','⛸️','🥅','⛷️','🏂','🪂','🏋️','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🚣','🧗','🚴','🏆','🎾','🏐','🏈','🏉','🎱','🏏','🏑','🏒','🥍','🏓','🏸'],
  },
  {
    id: 'symbols',
    name: 'Symbols',
    icon: '✨',
    stickers: ['✨','⭐','🌟','💫','⚡','🔥','❄️','🌈','☀️','🌙','⛅','🌊','💧','🌿','🍀','🌺','🌻','🌸','🌼','🌞','🎆','🎇','🧨','🌠','🌌','🎑','🎃','🎄','🎋','🎍','🎎','🎏','🎐','🧧','🎁','🎁','🪄','🔮','🧿','🪬','🔔','🔕','🎵','🎶','🎼','🎤','🎧','🎷','🎸','🎹','🎺','🎻','🥁','🪘'],
  },
];

const STORAGE_KEY_RECENT    = 'ms_sticker_recent';
const STORAGE_KEY_FAVORITES = 'ms_sticker_favorites';
const MAX_RECENT = 30;

interface Props {
  visible:  boolean;
  onSend:   (sticker: string) => void;
  onClose:  () => void;
}

const SCREEN_W = Dimensions.get('window').width;
const COLS     = 6;
const CELL     = Math.floor((SCREEN_W - 32) / COLS);

export function MsStickerPicker({ visible, onSend, onClose }: Props) {
  const slideAnim   = useRef(new Animated.Value(300)).current;
  const [activeTab, setActiveTab]   = useState<'recent' | 'favorites' | string>('recent');
  const [query, setQuery]           = useState('');
  const [recent,    setRecent]      = useState<string[]>([]);
  const [favorites, setFavorites]   = useState<string[]>([]);

  // Load saved data
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_RECENT),
      AsyncStorage.getItem(STORAGE_KEY_FAVORITES),
    ]).then(([r, f]) => {
      if (r) setRecent(JSON.parse(r));
      if (f) setFavorites(JSON.parse(f));
    }).catch(() => {});
  }, []);

  // Slide animation
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 280,
        mass: 1,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const addRecent = useCallback(async (sticker: string) => {
    setRecent((prev) => {
      const next = [sticker, ...prev.filter((s) => s !== sticker)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(async (sticker: string) => {
    setFavorites((prev) => {
      const next = prev.includes(sticker)
        ? prev.filter((s) => s !== sticker)
        : [sticker, ...prev];
      AsyncStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const handleSend = useCallback((sticker: string) => {
    addRecent(sticker);
    onSend(sticker);
  }, [addRecent, onSend]);

  const currentStickers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      // Search all packs
      return STICKER_PACKS.flatMap((p) =>
        p.stickers.filter((s) => p.name.toLowerCase().includes(q) || s.includes(q))
      );
    }
    if (activeTab === 'recent')    return recent;
    if (activeTab === 'favorites') return favorites;
    return STICKER_PACKS.find((p) => p.id === activeTab)?.stickers ?? [];
  }, [activeTab, query, recent, favorites]);

  if (!visible) return null;

  return (
    <Animated.View style={[s.container, { transform: [{ translateY: slideAnim }] }]}>
      {/* Search bar */}
      <View style={s.searchRow}>
        <View style={s.searchWrap}>
          <MagnifyingGlass size={15} color={T.TEXT_3} style={{ marginLeft: 10 }} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search stickers…"
            placeholderTextColor={T.TEXT_3}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <X size={14} color={T.TEXT_3} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {/* Recent */}
        <TouchableOpacity
          style={[s.tab, activeTab === 'recent' && s.tabActive]}
          onPress={() => { setQuery(''); setActiveTab('recent'); }}
          activeOpacity={0.7}
        >
          <Clock size={18} color={activeTab === 'recent' ? T.ACCENT : T.TEXT_3} />
        </TouchableOpacity>

        {/* Favorites */}
        <TouchableOpacity
          style={[s.tab, activeTab === 'favorites' && s.tabActive]}
          onPress={() => { setQuery(''); setActiveTab('favorites'); }}
          activeOpacity={0.7}
        >
          <Star size={18} color={activeTab === 'favorites' ? T.ACCENT : T.TEXT_3} weight={activeTab === 'favorites' ? 'fill' : 'regular'} />
        </TouchableOpacity>

        {/* Packs */}
        {STICKER_PACKS.map((pack) => (
          <TouchableOpacity
            key={pack.id}
            style={[s.tab, activeTab === pack.id && s.tabActive]}
            onPress={() => { setQuery(''); setActiveTab(pack.id); }}
            activeOpacity={0.7}
          >
            <Text style={s.tabEmoji}>{pack.icon}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Grid */}
      {currentStickers.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>
            {activeTab === 'recent'    ? 'No recent stickers' :
             activeTab === 'favorites' ? 'No favourites yet — long press to star' :
             'No stickers found'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={currentStickers}
          keyExtractor={(item, i) => `${item}_${i}`}
          numColumns={COLS}
          contentContainerStyle={s.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.cell}
              onPress={() => handleSend(item)}
              onLongPress={() => toggleFavorite(item)}
              delayLongPress={400}
              activeOpacity={0.7}
            >
              <Text style={s.sticker}>{item}</Text>
              {favorites.includes(item) && (
                <View style={s.starBadge}>
                  <Star size={8} color={T.ACCENT} weight="fill" />
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    height: 300,
    backgroundColor: T.SURFACE,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
  },
  searchRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.full,
    paddingRight: 10,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    height: 32,
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingLeft: 6,
  },
  tabBar: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  tabBarContent: {
    paddingHorizontal: 8,
    gap: 2,
  },
  tab: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: T.SURFACE_2,
  },
  tabEmoji: {
    fontSize: 20,
    lineHeight: 26,
  },
  grid: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sticker: {
    fontSize: 38,
    lineHeight: 48,
    includeFontPadding: false,
  },
  starBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
  },
});
