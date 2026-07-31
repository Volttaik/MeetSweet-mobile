/**
 * MsChatInputBar — full-featured MeetSweet chat input toolbar.
 *
 * Features:
 *  - Pill-shaped text input (emoji + text)
 *  - Attachment button → image / video / camera / document / audio
 *  - Voice recording (hold mic, release to send)
 *  - Mic ↔ Send animated transition
 *  - Reply preview bar
 *  - Edit mode banner
 *
 * Connects to: existing upload system, existing MsAttachmentSheet
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowBendUpLeft,
  Microphone,
  PaperPlaneTilt,
  Paperclip,
  Smiley,
  X,
} from 'phosphor-react-native';
import { Audio } from 'expo-av';
import { T } from '@/constants/theme';
import type { ReplyMessage } from '@kesha-antonov/react-native-chat';
import type { MsMessage } from '@/types/chat-message';

export interface PendingVoice {
  uri: string;
  duration: number;
}

export interface SendPayload {
  text?: string;
  voice?: PendingVoice;
  isPaid?: boolean;
}

interface Props {
  text: string;
  onChangeText: (text: string) => void;
  onSend: (payload: SendPayload) => void;
  replyMessage?: ReplyMessage | null;
  onClearReply?: () => void;
  editingMessage?: MsMessage | null;
  onCancelEdit?: () => void;
  onEmojiPress?: () => void;
  onAttachPress?: () => void;
  disabled?: boolean;
}

const ICON_ANIM = 180;

export function MsChatInputBar({
  text,
  onChangeText,
  onSend,
  replyMessage,
  onClearReply,
  editingMessage,
  onCancelEdit,
  onEmojiPress,
  onAttachPress,
  disabled,
}: Props) {
  const hasText = text.trim().length > 0;
  const isEditing = !!editingMessage;

  const sendAnim = useRef(new Animated.Value(hasText ? 1 : 0)).current;
  const micAnim = useRef(new Animated.Value(hasText ? 0 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sendAnim, { toValue: hasText ? 1 : 0, duration: ICON_ANIM, useNativeDriver: true }),
      Animated.timing(micAnim, { toValue: hasText ? 0 : 1, duration: ICON_ANIM, useNativeDriver: true }),
    ]).start();
  }, [hasText]);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordDuration(0);
      timerRef.current = setInterval(() => setRecordDuration((d) => d + 1), 1000);
    } catch {
      /* permission denied */
    }
  }, []);

  const stopRecording = useCallback(async (cancel = false) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    if (!recordingRef.current) return;
    const rec = recordingRef.current;
    recordingRef.current = null;
    try {
      await rec.stopAndUnloadAsync();
      if (!cancel) {
        const uri = rec.getURI();
        const status = await rec.getStatusAsync();
        const duration = Math.floor((status.durationMillis ?? 0) / 1000);
        if (uri && duration > 0) {
          onSend({ voice: { uri, duration } });
        }
      }
    } catch {
      /* ignore */
    }
    setRecordDuration(0);
  }, [onSend]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ text: trimmed });
    onChangeText('');
  }, [text, onSend, onChangeText]);

  function fmtDur(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  return (
    <View style={styles.root}>
      {/* Edit banner */}
      {isEditing && (
        <View style={styles.contextBar}>
          <PaperPlaneTilt size={14} color={T.SUCCESS} />
          <Text style={styles.contextBarText} numberOfLines={1}>
            Editing: {editingMessage?.text ?? ''}
          </Text>
          <TouchableOpacity onPress={onCancelEdit} hitSlop={8}>
            <X size={16} color={T.TEXT_3} />
          </TouchableOpacity>
        </View>
      )}

      {/* Reply bar */}
      {replyMessage && !isEditing && (
        <View style={styles.contextBar}>
          <ArrowBendUpLeft size={14} color={T.ACCENT} />
          <Text style={styles.contextBarText} numberOfLines={1}>
            Replying to {replyMessage.user?.name ?? 'message'}
          </Text>
          <TouchableOpacity onPress={onClearReply} hitSlop={8}>
            <X size={16} color={T.TEXT_3} />
          </TouchableOpacity>
        </View>
      )}

      {isRecording ? (
        <View style={styles.row}>
          <View style={[styles.pill, styles.pillRec]}>
            <View style={styles.recDot} />
            <Text style={styles.recTimer}>{fmtDur(recordDuration)}</Text>
            <Text style={styles.recHint}>Tap ✕ to cancel</Text>
          </View>
          <TouchableOpacity
            style={[styles.rightBtn, styles.actionBtn, styles.actionBtnRec]}
            onPress={() => stopRecording(true)}
          >
            <X size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.row}>
          <TouchableOpacity style={styles.sideBtn} onPress={onAttachPress} activeOpacity={0.7} disabled={disabled}>
            <Paperclip size={22} color={T.TEXT_2} />
          </TouchableOpacity>

          <View style={styles.pill}>
            <TouchableOpacity style={styles.pillIcon} onPress={onEmojiPress} activeOpacity={0.7} disabled={disabled}>
              <Smiley size={22} color={T.TEXT_2} />
            </TouchableOpacity>
            <TextInput
              value={text}
              onChangeText={onChangeText}
              placeholder={isEditing ? 'Edit message…' : 'Message…'}
              placeholderTextColor={T.TEXT_3}
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!disabled}
              selectionColor="#888"
              underlineColorAndroid="transparent"
              blurOnSubmit={false}
              returnKeyType="default"
              keyboardAppearance="dark"
            />
          </View>

          <View style={styles.rightBtnWrap}>
            <Animated.View style={[styles.btnAbsolute, { opacity: micAnim, transform: [{ scale: micAnim }] }]} pointerEvents={hasText ? 'none' : 'auto'}>
              <Pressable
                style={[styles.rightBtn, styles.actionBtn]}
                onLongPress={startRecording}
                onPressOut={() => { if (isRecording) stopRecording(false); }}
                delayLongPress={250}
              >
                <Microphone size={20} color="#fff" weight="fill" />
              </Pressable>
            </Animated.View>
            <Animated.View style={[styles.btnAbsolute, { opacity: sendAnim, transform: [{ scale: sendAnim }] }]} pointerEvents={hasText ? 'auto' : 'none'}>
              <TouchableOpacity
                style={[styles.rightBtn, styles.actionBtn, isEditing && styles.actionBtnEdit]}
                onPress={handleSend}
                activeOpacity={0.8}
                disabled={!hasText || disabled}
              >
                <PaperPlaneTilt size={20} color="#fff" weight="fill" />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: T.BG },

  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 8,
    backgroundColor: T.SURFACE_2,
  },
  contextBarText: {
    flex: 1,
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },

  sideBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 50,
  },
  pillRec: {
    gap: 10,
    paddingHorizontal: 16,
    backgroundColor: T.SURFACE_2,
  },
  pillIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
    includeFontPadding: false,
    maxHeight: 120,
  },

  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  recTimer: { fontSize: 15, fontFamily: T.FONT.medium, color: T.TEXT },
  recHint: { flex: 1, fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_3 },

  rightBtnWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  btnAbsolute: { position: 'absolute' },
  rightBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    backgroundColor: T.ACCENT,
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  actionBtnRec: { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
  actionBtnEdit: { backgroundColor: T.SUCCESS, shadowColor: T.SUCCESS },
});
