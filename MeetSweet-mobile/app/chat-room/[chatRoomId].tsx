/**
 * Chat Room Screen — /chat-room/[chatRoomId]
 *
 * UI-ONLY SHELL. The old chat backend (room-service, chat-cache, chat-media,
 * SweetSocket messaging) has been deliberately removed to leave a clean
 * foundation for the next messaging architecture. This screen preserves the
 * visual layout — header, empty-chat state, composer, header menu, wallpaper
 * picker, profile sheet — but performs NO network or storage operations for
 * messages. The next phase reconnects this UI to the new backend.
 *
 * DO NOT TOUCH: auth, navigation, uploads, payments.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import { ArrowLeft, DotsThreeVertical } from 'phosphor-react-native';
import { MsChatHeaderMenu } from '@/components/chat/MsChatHeaderMenu';
import { MsChatBgPicker }   from '@/components/chat/MsChatBgPicker';
import {
  getChatBackground,
  setChatBackground as persistChatBackground,
  DEFAULT_BACKGROUND,
  type ChatBackground,
} from '@/services/chat-background';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsUserProfileSheet, type ProfileSheetUser } from '@/components/MsUserProfileSheet';
import { MsChatInputBar } from '@/components/chat/MsChatInputBar';
import { MsChatBackground } from '@/components/chat/MsChatBackground';
import { useAuth } from '@/contexts/AuthContext';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    chatRoomId: routeChatRoomId,
    name: routeName,
    username: routeUsername,
    avatarUrl: routeAvatarUrl,
  } = useLocalSearchParams<{ chatRoomId?: string; name?: string; username?: string; avatarUrl?: string }>();

  // The other participant's identity comes from the navigation params (the
  // chat list / creator profile already have it) — the room fetch that used
  // to refresh it has been removed with the old backend.
  const [otherUser] = useState<ProfileSheetUser & { isOnline?: boolean }>({
    id: '',
    name: routeName ?? '',
    username: routeUsername ?? '',
    avatarUrl: routeAvatarUrl ?? null,
    isOnline: false,
  });

  // ── Wallpaper (local-only persistence, preserved from the old UI) ───────
  const [chatBackground, setChatBackground] = useState<ChatBackground>(DEFAULT_BACKGROUND);
  useEffect(() => {
    if (!routeChatRoomId) return;
    getChatBackground(routeChatRoomId, user?.id)
      .then(setChatBackground)
      .catch(() => {});
  }, [routeChatRoomId, user?.id]);
  const handleBgSelect = useCallback((bg: ChatBackground) => {
    setChatBackground(bg);
    if (routeChatRoomId) {
      persistChatBackground(routeChatRoomId, user?.id, bg).catch(() => {});
    }
  }, [routeChatRoomId, user?.id]);

  // ── Sheets / menus (visual only) ────────────────────────────────────────
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);

  // Composer state — the input stays interactive for the user; sending is a
  // no-op until the new messaging architecture lands.
  const [inputText, setInputText] = useState('');

  return (
    <View style={[styles.fill, { backgroundColor: T.BG }]}>
      <MsChatBackground background={chatBackground} />
      <StatusBar barStyle="light-content" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => goBack()}>
          <ArrowLeft size={22} color={T.TEXT} />
        </TouchableOpacity>
        <Pressable style={styles.headerCenter} onPress={() => setShowProfileSheet(true)} hitSlop={8}>
          <MsAvatar
            size={36}
            initials={(otherUser.name || 'U').substring(0, 2).toUpperCase()}
            imageUri={otherUser.avatarUrl ?? undefined}
          />
          <View>
            <Text style={styles.headerName} numberOfLines={1}>
              {otherUser.name || 'Chat'}
            </Text>
            {otherUser.username ? (
              <Text style={styles.headerUsername}>@{otherUser.username}</Text>
            ) : null}
          </View>
        </Pressable>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setShowHeaderMenu(true)}
        >
          <DotsThreeVertical size={22} color={T.TEXT_2} weight="bold" />
        </TouchableOpacity>
      </View>

      {/* ── Empty-chat state — always shown while there is no messaging
           backend to populate the conversation ─────────────────────────── */}
      <View pointerEvents="none" style={styles.emptyOverlay}>
        <MsAvatar
          size={72}
          initials={(otherUser.name || 'U').substring(0, 2).toUpperCase()}
          imageUri={otherUser.avatarUrl ?? undefined}
        />
        <Text style={styles.emptyTitle}>
          {otherUser.name ? `${otherUser.name}` : 'New chat'}
        </Text>
        <Text style={styles.emptyHint}>
          {otherUser.username
            ? `Say hi to @${otherUser.username}`
            : 'Messaging is being rebuilt — conversations will appear here.'}
        </Text>
      </View>

      {/* ── Composer (visual shell — send is inert until the new backend) ── */}
      <MsChatInputBar
        text={inputText}
        onChangeText={setInputText}
        onSend={() => {}}
        onVoiceReady={() => {}}
        disabled={false}
      />

      {/* ── Chat header menu ─────────────────────────────────────────────────── */}
      <MsChatHeaderMenu
        visible={showHeaderMenu}
        onClose={() => setShowHeaderMenu(false)}
        isBlocked={false}
        isMuted={false}
        otherName={otherUser.name || 'User'}
        onBackground={() => setShowBgPicker(true)}
        onSearch={() => {}}
        onProfile={() => setShowProfileSheet(true)}
        onMute={() => {}}
        onBlock={() => {}}
        onClear={() => {}}
        onDelete={() => {}}
      />

      {/* ── Chat background picker ───────────────────────────────────────────── */}
      <MsChatBgPicker
        visible={showBgPicker}
        current={chatBackground}
        onSelect={handleBgSelect}
        onClose={() => setShowBgPicker(false)}
      />

      {/* ── User profile sheet ───────────────────────────────────────────────── */}
      {showProfileSheet && (
        <MsUserProfileSheet
          visible={showProfileSheet}
          user={otherUser}
          onClose={() => setShowProfileSheet(false)}
        />
      )}

      {/* The old screen also offered room actions (mute/block/clear/delete) and
          message actions — those all depended on the removed chat backend. */}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
    backgroundColor: T.BG,
    gap: 4,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  headerName: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    flexShrink: 1,
  },
  headerUsername: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  // Empty-chat state — centered overlay above the chat background
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
  },
});
