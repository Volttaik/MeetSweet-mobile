/**
 * MsComposerPanel — Sticker & GIF panel that behaves exactly like the keyboard.
 *
 * Architecture
 * ────────────
 * • Rendered inside MsChatInputBar's root View, below the input row.
 * • Height animates from 0 → panelHeight on open, and back to 0 on close.
 * • Because it lives inside `renderInputToolbar`, the Chat list naturally
 *   shrinks when the panel is open — same effect as the keyboard rising.
 * • Stickers: emoji-based packs, no external dependency, works offline.
 * • GIFs: Tenor API v2 (EXPO_PUBLIC_TENOR_API_KEY); graceful no-key state.
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
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { T } from '@/constants/theme';
import { MagnifyingGlass, X } from 'phosphor-react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PanelTab = 'stickers' | 'gifs';

interface Props {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Target height (should match keyboard height) */
  panelHeight: number;
  /** Currently active tab */
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onStickerPress: (sticker: string) => void;
  onGifPress: (gifUrl: string, gifTitle: string) => void;
}

// ─── Sticker packs ───────────────────────────────────────────────────────────

interface StickerPack {
  id: string;
  name: string;
  icon: string;
  stickers: string[];
}

const STICKER_PACKS: StickerPack[] = [
  {
    id: 'expressions',
    name: 'Expressions',
    icon: '😊',
    stickers: [
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
    stickers: [
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
    stickers: [
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
    stickers: [
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
    stickers: [
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
    stickers: [
      '✈️','🚀','🛸','🚁','🛥️','⛵','🚢','🚂','🚆','🚌','🚎','🏎️',
      '🚓','🚑','🚒','🛻','🚐','🚚','🚛','🏍️','🛵','🚲','🛴','🛹',
      '🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🌅','🌄',
      '🌠','🎇','🎆','🌃','🌆','🌇','🌉','🌌','🌁','🗼','🗽','🗿',
    ],
  },
];

// ─── Tenor GIF API ────────────────────────────────────────────────────────────

const TENOR_KEY = (process.env.EXPO_PUBLIC_TENOR_API_KEY ?? '').trim();
const TENOR_BASE = 'https://tenor.googleapis.com/v2';
const GIF_LIMIT = 24;

interface TenorGif {
  id: string;
  title: string;
  url: string;       // tinygif
  fullUrl: string;   // gif
  width: number;
  height: number;
}

async function fetchTenorGifs(query: string, next?: string): Promise<{ gifs: TenorGif[]; next: string }> {
  if (!TENOR_KEY) return { gifs: [], next: '' };
  const endpoint = query.trim()
    ? `${TENOR_BASE}/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&client_key=meetsweet&limit=${GIF_LIMIT}&media_filter=tinygif,gif${next ? `&pos=${next}` : ''}`
    : `${TENOR_BASE}/featured?key=${TENOR_KEY}&client_key=meetsweet&limit=${GIF_LIMIT}&media_filter=tinygif,gif${next ? `&pos=${next}` : ''}`;

  const resp = await fetch(endpoint);
  if (!resp.ok) return { gifs: [], next: '' };
  const data = await resp.json();
  const gifs: TenorGif[] = (data.results ?? []).map((r: any) => ({
    id: r.id,
    title: r.title ?? '',
    url: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? '',
    fullUrl: r.media_formats?.gif?.url ?? r.media_formats?.tinygif?.url ?? '',
    width: r.media_formats?.tinygif?.dims?.[0] ?? 200,
    height: r.media_formats?.tinygif?.dims?.[1] ?? 200,
  }));
  return { gifs, next: data.next ?? '' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StickerItem = memo(function StickerItem({
  sticker,
  onPress,
}: {
  sticker: string;
  onPress: (s: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.78, useNativeDriver: true, damping: 14, stiffness: 400 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 300 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => onPress(sticker)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={ss.stickerCell}
      >
        <Text style={ss.stickerText}>{sticker}</Text>
      </Pressable>
    </Animated.View>
  );
});

const GifItem = memo(function GifItem({
  gif,
  colWidth,
  onPress,
}: {
  gif: TenorGif;
  colWidth: number;
  onPress: (gif: TenorGif) => void;
}) {
  const aspect = gif.height > 0 ? gif.width / gif.height : 1;
  const displayHeight = colWidth / aspect;

  return (
    <Pressable
      onPress={() => onPress(gif)}
      style={[ss.gifItem, { width: colWidth, height: Math.min(displayHeight, colWidth * 1.4) }]}
    >
      <Image
        source={{ uri: gif.url }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
    </Pressable>
  );
});

// ─── Sticker panel content ────────────────────────────────────────────────────

const StickerContent = memo(function StickerContent({
  onStickerPress,
}: {
  onStickerPress: (s: string) => void;
}) {
  const [activePack, setActivePack] = useState(0);

  const stickers = useMemo(
    () => STICKER_PACKS[activePack]?.stickers ?? [],
    [activePack],
  );

  const renderSticker = useCallback(
    ({ item }: { item: string }) => (
      <StickerItem sticker={item} onPress={onStickerPress} />
    ),
    [onStickerPress],
  );

  return (
    <View style={ss.fillContent}>
      {/* Pack tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={ss.packTabScroll}
        contentContainerStyle={ss.packTabContent}
      >
        {STICKER_PACKS.map((pack, i) => (
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

      {/* Sticker grid */}
      <FlatList
        data={stickers}
        renderItem={renderSticker}
        keyExtractor={(item, i) => `${item}-${i}`}
        numColumns={7}
        columnWrapperStyle={ss.stickerRow}
        contentContainerStyle={ss.stickerGrid}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      />
    </View>
  );
});

// ─── GIF panel content ────────────────────────────────────────────────────────

const GifContent = memo(function GifContent({
  colWidth,
  onGifPress,
}: {
  colWidth: number;
  onGifPress: (url: string, title: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPos, setNextPos] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Fetch on query change
  useEffect(() => {
    if (!TENOR_KEY) return;
    setLoading(true);
    setGifs([]);
    fetchTenorGifs(debouncedQ).then(({ gifs: g, next }) => {
      setGifs(g);
      setNextPos(next);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [debouncedQ]);

  const loadMore = useCallback(() => {
    if (!nextPos || loading || !TENOR_KEY) return;
    fetchTenorGifs(debouncedQ, nextPos).then(({ gifs: g, next }) => {
      setGifs((prev) => [...prev, ...g]);
      setNextPos(next);
    }).catch(() => {});
  }, [nextPos, loading, debouncedQ]);

  const renderGif = useCallback(
    ({ item }: { item: TenorGif }) => (
      <GifItem
        gif={item}
        colWidth={colWidth}
        onPress={(g) => onGifPress(g.fullUrl, g.title)}
      />
    ),
    [colWidth, onGifPress],
  );

  if (!TENOR_KEY) {
    return (
      <View style={ss.noKeyState}>
        <Text style={ss.noKeyTitle}>GIFs not configured</Text>
        <Text style={ss.noKeyBody}>
          Add{' '}
          <Text style={ss.noKeyCode}>EXPO_PUBLIC_TENOR_API_KEY</Text>
          {'\n'}to your environment to enable GIF search.
        </Text>
      </View>
    );
  }

  return (
    <View style={ss.fillContent}>
      {/* Search bar */}
      <View style={ss.gifSearchRow}>
        <MagnifyingGlass size={16} color={T.TEXT_3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search GIFs…"
          placeholderTextColor={T.TEXT_3}
          style={ss.gifSearchInput}
          selectionColor="#888"
          returnKeyType="search"
          keyboardAppearance="dark"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <X size={14} color={T.TEXT_3} />
          </TouchableOpacity>
        )}
      </View>

      {loading && gifs.length === 0 ? (
        <View style={ss.gifLoading}>
          <ActivityIndicator color={T.ACCENT} />
        </View>
      ) : (
        <FlatList
          data={gifs}
          renderItem={renderGif}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={ss.gifRow}
          contentContainerStyle={ss.gifGrid}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          ListFooterComponent={
            loading && gifs.length > 0
              ? <ActivityIndicator color={T.ACCENT} style={{ marginVertical: 12 }} />
              : null
          }
          ListEmptyComponent={
            !loading ? (
              <View style={ss.gifLoading}>
                <Text style={ss.noKeyBody}>No GIFs found</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export const MsComposerPanel = memo(function MsComposerPanel({
  isOpen,
  panelHeight,
  activeTab,
  onTabChange,
  onStickerPress,
  onGifPress,
}: Props) {
  const heightAnim = useRef(new Animated.Value(0)).current;
  const GIF_COL_WIDTH = useMemo(() => {
    // will be roughly half screen - padding
    return 160; // set dynamically via onLayout if needed
  }, []);

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: isOpen ? panelHeight : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isOpen, panelHeight]);

  const [measuredColWidth, setMeasuredColWidth] = useState(160);

  return (
    <Animated.View
      style={[ss.panel, { height: heightAnim }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setMeasuredColWidth(Math.floor((w - 24) / 2));
      }}
    >
      {/* Top tab bar */}
      <View style={ss.tabBar}>
        <TouchableOpacity
          style={[ss.tab, activeTab === 'stickers' && ss.tabActive]}
          onPress={() => onTabChange('stickers')}
        >
          <Text style={[ss.tabLabel, activeTab === 'stickers' && ss.tabLabelActive]}>
            🙂 Stickers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ss.tab, activeTab === 'gifs' && ss.tabActive]}
          onPress={() => onTabChange('gifs')}
        >
          <Text style={[ss.tabLabel, activeTab === 'gifs' && ss.tabLabelActive]}>
            GIF
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isOpen && activeTab === 'stickers' && (
        <StickerContent onStickerPress={onStickerPress} />
      )}
      {isOpen && activeTab === 'gifs' && (
        <GifContent colWidth={measuredColWidth} onGifPress={onGifPress} />
      )}
    </Animated.View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  panel: {
    backgroundColor: T.BG,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: T.SURFACE_2,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: T.SURFACE_2,
    paddingHorizontal: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: T.ACCENT,
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
  tabLabelActive: {
    color: T.ACCENT,
  },

  fillContent: { flex: 1 },

  // Pack tabs (sticker)
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
    backgroundColor: T.ACCENT_LIGHT,
  },
  packTabIcon: { fontSize: 20 },
  packTabName: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.ACCENT,
  },

  // Sticker grid
  stickerGrid: { padding: 8 },
  stickerRow: { justifyContent: 'space-around' },
  stickerCell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  stickerText: { fontSize: 30 },

  // GIF search
  gifSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginVertical: 8,
    backgroundColor: T.SURFACE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gifSearchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingVertical: 0,
  },
  gifLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  gifGrid: { paddingHorizontal: 8, paddingBottom: 8 },
  gifRow: { gap: 4, marginBottom: 4 },
  gifItem: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: T.SURFACE,
  },

  // No-key placeholder
  noKeyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  noKeyTitle: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
  },
  noKeyBody: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    lineHeight: 20,
  },
  noKeyCode: {
    fontFamily: T.FONT.medium,
    color: T.ACCENT,
  },
});
