/**
 * MsComposerPanel — Emoji, Sticker & GIF panel that behaves exactly like the keyboard.
 *
 * Architecture
 * ────────────
 * • Rendered inside MsChatInputBar's root View, below the input row.
 * • Height animates from 0 → panelHeight on open, and back to 0 on close.
 * • Because it lives inside `renderInputToolbar`, the Chat list naturally
 *   shrinks when the panel is open — same effect as the keyboard rising.
 *
 * Three tabs:
 * ── Emoji   : system-style emoji packs sent as text characters (offline, zero deps)
 * ── Stickers: OpenMoji image stickers (CC BY-SA 4.0) sent as image messages
 * ── GIFs    : Tenor API v2 (EXPO_PUBLIC_TENOR_API_KEY); graceful no-key state
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
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { T } from '@/constants/theme';
import { MagnifyingGlass, X } from 'phosphor-react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PanelTab = 'emoji' | 'stickers' | 'gifs';

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

// ─── OpenMoji image sticker packs (CC BY-SA 4.0) ─────────────────────────────
// Images served from official CDN — free for use with attribution.

const OPENMOJI_BASE = 'https://openmoji.org/data/color/72x72/';

interface StickerPack {
  id: string;
  name: string;
  icon: string;
  /** Unicode hex codepoints, e.g. "1F600" */
  codes: string[];
}

const IMAGE_STICKER_PACKS: StickerPack[] = [
  {
    id: 'vibes',
    name: 'Vibes',
    icon: '🙌',
    codes: [
      '1F60A','1F602','1F970','1F929','1F973','1F60E',
      '1F914','1F62D','1F631','1F92F','1F634','1F624',
      '1F976','1F975','1F4AA','1F918',
    ],
  },
  {
    id: 'love',
    name: 'Love',
    icon: '❤️',
    codes: [
      '2764','1F9E1','1F49B','1F49A','1F499','1F49C',
      '1F496','1F48C','1F48B','1F618','1FAF6','1F91D',
      '1F44F','1F64C','1F490','1F339',
    ],
  },
  {
    id: 'party',
    name: 'Party',
    icon: '🎉',
    codes: [
      '1F389','1F38A','1F381','1F382','1F942','1F37E',
      '2B50','1F31F','2728','1F4AB','1F525','1F3C6',
      '1F947','1F680','1F4AF','1F44D',
    ],
  },
  {
    id: 'animals',
    name: 'Animals',
    icon: '🐶',
    codes: [
      '1F436','1F431','1F43B','1F43C','1F428','1F42F',
      '1F981','1F438','1F430','1F98A','1F427','1F425',
      '1F98B','1F433','1F42C','1F99C',
    ],
  },
];

function stickerUrl(code: string): string {
  return `${OPENMOJI_BASE}${code}.png`;
}

// ─── Tenor GIF API ────────────────────────────────────────────────────────────

const TENOR_KEY  = (process.env.EXPO_PUBLIC_TENOR_API_KEY ?? '').trim();
const TENOR_BASE = 'https://tenor.googleapis.com/v2';
const GIF_LIMIT  = 24;

interface TenorGif {
  id: string;
  title: string;
  url: string;
  fullUrl: string;
  width: number;
  height: number;
}

