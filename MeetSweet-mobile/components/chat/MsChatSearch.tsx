/**
 * MsChatSearch — in-chat keyword search.
 * Highlights matches, shows count, jump to message.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { X, ArrowUp, ArrowDown } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';

interface Props {
  visible:  boolean;
  messages: MsMessage[];
  onClose:  () => void;
  onJump:   (msgId: string | number) => void;
}

export function MsChatSearch({ visible, messages, onClose, onJump }: Props) {
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const [query, setQuery]   = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => inputRef.current?.focus());
    } else {
      Animated.timing(slideAnim, {
        toValue: -60,
        duration: 200,
        useNativeDriver: true,
      }).start();
      setQuery('');
      setCursor(0);
    }
  }, [visible]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => m.text?.toLowerCase().includes(q))
      .map((m) => m._id);
  }, [query, messages]);

  const total = matches.length;

  const goNext = () => {
    if (!total) return;
    const next = (cursor + 1) % total;
    setCursor(next);
    onJump(matches[next]);
  };

  const goPrev = () => {
    if (!total) return;
    const prev = (cursor - 1 + total) % total;
    setCursor(prev);
    onJump(matches[prev]);
  };

  useEffect(() => {
    if (matches.length > 0) {
      setCursor(0);
      onJump(matches[0]);
    }
  }, [matches]);

  if (!visible) return null;

  return (
    <Animated.View style={[s.bar, { transform: [{ translateY: slideAnim }] }]}>
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
          {total === 0 ? 'No results' : `${cursor + 1} / ${total}`}
        </Text>
      )}

      <TouchableOpacity onPress={goPrev} hitSlop={8} disabled={total === 0} style={s.iconBtn}>
        <ArrowUp size={18} color={total > 0 ? T.TEXT_2 : T.TEXT_3} />
      </TouchableOpacity>
      <TouchableOpacity onPress={goNext} hitSlop={8} disabled={total === 0} style={s.iconBtn}>
        <ArrowDown size={18} color={total > 0 ? T.TEXT_2 : T.TEXT_3} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} hitSlop={8} style={s.iconBtn}>
        <X size={18} color={T.TEXT_2} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
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
  },
  count: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
    minWidth: 54,
    textAlign: 'center',
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
