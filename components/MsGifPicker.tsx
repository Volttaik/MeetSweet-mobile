/**
 * MsGifPicker — animated bottom-sheet GIF search.
 * Uses GIPHY public API (requires EXPO_PUBLIC_GIPHY_API_KEY).
 * Without the key, shows a clear inline message — no dead stub.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MagnifyingGlass, X } from 'phosphor-react-native';
import { T } from '@/constants/theme';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.52;
const API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY ?? '';
const COLUMN_W = (SCREEN_W - 4) / 2;

interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

// ─── Giphy fetch ──────────────────────────────────────────────────────────────

async function fetchGifs(query: string, offset = 0): Promise<GifItem[]> {
  if (!API_KEY) return [];
  const endpoint = query.trim()
    ? `https://api.giphy.com/v1/gifs/search?api_key=${API_KEY}&q=${encodeURIComponent(query)}&limit=20&offset=${offset}&rating=g`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${API_KEY}&limit=20&offset=${offset}&rating=g`;

  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`GIPHY error ${res.status}`);
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json.data ?? []).map((g: any) => ({
    id: g.id,
    title: g.title ?? '',
    url: g.images?.original?.url ?? '',
    previewUrl: g.images?.fixed_width_small?.url ?? g.images?.downsized?.url ?? '',
    width: Number(g.images?.fixed_width_small?.width ?? 100),
    height: Number(g.images?.fixed_width_small?.height ?? 100),
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
}

export function MsGifPicker({ visible, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
      if (API_KEY) loadGifs('');
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_H,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const loadGifs = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await fetchGifs(q);
      setGifs(results);
    } catch {
      setError('Could not load GIFs. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadGifs(text), 400);
  };

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />
      <Animated.View
        style={[
          s.sheet,
          { paddingBottom: Math.max(insets.bottom, 8) },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>GIF</Text>
          <TouchableOpacity onPress={handleClose} style={s.closeBtn} activeOpacity={0.7}>
            <X size={16} color={T.TEXT_2} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={s.searchBar}>
          <MagnifyingGlass size={15} color={T.TEXT_3} />
          <TextInput
            style={s.searchInput}
            placeholder="Search GIFs…"
            placeholderTextColor={T.TEXT_3}
            value={query}
            onChangeText={handleSearch}
            returnKeyType="search"
            selectionColor={T.ACCENT}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={13} color={T.TEXT_3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        {!API_KEY ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>🎬</Text>
            <Text style={s.emptyTitle}>GIF Search Unavailable</Text>
            <Text style={s.emptyMsg}>
              Add EXPO_PUBLIC_GIPHY_API_KEY to your environment to enable GIF search.
            </Text>
          </View>
        ) : loading && gifs.length === 0 ? (
          <View style={s.emptyWrap}>
            <ActivityIndicator color={T.ACCENT} />
          </View>
        ) : error ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyTitle}>{error}</Text>
            <TouchableOpacity onPress={() => loadGifs(query)} style={s.retryBtn} activeOpacity={0.7}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={gifs}
            keyExtractor={(g) => g.id}
            numColumns={2}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.grid}
            columnWrapperStyle={{ gap: 4 }}
            renderItem={({ item }) => {
              const aspectRatio = item.height > 0 && item.width > 0
                ? item.height / item.width
                : 0.75;
              const imgH = COLUMN_W * aspectRatio;
              return (
                <TouchableOpacity
                  onPress={() => onSelect(item.url || item.previewUrl)}
                  activeOpacity={0.8}
                  style={[s.gifCell, { height: imgH }]}
                >
                  <Image
                    source={{ uri: item.previewUrl || item.url }}
                    style={s.gifImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

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
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { fontSize: 16, fontFamily: T.FONT.bold, color: T.TEXT },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: T.BG,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 14,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    height: '100%',
  },
  grid: { paddingHorizontal: 2, paddingBottom: 16, gap: 4 },
  gifCell: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
  },
  gifImage: { width: '100%', height: '100%' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT, textAlign: 'center' },
  emptyMsg: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.ACCENT,
    marginTop: 4,
  },
  retryText: { fontSize: 13, fontFamily: T.FONT.semibold, color: '#fff' },
});