async function fetchTenorGifs(
  query: string,
  next?: string,
): Promise<{ gifs: TenorGif[]; next: string }> {
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

// ─── StickerImageItem ─────────────────────────────────────────────────────────

const StickerImageItem = memo(function StickerImageItem({
  code,
  size,
  onPress,
}: {
  code: string;
  size: number;
  onPress: (url: string) => void;
}) {
  const { scale, pressIn, pressOut } = usePressScale(0.75, { damping: 12, stiffness: 420 });
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(true);
  const uri = stickerUrl(code);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => !hasError && onPress(uri)}
        onPressIn={!hasError ? pressIn : undefined}
        onPressOut={!hasError ? pressOut : undefined}
        style={[ss.stickerImgCell, { width: size, height: size }]}
      >
        {hasError ? (
          // Fallback: show a soft placeholder tile
          <View
            style={[
              ss.stickerFallback,
              { width: size - 12, height: size - 12 },
            ]}
          >
            <Text style={ss.stickerFallbackText}>✦</Text>
          </View>
        ) : (
          <>
            {loading && (
              <ActivityIndicator
                size="small"
                color={T.ACCENT}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Image
              source={{ uri }}
              style={{ width: size - 12, height: size - 12, opacity: loading ? 0 : 1 }}
              contentFit="contain"
              transition={120}
              cachePolicy="memory-disk"
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setHasError(true); }}
            />
          </>
        )}
      </Pressable>
    </Animated.View>
  );
});

