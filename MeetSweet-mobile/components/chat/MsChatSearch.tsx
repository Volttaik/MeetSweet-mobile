/**
 * MsChatSearch — in-chat keyword search overlay.
 *
 * Renders as an overlay below the chat header with the search bar and a
 * matching-message results list. The overlay is keyboard-aware so the search
 * input, cursor, typed text and results are ALWAYS visible above the keyboard
 * on every device:
 *   • iOS — KeyboardAvoidingView (behavior="padding") shifts the results up
 *     with the keyboard.
 *   • Android — the window resize isn't guaranteed (Expo Go / soft input
 *     mode varies per device), so the keyboard height is tracked explicitly
 *     and applied as bottom padding to the results list.
 *
 * Tapping a result closes the overlay and jumps to the message in the chat
 * (the target bubble flashes via the screen's highlight).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowBendUpLeft, MagnifyingGlass, X } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';

interface Props {
  visible:  boolean;
  /** Vertical offset of the search bar from the top of the window (header
   *  height), so the iOS KeyboardAvoidingView can pad by exactly the right
   *  amount. */
  topOffset: number;
  messages: MsMessage[];
  onClose:  () => void;
  onJump:   (msgId: string | number) => void;
}

function formatTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Short human label for a non-text match so results are always meaningful. */
function snippetFor(m: MsMessage): string {
  if (m.text?.trim()) return m.text;
  if (m.msMediaType === 'image') {
    return m.msMimeType === 'image/gif' || m.msFileType === 'gif' ? 'GIF' : 'Photo';
  }
  if (m.msMediaType === 'video') return 'Video';
  if (m.msMediaType === 'audio') return m.msIsVoiceNote ? 'Voice message' : 'Audio';
  if (m.msMediaType === 'file') return 'Document';
  return 'Message';
}

export function MsChatSearch({ visible, topOffset, messages, onClose, onJump }: Props) {
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Track the keyboard height explicitly (Android can't always rely on window
  // resize, and this is the value that guarantees the results stay visible).
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (visible) {
      // Focus after the overlay mounts so the keyboard opens in the right place.
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
    setQuery('');
    setKeyboardHeight(0);
  }, [visible]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return messages.filter((m) => m.text?.toLowerCase().includes(q));
  }, [query, messages]);

  if (!visible) return null;

  const handleJump = (msg: MsMessage) => {
    // Close the overlay first so the user can SEE the jump target, then jump.
    onClose();
    onJump(msg._id);
  };

  const total = matches.length;

  return (
    <KeyboardAvoidingView
      style={[s.overlay, { top: topOffset }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={topOffset}
    >
      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <View style={s.bar}>
        <MagnifyingGlass size={15} color={T.TEXT_2} />
        <TextInput
          ref={inputRef}
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search messages…"
          placeholderTextColor={T.TEXT_3}
          returnKeyType="search"
          clearButtonMode="never"
          autoCorrect={false}
          autoCapitalize="none"
          selectionColor={T.ACCENT}
        />
        {query.length > 0 && (
          <Text style={s.count}>
            {total === 0 ? 'No results' : `${total} ${total === 1 ? 'match' : 'matches'}`}
          </Text>
        )}
        <TouchableOpacity onPress={onClose} hitSlop={8} style={s.iconBtn}>
          <X size={18} color={T.TEXT_2} />
        </TouchableOpacity>
      </View>

      {/* ── Results (padded above the keyboard on Android) ───────────────── */}
      <FlatList
        data={matches}
        keyExtractor={(m) => String(m._id)}
        style={s.list}
        contentContainerStyle={[
          s.listContent,
          // Android: keep results above the keyboard regardless of soft-input
          // mode. iOS is handled by the KeyboardAvoidingView above.
          { paddingBottom: Platform.OS === 'android' ? keyboardHeight : 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          query.trim().length > 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>No messages match “{query.trim()}”</Text>
            </View>
          ) : (
            <View style={s.emptyWrap}>
              <Text style={s.emptyHint}>Type to search this conversation</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.row}
            activeOpacity={0.7}
            onPress={() => handleJump(item)}
          >
            <View style={s.rowIcon}>
              <ArrowBendUpLeft size={14} color={T.TEXT_2} />
            </View>
            <View style={s.rowBody}>
              <Text style={s.rowSnippet} numberOfLines={2}>
                {snippetFor(item)}
              </Text>
              <Text style={s.rowMeta} numberOfLines={1}>
                {item.user?.name ?? 'User'}
              </Text>
            </View>
            <Text style={s.rowTime}>
              {item.createdAt ? formatTime(item.createdAt) : ''}
            </Text>
          </TouchableOpacity>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
    backgroundColor: T.BG,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  input: {
    flex: 1,
    height: 36,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  count: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
    minWidth: 62,
    textAlign: 'center',
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowSnippet: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    lineHeight: 18,
  },
  rowMeta: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
  rowTime: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    flexShrink: 0,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
  },
});
