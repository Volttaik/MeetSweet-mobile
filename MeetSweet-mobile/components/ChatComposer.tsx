/**
 * ChatComposer — the private-message input, as a standalone floating overlay.
 *
 * Rendered on top of the chat thread as an absolutely-positioned bar at the
 * bottom, OUTSIDE the message scroll view, so the chat background shows
 * through completely around it. It rides the keyboard on iOS (the parent
 * wraps it in a KeyboardAvoidingView) and floats just below the newest
 * message rather than sitting inside a solid bar.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PaperPlaneRight, Plus, X } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import type { PrivateMessage } from '@/services/private-inbox';

interface ChatComposerProps {
  body: string;
  onChangeBody: (v: string) => void;
  amRecipient: boolean;
  ownId?: string | null;
  replyTo: PrivateMessage | null;
  onCancelReply: () => void;
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
  onAttach: () => void;
  bottomInset: number;
}

export function ChatComposer({
  body,
  onChangeBody,
  amRecipient,
  ownId,
  replyTo,
  onCancelReply,
  canSend,
  sending,
  onSend,
  onAttach,
  bottomInset,
}: ChatComposerProps) {
  return (
    <View style={[styles.composer, { paddingBottom: Math.max(bottomInset, 10) }]}>
      {replyTo ? (
        <View style={styles.replyToBanner}>
          <View style={styles.replyToAccent} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.replyToName} numberOfLines={1}>
              Replying to {replyTo.sender_id === ownId ? 'yourself' : (replyTo.sender_name ?? replyTo.sender_username ?? 'message')}
            </Text>
            <Text style={styles.replyToBody} numberOfLines={1}>
              {replyTo.body || (replyTo.attachments.length ? 'Attachment' : '')}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={onCancelReply} accessibilityRole="button" accessibilityLabel="Cancel reply">
            <X size={15} color={T.TEXT_3} />
          </Pressable>
        </View>
      ) : null}

      {/* Input row — pill + attach + gradient send */}
      <View style={styles.inputRow}>
        <View style={styles.pill}>
          <TextInput
            value={body}
            onChangeText={onChangeBody}
            multiline
            maxLength={5000}
            placeholder={amRecipient ? 'Write a reply…' : 'Write a follow-up…'}
            placeholderTextColor={T.TEXT_3}
            selectionColor={T.CARET}
            style={styles.input}
            underlineColorAndroid="transparent"
            textAlignVertical="center"
          />
        </View>

        <Pressable
          style={styles.attachBtn}
          onPress={onAttach}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Attach media"
        >
          <Plus size={20} color={T.TEXT_2} weight="bold" />
        </Pressable>

        <Pressable
          style={[styles.sendBtn, !canSend && styles.disabled]}
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <BrandGradientFill />
          {sending ? (
            <ActivityIndicator color={T.ACCENT_FG} />
          ) : (
            <PaperPlaneRight size={20} color={T.ACCENT_FG} weight="fill" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    // No solid band and no divider line — the bottom blends into the chat
    // background so the input pill simply floats at the foot of the thread.
    backgroundColor: 'transparent',
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  replyToBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER,
    overflow: 'hidden',
    marginBottom: 8,
  },
  replyToAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: T.ACCENT, flexShrink: 0 },
  replyToName: { color: T.PRIMARY_LIGHT, fontSize: 11, fontFamily: T.FONT.semibold },
  replyToBody: { color: T.TEXT_3, fontSize: 11.5, fontFamily: T.FONT.regular },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // Soft surface — no hard outline; a faint lift separates it from the chat
    // wallpaper so it reads as floating just above the thread.
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 14,
    minHeight: 46,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingTop: 8,
    paddingBottom: 8,
    includeFontPadding: false,
    maxHeight: 110,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  disabled: { opacity: 0.5 },
});