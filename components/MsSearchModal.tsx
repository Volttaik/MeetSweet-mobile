/**
 * MsSearchModal — full-screen search modal for the Home feed.
 * Searches posts via the live backend. User search is frontend-ready but
 * requires backend implementation (documented in BACKEND_REQUIRED.md).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MagnifyingGlass, X, ClockCounterClockwise, TrendUp } from 'phosphor-react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { getFeed, type Post } from '@/services/posts';

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResultItem {
  id: string;
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
  'photography',
  'music',
  'fitness',
  'art & design',
  'travel',
  'cooking',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MsSearchModal({ visible, onClose }: MsSearchModalProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  // Focus input when modal opens
  useEffect(() => {
    if (visible) {
      loadRecent().then(setRecent);
      setQuery('');
      setResults([]);
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // Debounced search against posts feed
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
        const data = await getFeed(1);
        const lower = q.toLowerCase();
        const filtered: ResultItem[] = data.posts
          .filter(
            (p: Post) =>
              (p.caption ?? '').toLowerCase().includes(lower) ||
              (p.author?.username ?? '').toLowerCase().includes(lower) ||
              (p.author?.name ?? '').toLowerCase().includes(lower),
          )
          .slice(0, 15)
          .map((p: Post) => ({
            id: p.id,
            title: p.caption || `Post by @${p.author?.username ?? 'unknown'}`,
            subtitle: `@${p.author?.username ?? 'unknown'}`,
            avatarUri: p.author?.avatarUrl ?? null,
            initials: (
              p.author?.name?.[0] ??
              p.author?.username?.[0] ??
              'U'
            ).toUpperCase(),
          }));
        setResults(filtered);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
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
    if (query.trim()) {
      await pushRecent(query.trim());
    }
    onClose();
    router.push(`/post/${item.id}`);
  };

  const handleRecentPress = (s: string) => {
    setQuery(s);
    runSearch(s);
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
      <View style={[styles.bg, { paddingTop: insets.top }]}>
        {/* ── Search bar ── */}
        <View style={styles.bar}>
          <View style={styles.inputWrap}>
            <MagnifyingGlass size={17} color={T.TEXT_3} />
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
                onPress={() => {
                  setQuery('');
                  setResults([]);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={15} color={T.TEXT_2} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.7}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* ── Content ── */}
        {showEmpty ? (
          <FlatList
            data={[]}
            renderItem={() => null}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            ListHeaderComponent={
              <View>
                {/* Recent */}
                {recent.length > 0 && (
                  <>
                    <View style={styles.sectionRow}>
                      <Text style={styles.sectionLabel}>Recent</Text>
                      <TouchableOpacity onPress={handleClearRecent}>
                        <Text style={styles.sectionAction}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                    {recent.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={styles.listRow}
                        onPress={() => handleRecentPress(s)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.listIcon}>
                          <ClockCounterClockwise size={15} color={T.TEXT_2} />
                        </View>
                        <Text style={styles.listLabel}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                {/* Trending */}
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>Trending</Text>
                </View>
                {TRENDING_TOPICS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={styles.listRow}
                    onPress={() => handleRecentPress(t)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.listIcon}>
                      <TrendUp size={15} color={T.TEXT_2} />
                    </View>
                    <Text style={styles.listLabel}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingTop: 8,
              paddingBottom: insets.bottom + 40,
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {searching ? 'Searching…' : `No results for "${query}"`}
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultRow}
                onPress={() => handleResultPress(item)}
                activeOpacity={0.75}
              >
                <MsAvatar
                  size={38}
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
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: T.BG },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.full,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    paddingHorizontal: 14,
    height: 42,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
  },
  cancelBtn: { paddingLeft: 4 },
  cancelLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionAction: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  listIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLabel: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
  },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  resultText: { flex: 1 },
  resultTitle: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    marginBottom: 2,
  },
  resultSub: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },

  emptyText: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    marginTop: 48,
  },
});
