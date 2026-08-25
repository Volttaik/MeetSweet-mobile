/**
 * MsSearchModal — full-screen search modal for the Home feed.
 * Compact design: shimmer loading states, trending chips, result tabs.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MagnifyingGlass, X, ClockCounterClockwise, TrendUp, Hash } from 'phosphor-react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { getFeed, type Post } from '@/services/posts';
import { getAlbums, type AlbumCardData } from '@/services/albums';
import { getCreators } from '@/services/creators';

const RECENT_KEY = '@ms_recent_searches';

async function loadRecent(): Promise<string[]> {
  try {
    const v = await AsyncStorage.getItem(RECENT_KEY);
    return v ? (JSON.parse(v) as string[]) : [];
  } catch {
    return [];
  }
}

async function pushRecent(q: string): Promise<void> {
  try {
    const existing = await loadRecent();
    const next = [q, ...existing.filter((s) => s !== q)].slice(0, 8);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

async function clearRecent(): Promise<void> {
  await AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
}

async function removeRecent(q: string): Promise<void> {
  try {
    const existing = await loadRecent();
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(existing.filter((s) => s !== q)));
  } catch {}
}

// ─── Shimmer ─────────────────────────────────────────────────────────────────

function ShimmerRow() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.14] });

  return (
    <View style={shimStyles.row}>
      <Animated.View style={[shimStyles.avatar, { opacity }]} />
      <View style={shimStyles.lines}>
        <Animated.View style={[shimStyles.line, { width: '60%', opacity }]} />
        <Animated.View style={[shimStyles.line, { width: '35%', opacity }]} />
      </View>
    </View>
  );
}

const shimStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.TEXT },
  lines: { flex: 1, gap: 5 },
  line: { height: 9, borderRadius: 4, backgroundColor: T.TEXT },
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResultItem {
  id: string;
  type: 'post' | 'album' | 'creator';
  title: string;
  subtitle: string;
  avatarUri: string | null;
  initials: string;
}

interface MsSearchModalProps {
  visible: boolean;
  onClose: () => void;
}

const TRENDING_TOPICS = [
  '#photography', '#music', '#fitness', '#art', '#travel', '#cooking',
  '#fashion', '#gaming', '#tech', '#beauty',
];

// ─── Component ───────────────────────────────────────────────────────────────

export function MsSearchModal({ visible, onClose }: MsSearchModalProps) {
  const insets = useSafeAreaInsets();
  // Inside a `statusBarTranslucent` full-screen Modal the safe-area top inset
  // can report 0 on Android (the modal draws under the translucent status bar
  // but the root SafeAreaProvider still reports the main window). Fall back to
  // the platform status-bar height so the search field is never hidden.
  const topInset =
    insets.top > 0
      ? insets.top
      : Platform.OS === 'android'
        ? StatusBar.currentHeight ?? 24
        : 0;
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      loadRecent().then(setRecent);
      setQuery('');
      setResults([]);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const lower = q.toLowerCase();

        const [feedData, albumsData, creatorsData] = await Promise.all([
          getFeed().catch(() => []),
          getAlbums().catch(() => []),
          getCreators().catch(() => []),
        ]);

        const rawPosts = Array.isArray(feedData) ? feedData : (feedData as any).posts || [];
        const rawAlbums = Array.isArray(albumsData) ? albumsData : [];
        const rawCreators = Array.isArray(creatorsData) ? creatorsData : [];

        const matchingCreators: ResultItem[] = rawCreators
          .filter(
            (c: any) =>
              (c.name ?? '').toLowerCase().includes(lower) ||
              (c.username ?? '').toLowerCase().includes(lower) ||
              (c.handle ?? '').toLowerCase().includes(lower) ||
              (c.bio ?? '').toLowerCase().includes(lower),
          )
          .slice(0, 10)
          .map((c: any) => ({
            id: c.id,
            type: 'creator',
            title: c.name || c.username || 'Creator',
            subtitle: `@${c.username || c.handle || 'creator'} · Creator`,
            avatarUri: c.avatarUrl ?? null,
            initials: (c.name?.[0] ?? c.username?.[0] ?? 'C').toUpperCase(),
          }));

        const matchingPosts: ResultItem[] = rawPosts
          .filter(
            (p: Post) =>
              (p.caption ?? '').toLowerCase().includes(lower) ||
              (p.author?.username ?? '').toLowerCase().includes(lower) ||
              (p.author?.name ?? '').toLowerCase().includes(lower),
          )
          .slice(0, 10)
          .map((p: Post) => ({
            id: p.id,
            type: 'post',
            title: p.caption || `Post by @${p.author?.username ?? 'unknown'}`,
            subtitle: `@${p.author?.username ?? 'unknown'}`,
            avatarUri: p.author?.avatarUrl ?? null,
            initials: (p.author?.name?.[0] ?? p.author?.username?.[0] ?? 'U').toUpperCase(),
          }));

        const matchingAlbums: ResultItem[] = rawAlbums
          .filter(
            (a: AlbumCardData) =>
              (a.title ?? '').toLowerCase().includes(lower) ||
              (a.description ?? '').toLowerCase().includes(lower) ||
              (a.creatorName ?? '').toLowerCase().includes(lower) ||
              (a.creatorHandle ?? '').toLowerCase().includes(lower),
          )
          .slice(0, 10)
          .map((a: AlbumCardData) => ({
            id: a.id,
            type: 'album',
            title: `Album: ${a.title}`,
            subtitle: `${a.creatorName} · ${a.itemCount} items${a.requiresPurchase ? ` · ₦${a.price?.toLocaleString() ?? 0}` : ''}`,
            avatarUri: a.coverUrl || a.creatorAvatarUrl,
            initials: a.creatorInitials || 'A',
          }));

        setResults([...matchingCreators, ...matchingAlbums, ...matchingPosts]);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 380);
  }, []);

  const handleChangeText = (v: string) => {
    setQuery(v);
    runSearch(v);
  };

  const handleSubmit = async () => {
    if (!query.trim()) return;
    await pushRecent(query.trim());
    setRecent(await loadRecent());
  };

  const handleResultPress = async (item: ResultItem) => {
    if (query.trim()) await pushRecent(query.trim());
    onClose();
    if (item.type === 'creator') {
      router.push(`/creator/${item.id}`);
    } else if (item.type === 'album') {
      router.push(`/album/${item.id}`);
    } else {
      router.push(`/post/${item.id}`);
    }
  };

  const handleRecentPress = (s: string) => {
    setQuery(s);
    runSearch(s);
  };

  const handleDeleteRecent = async (s: string) => {
    await removeRecent(s);
    setRecent(await loadRecent());
  };

  const handleClearRecent = async () => {
    await clearRecent();
    setRecent([]);
  };

  const showEmpty = !query.trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.bg, { paddingTop: topInset, opacity: fadeAnim }]}>
        {/* Search bar */}
        <View style={styles.bar}>
          <View style={styles.inputWrap}>
            <MagnifyingGlass size={15} color={T.TEXT_3} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Search creators, posts, topics…"
              placeholderTextColor={T.TEXT_3}
              value={query}
              onChangeText={handleChangeText}
              onSubmitEditing={handleSubmit}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => { setQuery(''); setResults([]); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.clearBtn}>
                  <X size={10} color={T.TEXT_2} weight="bold" />
                </View>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.7}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {showEmpty ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          >
            {/* Recent */}
            {recent.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>RECENT</Text>
                  <TouchableOpacity onPress={handleClearRecent} hitSlop={8}>
                    <Text style={styles.sectionAction}>Clear all</Text>
                  </TouchableOpacity>
                </View>
                {recent.map((s) => (
                  <View key={s} style={styles.listRow}>
                    <View style={styles.listIcon}>
                      <ClockCounterClockwise size={13} color={T.TEXT_3} />
                    </View>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => handleRecentPress(s)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.listLabel}>{s}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteRecent(s)}
                      hitSlop={10}
                      activeOpacity={0.7}
                    >
                      <X size={12} color={T.TEXT_3} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Trending chips */}
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>TRENDING</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScroll}
              >
                {TRENDING_TOPICS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={styles.chip}
                    onPress={() => handleRecentPress(t.replace('#', ''))}
                    activeOpacity={0.75}
                  >
                    <Hash size={10} color={T.PRIMARY_LIGHT} weight="bold" />
                    <Text style={styles.chipLabel}>{t.replace('#', '')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={searching ? ([] as ResultItem[]) : results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: 6, paddingBottom: insets.bottom + 40 }}
            ListHeaderComponent={searching ? (
              <View>
                {[1, 2, 3, 4, 5].map((i) => <ShimmerRow key={i} />)}
              </View>
            ) : null}
            ListEmptyComponent={
              !searching ? (
                <Text style={styles.emptyText}>No results for "{query}"</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultRow}
                onPress={() => handleResultPress(item)}
                activeOpacity={0.75}
              >
                <MsAvatar
                  size={32}
                  initials={item.initials}
                  imageUri={item.avatarUri ?? undefined}
                />
                <View style={styles.resultText}>
                  <Text style={styles.resultTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.resultSub}>{item.subtitle}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: T.BG },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 12,
    height: 36,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    // Vertically centre the caret + text inside the 36px pill on Android.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    ...(Platform.OS === 'web'
      ? { outlineStyle: 'none' as never, outlineWidth: 0 }
      : {}),
  },
  clearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: { paddingLeft: 2 },
  cancelLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  section: { paddingTop: 4 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 1.0,
  },
  sectionAction: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  listIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLabel: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
  },

  // Trending chips
  chipsScroll: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE,
  },
  chipLabel: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  resultText: { flex: 1 },
  resultTitle: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    marginBottom: 1,
  },
  resultSub: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },

  emptyText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    marginTop: 44,
  },
});
