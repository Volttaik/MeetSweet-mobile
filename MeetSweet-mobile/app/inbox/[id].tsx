/**
 * Private Thread — chat-style correspondence view.
 *
 * The screen is a PERSISTENT UI SHELL built from three independent structural
 * components (ChatScreen = ChatHeader + ChatContent + ChatComposer, all over
 * the chat wallpaper):
 *
 *   Open chat
 *     ↓ wallpaper + header + composer render IMMEDIATELY (frame one)
 *     ↓ cached messages paint instantly when the thread was opened before
 *     ↓ HTTP fetch reconciles with the server (authoritative)
 *     ↓ SweetSocket keeps the thread live — no polling, ever
 *
 * The header and composer never wait for the message list's data request: only
 * the conversation content is synchronized.
 *
 * Local cache (lib/chat-cache) is a performance/offline layer — the
 * server/database remains the source of truth. Media bytes are cached on
 * device via Expo File System (services/chat-media) and rendered from the
 * local file once downloaded; a missing/corrupt local file falls back to the
 * canonical remote URL and offers Download again.
 *
 * Real-time: the screen subscribes to the existing SweetSocket stream
 * (services/realtime) — new replies, read/status changes, approvals and
 * deletions arrive as events and update the thread in place.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowBendUpLeft,
  Copy,
  Hourglass,
  Prohibit,
  Trash,
  X,
} from 'phosphor-react-native';
import { T, alpha, MEDIA_BG } from '@/constants/theme';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { goBack } from '@/lib/safe-back';
import { MsAttachmentSheet, type AttachmentResult } from '@/components/MsAttachmentSheet';
import { MsModal } from '@/components/MsModal';
import * as Clipboard from 'expo-clipboard';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { ChatBackground } from '@/components/ChatBackground';
import { ChatHeader } from '@/components/ChatHeader';
import { ChatContent } from '@/components/ChatContent';
import { ChatComposer } from '@/components/ChatComposer';
import { cacheThread, getCachedThread } from '@/lib/chat-cache';
import { useAuth } from '@/contexts/AuthContext';
import {
  allowPrivateSender,
  approvePrivateMessage,
  deletePrivateMessage,
  getPrivateMessage,
  markPrivateMessageRead,
  purchasePrivateAttachment,
  replyToPrivateMessage,
  restrictPrivateSender,
  type PrivateMessage,
} from '@/services/private-inbox';
import { blockUser } from '@/services/users';
import { realtime } from '@/services/realtime';

type InboxMediaType = 'image' | 'video' | 'file';

function toInboxMediaType(result: AttachmentResult): InboxMediaType | null {
  if (result.type === 'image' || result.type === 'gif') return 'image';
  if (result.type === 'video') return 'video';
  if (result.type === 'document') return 'file';
  return null;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PrivateThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [message, setMessage] = useState<PrivateMessage | null>(null);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<PrivateMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sheetVisible, setSheetVisible] = useState(false);
  // Viewer state: which attachment is open fullscreen.
  const [viewer, setViewer] = useState<{ uri: string; isVideo: boolean } | null>(null);
  // Action sheets: header three-dot menu + per-message long-press actions.
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<PrivateMessage | null>(null);
  // Set when THIS device blocks the sender this session — the composer is
  // replaced by a clear blocked notice (server enforces it going forward).
  const [blockedOther, setBlockedOther] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  // Measured height of the floating composer (the composer's OWN layout, not
  // the keyboard-padding wrapper around it). The message list reserves exactly
  // this much bottom room + a comfortable gap, so the newest message always
  // sits naturally above the input and is never covered by it.
  const [composerHeight, setComposerHeight] = useState(0);
  const composerMeasured = useRef(false);
  // One idempotency key per reply draft: retries after a network failure
  // never duplicate the reply; a fresh key is minted after success.
  const idempotencyKeyRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  // Follow new messages: jump to the newest row on first paint, then animate
  // down only when the row count grows (a reply arrived while open).
  const lastRowCount = useRef(0);

  const amRecipient = message?.recipient_id === user?.id;
  const isWaiting = message?.status === 'waiting';
  // Only the thread's creator participant prices media — server-authoritative
  // (thread_creator_id), correct in both thread directions: fan-initiated
  // (creator = recipient) and creator-initiated (creator = sender).
  const canPriceAttachments = message?.thread_creator_id === user?.id;

  /**
   * Authoritative fetch — the server/database is the source of truth. The
   * local cache is only a fast paint layer; this request always runs so the
   * screen reconciles with reality (and is re-run for sync after operations).
   */
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const m = await getPrivateMessage(id);
      setMessage(m);
      // The recipient opening the thread marks their unread rows read
      // (server notifies the sender). Waiting rows are not marked until
      // approved.
      if (m.recipient_id === user?.id && m.status !== 'waiting') {
        await markPrivateMessageRead(id).catch(() => {});
      }
    } catch {
      // A failed fetch keeps whatever the cache provided; the not-found state
      // only appears when there was nothing cached AND the fetch failed.
    }
  }, [id, user?.id]);

  /**
   * Cache-first open sequence:
   *   1. Render any cached copy instantly (already-viewed conversation).
   *   2. Kick off the authoritative fetch + realtime reconcile in parallel.
   * The UI shell (wallpaper/header/composer) was already visible before this
   * effect ran — only the content area is being filled in.
   */
  useEffect(() => {
    let alive = true;

    if (id && user?.id) {
      getCachedThread(id, user.id)
        .then((cached) => {
          if (!alive || !cached) return;
          setMessage(cached);
          setLoading(false);
        })
        .catch(() => {});
    }

    load().finally(() => {
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [load, id, user?.id]);

  // Keep the local cache in sync with every authoritative load AND every
  // realtime patch — the cache is a mirror, never an independent source.
  useEffect(() => {
    if (message && id && user?.id) {
      void cacheThread(id, user.id, message);
    }
  }, [message, id, user?.id]);

  /** Thread rows oldest → newest, with a legacy fallback for cached shapes. */
  const threadRows: PrivateMessage[] = message?.thread?.length
    ? message.thread
    : message
      ? [message, ...(message.reply ? [message.reply] : [])]
      : [];

  // ── SweetSocket — the thread is live. New replies, read/status changes,
  //    approvals and deletions arrive as events; the UI updates in place.
  //    One subscription, cleaned up on unmount — no polling, no duplicates.
  useEffect(() => {
    return realtime.on((event) => {
      switch (event.type) {
        case 'private_message.reply_created': {
          const payload = event.payload as { original_id?: string; parent_id?: string; reply?: PrivateMessage };
          const reply = payload.reply;
          if (!reply) return;
          const belongsToThread =
            payload.original_id === id || payload.parent_id === id || reply.id === id || reply.parent_message_id === id;
          if (!belongsToThread) return;
          setMessage((prev) => {
            if (!prev) return prev;
            const rows = prev.thread?.length ? prev.thread : [prev, ...(prev.reply ? [prev.reply] : [])];
            if (rows.some((r) => r.id === reply.id) || prev.id === reply.id) return prev;
            return {
              ...prev,
              status: prev.recipient_id === user?.id ? 'replied' : prev.status,
              replied_at: reply.created_at,
              reply_count: (prev.reply_count ?? 0) + 1,
              thread: [...rows, reply],
            };
          });
          break;
        }
        case 'private_message.read': {
          const payload = event.payload as { message_id?: string; read_at?: string };
          const mid = payload.message_id ?? event.resourceId;
          if (!mid) return;
          setMessage((prev) => {
            if (!prev) return prev;
            const patch = (m: PrivateMessage): PrivateMessage =>
              m.id === mid
                ? { ...m, read_at: payload.read_at ?? m.read_at, status: m.status === 'sent' ? 'read' : m.status }
                : m;
            return { ...patch(prev), thread: prev.thread?.map(patch) };
          });
          break;
        }
        case 'private_message.updated': {
          const payload = event.payload as { message?: PrivateMessage };
          if (event.resourceId === id && payload.message) {
            setMessage((prev) => (prev ? { ...prev, ...payload.message! } : prev));
          }
          break;
        }
        case 'private_message.approved': {
          const payload = event.payload as { message_id?: string };
          if (payload.message_id !== id && event.resourceId !== id) return;
          setMessage((prev) => (prev && prev.status === 'waiting' ? { ...prev, status: 'sent' } : prev));
          break;
        }
        case 'private_message.deleted': {
          const payload = event.payload as { thread_id?: string };
          if (payload.thread_id === id || event.resourceId === id) goBack();
          break;
        }
        default:
          break;
      }
    });
  }, [id, user?.id]);

  // Selecting media opens the dedicated media composer screen — nothing is
  // uploaded or sent here. The composer previews the asset, collects caption +
  // free/paid + price (creators), and only uploads/sends on Send.
  const onAttachmentPicked = useCallback((result: AttachmentResult) => {
    const mediaType = toInboxMediaType(result);
    if (!mediaType) return;
    router.push({
      pathname: '/media-composer',
      params: {
        mode: 'reply',
        targetId: (replyTo?.id ?? message?.id) ?? '',
        canPrice: canPriceAttachments ? '1' : '0',
        uri: result.uri,
        mimeType: result.mimeType,
        fileName: result.fileName,
        mediaType,
      },
    } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyTo?.id, message?.id, canPriceAttachments]);

  /** Purchase a priced reply attachment — server debits once atomically. */
  const unlock = useCallback(async (attachmentId: string) => {
    try {
      const r = await purchasePrivateAttachment(attachmentId);
      const patch = (m: PrivateMessage | null): PrivateMessage | null => {
        if (!m) return m;
        const fixed = (msg: PrivateMessage): PrivateMessage => ({
          ...msg,
          attachments: msg.attachments.map((x) => (x.id === attachmentId ? r.attachment : x)),
        });
        return { ...fixed(m), thread: m.thread?.map(fixed) };
      };
      setMessage(patch);
      const fresh = r.attachment;
      if (!fresh.is_locked && fresh.media_url) {
        setViewer({ uri: fresh.media_url, isVideo: fresh.media_type === 'video' });
      }
    } catch (e) {
      Alert.alert('Could not unlock', e instanceof Error ? e.message : 'Please try again.');
    }
  }, []);

  /** Open an attachment fullscreen — resolves local-or-remote URI from the row. */
  const openMedia = useCallback((uri: string, isVideo: boolean) => {
    setViewer({ uri, isVideo });
  }, []);

  const sendReply = async () => {
    if (!message || sending) return;
    // Text reply only — media goes through the media composer screen.
    if (!body.trim()) return;
    const target = replyTo ?? message;
    setSending(true);
    try {
      const result = await replyToPrivateMessage({
        id: target.id,
        body: body.trim(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      // Optimistic append — the follow-up load() reconciles with the server.
      setMessage((prev) => {
        if (!prev) return prev;
        const rows = prev.thread?.length ? prev.thread : [prev, ...(prev.reply ? [prev.reply] : [])];
        if (rows.some((r) => r.id === result.message.id) || prev.id === result.message.id) return prev;
        return {
          ...prev,
          status: prev.recipient_id === user?.id ? 'replied' : prev.status,
          replied_at: result.message.created_at,
          reply_count: (prev.reply_count ?? 0) + 1,
          thread: [...rows, result.message],
        };
      });
      await load();
      setBody('');
      setReplyTo(null);
      idempotencyKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } catch (e) {
      Alert.alert('Could not reply', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const approve = async () => {
    if (!message) return;
    try {
      await approvePrivateMessage(message.id);
      await load();
    } catch (e) {
      Alert.alert('Could not approve', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const allowSender = async () => {
    if (!message) return;
    try {
      const r = await allowPrivateSender(message.sender_id);
      Alert.alert(
        'Allowed',
        r.approved > 0 ? `${r.approved} pending message${r.approved === 1 ? '' : 's'} moved to your inbox.` : 'This sender is allowed again.',
      );
      await load();
    } catch (e) {
      Alert.alert('Could not allow', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const blockSender = () => {
    if (!message) return;
    const senderName = message.sender_name ?? message.sender_username ?? 'this sender';
    Alert.alert(
      `Block ${senderName}?`,
      'They will no longer be able to send you private messages. You can unblock them later from their profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(message.sender_username ?? message.sender_id);
              setBlockedOther(true);
              Alert.alert('Blocked', `You can no longer receive private messages from ${senderName}.`);
            } catch (e) {
              Alert.alert('Could not block', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  /** Confirm-then-delete the whole correspondence (thread-level only). */
  const confirmDelete = () => {
    if (!message) return;
    const senderInitiated = message.sender_id === user?.id;
    Alert.alert(
      'Delete this correspondence?',
      senderInitiated
        ? 'You sent the original message, so deleting removes it for BOTH you and the other person. This cannot be undone.'
        : 'This hides the correspondence from your inbox only. The sender keeps their copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: senderInitiated ? 'Delete for both' : 'Delete for me',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePrivateMessage(message.id);
              goBack();
            } catch (e) {
              Alert.alert('Could not delete', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  /** Confirm-then-mute the sender — their future messages wait for approval. */
  const confirmMute = () => {
    if (!message) return;
    const senderName = message.sender_name ?? message.sender_username ?? 'this sender';
    Alert.alert(
      `Set ${senderName} to waiting?`,
      'Future messages from this sender will wait for your approval instead of arriving in your inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set to waiting',
          onPress: async () => {
            try {
              await restrictPrivateSender(message.sender_id);
              Alert.alert('Muted', `Future messages from ${senderName} will wait for your approval.`);
            } catch (e) {
              Alert.alert('Could not mute', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  /** Long-press a message → available actions. Only genuinely supported ones:
   *  reply (either participant may reply) and copy text. Per-message delete is
   *  NOT supported by the backend (delete is thread-level only), so it is not
   *  offered here — no fake actions. */
  const openMessageActions = useCallback((msg: PrivateMessage) => {
    setActionMessage(msg);
  }, []);

  const replyToActionMessage = () => {
    const m = actionMessage;
    if (!m) return;
    setReplyTo(m);
    setActionMessage(null);
  };

  const copyActionMessage = () => {
    const m = actionMessage;
    if (!m) return;
    Clipboard.setStringAsync(m.body).catch(() => {});
    setActionMessage(null);
  };

  // Follow the newest message: first paint jumps to the latest; later arrivals
  // only animate down when the reader is already near the bottom — reading
  // older messages must never be yanked to the newest row.
  const nearBottom = useRef(true);
  const onScrollNearBottom = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
  }, []);
  const onContentSizeChange = useCallback(() => {
    const count = threadRows.length;
    if (lastRowCount.current === 0 && count > 0) {
      lastRowCount.current = count;
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    } else if (count > lastRowCount.current) {
      lastRowCount.current = count;
      if (nearBottom.current) {
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    }
  }, [threadRows.length]);

  const otherName = message
    ? amRecipient
      ? message.sender_name ?? message.sender_username ?? 'User'
      : message.recipient_name ?? message.recipient_username ?? 'Creator'
    : null;
  const otherAvatar = message ? (amRecipient ? message.sender_avatar : message.recipient_avatar) : null;

  // The composer is part of the persistent shell: it mounts immediately and
  // stays visible while the thread synchronizes. After the payload arrives it
  // yields to the waiting/blocked states (which replace it by design), and it
  // hides only when the thread turns out not to exist.
  const canCompose = message ? !isWaiting && !blockedOther : loading;

  // Bottom inset for the message list = measured floating-composer height + a
  // comfortable gap, so the newest message always lands just above the input.
  // Until the first measurement lands we fall back to the single-line composer
  // height so the thread never starts out cramped. With no composer, just
  // clear the safe area so the approval/blocked notices sit naturally.
  const listBottomPadding = canCompose
    ? Math.max(composerHeight, 62) + 16
    : insets.bottom + 18;

  const canSend = !sending && !!message && body.trim().length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Chat wallpaper — one continuous, low-contrast surface behind the
          whole thread, the header and the floating composer. */}
      <ChatBackground />

      {/* Header — standalone component, mounted from frame one. It never waits
          for the message list; identity fills in once the thread loads. */}
      <ChatHeader
        name={otherName}
        avatarUri={otherAvatar}
        subtitle={isWaiting ? 'Waiting for your approval' : undefined}
        onBack={() => goBack()}
        onMenu={() => setMenuOpen(true)}
      />

      {/* Content area — the only part that synchronizes. Cached rows paint
          instantly; the authoritative fetch + realtime events fill the rest. */}
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ChatContent
            message={message}
            loading={loading}
            threadRows={threadRows}
            amRecipient={amRecipient}
            isWaiting={isWaiting}
            blockedOther={blockedOther}
            listBottomPadding={listBottomPadding}
            scrollRef={scrollRef}
            userId={user?.id}
            onScroll={onScrollNearBottom}
            onContentSizeChange={onContentSizeChange}
            onMessageLongPress={openMessageActions}
            onUnlock={unlock}
            onOpenMedia={openMedia}
            onApprove={approve}
            onAllowSender={allowSender}
            onBlockSender={blockSender}
          />
        </KeyboardAvoidingView>
      </View>

      {/* Composer overlay — a separate floating component at the bottom,
          outside the message list, so the chat background shows through all
          around it and it stays aligned just below the newest message. Its own
          KeyboardAvoidingView lifts it above the keyboard on iOS. */}
      {canCompose ? (
        <KeyboardAvoidingView style={styles.composerOverlay} behavior="padding" pointerEvents="box-none">
          {/* Measuring wrapper — reports the composer's real height so the
              thread can reserve exactly the right bottom room for it. */}
          <View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              setComposerHeight(h);
              if (!composerMeasured.current) {
                composerMeasured.current = true;
                // The first measurement grows the list's bottom inset — pull
                // the newest message back up so it lands above the composer.
                if (nearBottom.current) {
                  requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
                }
              }
            }}
          >
            <ChatComposer
              body={body}
              onChangeBody={setBody}
              amRecipient={amRecipient ?? true}
              ownId={user?.id}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              canSend={canSend}
              sending={sending}
              onSend={sendReply}
              onAttach={() => setSheetVisible(true)}
              bottomInset={insets.bottom}
            />
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {/* Header three-dot menu — conversation management actions */}
      <MsModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={otherName ?? 'Conversation'}
        subtitle={isWaiting ? 'Waiting for your approval' : 'Private correspondence'}
        presentation="sheet"
      >
        <View style={styles.sheetBody}>
          <Pressable
            style={styles.sheetRow}
            onPress={() => {
              setMenuOpen(false);
              router.replace({ pathname: '/messages', params: { tab: 'waiting' } } as any);
            }}
          >
            <View style={styles.sheetIcon}>
              <BrandGradientFill />
              <Hourglass size={15} color="#FFFFFF" weight="bold" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetRowText}>View waiting messages</Text>
              <Text style={styles.sheetRowSub}>Messages awaiting your approval</Text>
            </View>
          </Pressable>
          {amRecipient && !isWaiting ? (
            <Pressable style={styles.sheetRow} onPress={() => { setMenuOpen(false); confirmMute(); }}>
              <View style={styles.sheetIcon}>
                <BrandGradientFill />
                <Hourglass size={15} color="#FFFFFF" weight="bold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowText}>Set to waiting</Text>
                <Text style={styles.sheetRowSub}>Future messages from this sender need your approval</Text>
              </View>
            </Pressable>
          ) : null}
          {amRecipient ? (
            <Pressable style={styles.sheetRow} onPress={() => { setMenuOpen(false); blockSender(); }}>
              <View style={[styles.sheetIcon, styles.sheetIconDanger]}>
                <Prohibit size={15} color="#FFFFFF" weight="bold" />
              </View>
              <Text style={[styles.sheetRowText, styles.sheetRowDanger]}>Block sender</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.sheetRow} onPress={() => { setMenuOpen(false); confirmDelete(); }}>
            <View style={[styles.sheetIcon, styles.sheetIconDanger]}>
              <Trash size={15} color="#FFFFFF" weight="bold" />
            </View>
            <Text style={[styles.sheetRowText, styles.sheetRowDanger]}>
              {amRecipient ? 'Delete for me' : 'Delete for both'}
            </Text>
          </Pressable>
        </View>
      </MsModal>

      {/* Long-press message actions — only genuinely supported actions */}
      <MsModal
        visible={!!actionMessage}
        onClose={() => setActionMessage(null)}
        title="Message actions"
        presentation="sheet"
      >
        <View style={styles.sheetBody}>
          {!isWaiting ? (
            <Pressable style={styles.sheetRow} onPress={replyToActionMessage}>
              <View style={styles.sheetIcon}>
                <BrandGradientFill />
                <ArrowBendUpLeft size={15} color="#FFFFFF" weight="bold" />
              </View>
              <Text style={styles.sheetRowText}>Reply</Text>
            </Pressable>
          ) : null}
          {actionMessage?.body ? (
            <Pressable style={styles.sheetRow} onPress={copyActionMessage}>
              <View style={styles.sheetIcon}>
                <BrandGradientFill />
                <Copy size={15} color="#FFFFFF" weight="bold" />
              </View>
              <Text style={styles.sheetRowText}>Copy text</Text>
            </Pressable>
          ) : null}
        </View>
      </MsModal>

      {/* Fullscreen media viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: MEDIA_BG }}>
          <Pressable style={styles.viewerClose} onPress={() => setViewer(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <X size={22} color={T.ACCENT_FG} weight="bold" />
          </Pressable>
          {viewer?.isVideo ? (
            <MsVideoPlayer videoId={`pm-${message?.id}-${viewer.uri.slice(-16)}`} uri={viewer.uri} fillContainer />
          ) : (
            <MsMediaLoader uri={viewer?.uri ?? ''} style={StyleSheet.absoluteFill} resizeMode="contain" accessibleLabel="" errorMessage="" fallback={null} />
          )}
        </View>
      </Modal>

      <MsAttachmentSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} onResult={onAttachmentPicked} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },

  // ── Action sheets ─────────────────────────────────────────────────────────
  sheetBody: { gap: 2, paddingBottom: 4 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sheetIcon: {
    width: 34, height: 34, borderRadius: 17,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetIconDanger: { backgroundColor: alpha(T.SECONDARY, 0.15) },
  sheetRowText: { color: T.TEXT, fontSize: 14.5, fontFamily: T.FONT.semibold, flexShrink: 1 },
  sheetRowSub: { color: T.TEXT_3, fontSize: 11.5, fontFamily: T.FONT.regular, marginTop: 2 },
  sheetRowDanger: { color: T.SECONDARY },

  // Floating composer overlay — anchored to the bottom, outside the message
  // scroll, so the chat background shows through and it aligns with the last
  // message. It rides the keyboard via its own KeyboardAvoidingView.
  composerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },

  viewerClose: {
    position: 'absolute',
    top: 58,
    right: 18,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