// ─── GifItem ─────────────────────────────────────────────────────────────────

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
  const displayH = Math.min(colWidth / aspect, colWidth * 1.4);
  const { scale, pressIn, pressOut } = usePressScale(0.96, { damping: 16, stiffness: 380 });

  return (
    <Animated.View style={[ss.gifItem, { width: colWidth, height: displayH }, { transform: [{ scale }] }]}>
      <Pressable
        onPress={() => onPress(gif)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={StyleSheet.absoluteFill}
      >
        <Image
          source={{ uri: gif.url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      </Pressable>
    </Animated.View>
  );
});

// ─── EmojiContent ─────────────────────────────────────────────────────────────

const EmojiContent = memo(function EmojiContent({
  onEmojiPress,
}: {
  onEmojiPress: (s: string) => void;
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

// ─── StickerContent (image stickers) ─────────────────────────────────────────

const StickerContent = memo(function StickerContent({
  onStickerImagePress,
}: {
  onStickerImagePress: (url: string) => void;
}) {
  const [activePack, setActivePack] = useState(0);
  const codes = useMemo(() => IMAGE_STICKER_PACKS[activePack]?.codes ?? [], [activePack]);
  const STICKER_SIZE = 70;

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <StickerImageItem code={item} size={STICKER_SIZE} onPress={onStickerImagePress} />
    ),
    [onStickerImagePress],
  );

  return (
    <View style={ss.fillContent}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={ss.packTabScroll}
        contentContainerStyle={ss.packTabContent}
      >
        {IMAGE_STICKER_PACKS.map((pack, i) => (
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
        data={codes}
        renderItem={renderItem}
        keyExtractor={(item) => item}
        numColumns={4}
        columnWrapperStyle={ss.stickerRow}
        contentContainerStyle={ss.stickerGrid}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      />
      <Text style={ss.attribution}>Stickers by OpenMoji — CC BY-SA 4.0</Text>
    </View>
  );
});

// ─── GifContent ───────────────────────────────────────────────────────────────

const GifContent = memo(function GifContent({
  colWidth,
  onGifPress,
}: {
  colWidth: number;
  onGifPress: (url: string, title: string) => void;
}) {
  const [query,     setQuery]     = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [gifs,      setGifs]      = useState<TenorGif[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [nextPos,   setNextPos]   = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query), 380);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    if (!TENOR_KEY) return;
    setLoading(true);
    setGifs([]);
    fetchTenorGifs(debouncedQ)
      .then(({ gifs: g, next }) => { setGifs(g); setNextPos(next); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedQ]);

  const loadMore = useCallback(() => {
    if (!nextPos || loading || !TENOR_KEY) return;
    fetchTenorGifs(debouncedQ, nextPos)
      .then(({ gifs: g, next }) => { setGifs((prev) => [...prev, ...g]); setNextPos(next); })
      .catch(() => {});
  }, [nextPos, loading, debouncedQ]);

  const renderGif = useCallback(
    ({ item }: { item: TenorGif }) => (
      <GifItem gif={item} colWidth={colWidth} onPress={(g) => onGifPress(g.fullUrl, g.title)} />
    ),
    [colWidth, onGifPress],
  );

  if (!TENOR_KEY) {
    return (
      <View style={ss.noKeyState}>
        <Text style={ss.noKeyTitle}>GIFs not configured</Text>
        <Text style={ss.noKeyBody}>
          Add <Text style={ss.noKeyCode}>EXPO_PUBLIC_TENOR_API_KEY</Text>
          {'\n'}to your environment to enable GIF search.
        </Text>
      </View>
    );
  }

  return (
    <View style={ss.fillContent}>
      {/* Search pill */}
      <View style={ss.gifSearchRow}>
        <MagnifyingGlass size={15} color={T.TEXT_3} />
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
            <X size={13} color={T.TEXT_3} />
          </TouchableOpacity>
        )}
      </View>

      {loading && gifs.length === 0 ? (
        <View style={ss.gifLoading}>
          <ActivityIndicator color={T.ACCENT} size="small" />
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

const PANEL_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

export const MsComposerPanel = memo(function MsComposerPanel({
  isOpen,
  panelHeight,
  activeTab,
  onTabChange,
  onStickerPress,
  onGifPress,
}: Props) {
  const heightAnim = useRef(new Animated.Value(0)).current;
  const [measuredColWidth, setMeasuredColWidth] = useState(160);

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: isOpen ? panelHeight : 0,
      duration: 260,
      easing: PANEL_EASING,
      useNativeDriver: false,
    }).start();
  }, [isOpen, panelHeight]);

  // Image stickers sent via onGifPress (they're image URLs)
  const handleStickerImagePress = useCallback(
    (url: string) => onGifPress(url, 'sticker'),
    [onGifPress],
  );

  const tabs: { id: PanelTab; label: string; icon: string }[] = [
    { id: 'emoji',    label: 'Emoji',    icon: '😊' },
    { id: 'stickers', label: 'Stickers', icon: '🎭' },
    { id: 'gifs',     label: 'GIF',      icon: '🎬' },
  ];

  return (
    <Animated.View
      style={[ss.panel, { height: heightAnim }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setMeasuredColWidth(Math.floor((w - 20) / 2));
      }}
    >
      {/* Tab bar — pill style, no borders */}
      <View style={ss.tabBar}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[ss.tab, active && ss.tabActive]}
              onPress={() => onTabChange(tab.id)}
              activeOpacity={0.75}
            >
              <Text style={ss.tabIcon}>{tab.icon}</Text>
              <Text style={[ss.tabLabel, active && ss.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content — only rendered when open */}
      {isOpen && activeTab === 'emoji' && (
        <EmojiContent onEmojiPress={onStickerPress} />
      )}
      {isOpen && activeTab === 'stickers' && (
        <StickerContent onStickerImagePress={handleStickerImagePress} />
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
    // Shadow replaces the top border
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },

  // Tab bar — no border, spacing-based separation
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 6,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: T.SURFACE,
  },
  tabActive: {
    backgroundColor: T.ACCENT_LIGHT ?? `${T.ACCENT}22`,
  },
  tabIcon: {
    fontSize: 14,
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
  tabLabelActive: {
    color: T.ACCENT,
  },

  fillContent: { flex: 1 },

  // Pack tabs (emoji / sticker)
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

  // Image sticker grid
  stickerGrid: { padding: 10 },
  stickerRow: { gap: 6, justifyContent: 'space-around' },
  stickerImgCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: T.SURFACE,
    marginBottom: 6,
  },
  stickerFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: T.SURFACE_2,
  },
  stickerFallbackText: {
    fontSize: 18,
    color: T.TEXT_3,
    opacity: 0.4,
  },

  attribution: {
    fontSize: 9,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    paddingBottom: 6,
    opacity: 0.5,
  },

  // GIF search
  gifSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS?.pill ?? 24,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
  },
  gifSearchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  gifLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  gifGrid: { paddingHorizontal: 6, paddingBottom: 8 },
  gifRow: { gap: 5, marginBottom: 5 },
  gifItem: {
    borderRadius: 10,
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
