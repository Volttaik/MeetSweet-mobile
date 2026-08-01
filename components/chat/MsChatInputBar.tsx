/**
 * MsChatInputBar — production-quality MeetSweet messaging composer.
 *
 * Layout
 * ──────
 *   Empty  : [Sticker] [Input Pill] [Attach] [Camera] [Mic]
 *   Typing : [Sticker] [Input Pill] [Attach] [Camera→0] [Send]
 *
 * Composer staging model
 * ──────────────────────
 * NOTHING sends automatically. The input is the central holding area.
 * • Emoji        → inserted into text field (never auto-send)
 * • Sticker img  → staged above input as thumbnail (press send to dispatch)
 * • GIF          → staged above input as thumbnail (press send to dispatch)
 * • Voice note   → compact playback bar above input (press send to dispatch)
 * • Image/Video  → thumbnail above input; pen icon → full MsAttachmentPreview
 * • Document     → file chip above input (press send to dispatch)
 *
 * Keyboard behaviour
 * ──────────────────
 * • Tracks keyboard height via Keyboard events.
 * • Sticker panel open → keyboard dismissed; panel fills same height.
 * • Focusing input while panel is open → panel closes.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
} from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowBendUpLeft,
  ArrowUp,
  Camera,
  File,
  Keyboard as KeyboardIcon,
  Lock,
  Microphone,
  PaperPlaneRight,
  Paperclip,
  Pause,
  PencilSimple,
  Play,
  SmileySticker,
  Square,
  X,
} from 'phosphor-react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { T } from '@/constants/theme';
import type { ReplyMessage } from '@kesha-antonov/react-native-chat';
import type { MsMessage } from '@/types/chat-message';
import { MsComposerPanel, type PanelTab } from './MsComposerPanel';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PendingVoice {
  uri: string;
  duration: number;
}

/** Inline attachment staged above the input before sending */
export interface InlineAttachment {
  type: 'image' | 'video' | 'audio' | 'voice' | 'document';
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
  duration?: number;
}

/** What the parent receives when send is pressed with an attachment */
export interface AttachmentSendPayload extends InlineAttachment {
  caption?: string;
}

export interface SendPayload {
  text?: string;
  voice?: PendingVoice;
  isPaid?: boolean;
  /** Emoji character (text message) */
  sticker?: string;
  /** GIF or image sticker URL */
  gifUrl?: string;
  gifTitle?: string;
}

type RecordingState = 'idle' | 'active' | 'locked';

// ─── Constants ────────────────────────────────────────────────────────────────

const LONG_PRESS_DELAY   = 250;
const LOCK_THRESHOLD_Y   = -52;
const CANCEL_THRESHOLD_X = -72;
const ICON_ANIM_MS       = 180;
const WAVEFORM_BARS      = 16;
const DEFAULT_PANEL_H    = 300;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Animated pressable helper ────────────────────────────────────────────────

const IconBtn = memo(function IconBtn({
  onPress,
  onLongPress,
  disabled,
  style,
  hitSlop,
  children,
  panHandlers,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: any;
  hitSlop?: number;
  children: React.ReactNode;
  panHandlers?: any;
}) {
  const scaleA = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.spring(scaleA, {
      toValue: 0.82,
      useNativeDriver: true,
      damping: 14,
      stiffness: 380,
    }).start();

  const pressOut = () =>
    Animated.spring(scaleA, {
      toValue: 1,
      useNativeDriver: true,
      damping: 11,
      stiffness: 280,
    }).start();

  return (
    <Animated.View style={[{ transform: [{ scale: scaleA }] }, style]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        hitSlop={hitSlop ?? 6}
        {...(panHandlers ?? {})}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
});

// ─── VoiceCompactBar — compact audio preview above input ─────────────────────

const VoiceCompactBar = memo(function VoiceCompactBar({
  voice,
  onRemove,
}: {
  voice: PendingVoice;
  onRemove: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position,  setPosition]  = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => () => {
    soundRef.current?.stopAsync().catch(() => {});
    soundRef.current?.unloadAsync().catch(() => {});
  }, []);

  const togglePlay = async () => {
    try {
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
        const { sound } = await Audio.Sound.createAsync(
          { uri: voice.uri },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setPosition(Math.floor((status.positionMillis ?? 0) / 1000));
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPosition(0);
              soundRef.current?.unloadAsync().catch(() => {});
              soundRef.current = null;
            }
          },
        );
        soundRef.current = sound;
      } else {
        await soundRef.current.playAsync();
      }
      setIsPlaying(true);
    } catch {/* ignore */}
  };

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const barHeights = useRef([5,9,14,8,12,16,7,10,13,6,15,9,11,14,8,12,7,10,5,13,9,14,6,11,15,8,12,7,10,13]).current;

  return (
    <View style={sa.voiceBar}>
      <View style={sa.voiceIcon}>
        <Microphone size={15} color={T.ACCENT} weight="fill" />
      </View>
      {/* Static waveform */}
      <View style={sa.voiceWave}>
        {barHeights.slice(0, 22).map((h, i) => (
          <View
            key={i}
            style={[
              sa.voiceWaveBar,
              {
                height: h,
                backgroundColor: i / 22 <= (voice.duration > 0 ? position / voice.duration : 0)
                  ? T.ACCENT
                  : 'rgba(255,255,255,0.15)',
              },
            ]}
          />
        ))}
      </View>
      <Text style={sa.voiceDuration}>{fmt(isPlaying ? position : voice.duration)}</Text>
      <TouchableOpacity style={sa.voicePlayBtn} onPress={togglePlay} activeOpacity={0.8}>
        {isPlaying
          ? <Pause size={13} color="#fff" weight="fill" />
          : <Play  size={13} color="#fff" weight="fill" />
        }
      </TouchableOpacity>
      <TouchableOpacity style={sa.attachRemoveBtn} onPress={onRemove} hitSlop={6}>
        <X size={12} color={T.TEXT_3} />
      </TouchableOpacity>
    </View>
  );
});

// ─── MediaAttachmentBar — image / video / gif / sticker / document ────────────

const MediaAttachmentBar = memo(function MediaAttachmentBar({
  attachment,
  onRemove,
  onEdit,
}: {
  attachment: InlineAttachment | { type: 'gif'; uri: string; title: string };
  onRemove: () => void;
  onEdit?: () => void;
}) {
  const isMedia  = attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'gif';
  const isDoc    = attachment.type === 'document';
  const isAudio  = attachment.type === 'audio';
  const fileName = (attachment as InlineAttachment).fileName ?? '';
  const fileSize = (attachment as InlineAttachment).fileSize;

  return (
    <View style={sa.mediaBar}>
      {isMedia && (
        <View style={sa.mediaThumbnailWrap}>
          <Image
            source={{ uri: attachment.uri }}
            style={sa.mediaThumbnail}
            contentFit="cover"
            transition={120}
          />
          {attachment.type === 'video' && (
            <View style={sa.videoOverlay}>
              <Play size={12} color="#fff" weight="fill" />
            </View>
          )}
          {attachment.type === 'gif' && (
            <View style={sa.gifBadge}>
              <Text style={sa.gifBadgeText}>GIF</Text>
            </View>
          )}
        </View>
      )}

      {(isDoc || isAudio) && (
        <View style={sa.docIconWrap}>
          <File size={20} color={T.ACCENT} weight="duotone" />
        </View>
      )}

      <View style={sa.mediaInfo}>
        <Text style={sa.mediaName} numberOfLines={1}>
          {attachment.type === 'gif'
            ? ((attachment as any).title || 'GIF')
            : attachment.type === 'image' ? 'Photo'
            : attachment.type === 'video' ? 'Video'
            : fileName}
        </Text>
        {fileSize ? (
          <Text style={sa.mediaSize}>{formatFileSize(fileSize)}</Text>
        ) : null}
      </View>

      {onEdit && (
        <TouchableOpacity style={sa.editBtn} onPress={onEdit} hitSlop={6}>
          <PencilSimple size={14} color={T.TEXT_2} />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={sa.attachRemoveBtn} onPress={onRemove} hitSlop={6}>
        <X size={12} color={T.TEXT_3} />
      </TouchableOpacity>
    </View>
  );
});

// ─── Component props ──────────────────────────────────────────────────────────

interface Props {
  text: string;
  onChangeText: (text: string) => void;
  onSend: (payload: SendPayload) => void;
  onVoiceReady?: (voice: PendingVoice) => void; // kept for compat, internal preview preferred
  replyMessage?: ReplyMessage | null;
  onClearReply?: () => void;
  editingMessage?: MsMessage | null;
  onCancelEdit?: () => void;
  onAttachPress?: () => void;
  onCameraPress?: () => void;
  disabled?: boolean;
  /** @deprecated — use internal panel */
  onEmojiPress?: () => void;

  // ── Inline attachment staging (image/video/doc from picker) ──────────────
  /** Pending media attachment to preview above the input */
  inlineAttachment?: InlineAttachment | null;
  /** Called when user taps ✕ on inline attachment */
  onRemoveInlineAttachment?: () => void;
  /** Called when user taps ✏ on inline attachment — open full preview */
  onEditInlineAttachment?: () => void;
  /** Called when send is pressed while an inline attachment is staged */
  onSendWithAttachment?: (payload: AttachmentSendPayload) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MsChatInputBar = memo(function MsChatInputBar({
  text,
  onChangeText,
  onSend,
  replyMessage,
  onClearReply,
  editingMessage,
  onCancelEdit,
  onAttachPress,
  onCameraPress,
  disabled,
  inlineAttachment,
  onRemoveInlineAttachment,
  onEditInlineAttachment,
  onSendWithAttachment,
}: Props) {
  const isEditing = !!editingMessage;
  const insets    = useSafeAreaInsets();

  // ── Composer staged items ─────────────────────────────────────────────────
  const [pendingVoice, setPendingVoice] = useState<PendingVoice | null>(null);
  const [pendingGif,   setPendingGif]   = useState<{ url: string; title: string } | null>(null);

  const hasText    = text.trim().length > 0;
  const hasContent = hasText || !!pendingGif || !!pendingVoice || !!inlineAttachment;

  // ── Panel state ────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<PanelTab | 'none'>('none');
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_H);
  const inputRef = useRef<TextInput>(null);

  // ── Keyboard tracking ─────────────────────────────────────────────────────
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => {
      if (e.endCoordinates.height > 100) setPanelHeight(e.endCoordinates.height);
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));

    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const openPanel = useCallback((tab: PanelTab) => {
    Keyboard.dismiss();
    setActivePanel(tab);
  }, []);

  const closePanel = useCallback(() => setActivePanel('none'), []);

  const handleStickerBtnPress = useCallback(() => {
    if (activePanel !== 'none') {
      closePanel();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      openPanel('emoji');
    }
  }, [activePanel, openPanel, closePanel]);

  const handleInputFocus = useCallback(() => {
    if (activePanel !== 'none') closePanel();
  }, [activePanel, closePanel]);

  // ── Mic ↔ Send spring animation ────────────────────────────────────────────
  const sendAnim = useRef(new Animated.Value(hasContent ? 1 : 0)).current;
  const micAnim  = useRef(new Animated.Value(hasContent ? 0 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(sendAnim, {
        toValue: hasContent ? 1 : 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 320,
        mass: 0.8,
      }),
      Animated.spring(micAnim, {
        toValue: hasContent ? 0 : 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 320,
        mass: 0.8,
      }),
    ]).start();
  }, [hasContent]);

  // ── Camera collapse — still driven by hasText ──────────────────────────────
  const cameraWidthAnim   = useRef(new Animated.Value(hasText ? 0 : 44)).current;
  const cameraOpacityAnim = useRef(new Animated.Value(hasText ? 0 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cameraWidthAnim, {
        toValue: hasText ? 0 : 44,
        duration: 220,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: false,
      }),
      Animated.timing(cameraOpacityAnim, {
        toValue: hasText ? 0 : 1,
        duration: 180,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: false,
      }),
    ]).start();
  }, [hasText]);

  // ── Reply bar animation ────────────────────────────────────────────────────
  const replySlide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(replySlide, {
      toValue: replyMessage ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [!!replyMessage]);

  // ── Attachment bar animation ───────────────────────────────────────────────
  // useNativeDriver: false because we animate height
  const attachBarAnim = useRef(new Animated.Value(0)).current;
  const attachBarOpacity = useRef(new Animated.Value(0)).current;
  const hasAttachment = !!(pendingVoice || pendingGif || inlineAttachment);

  useEffect(() => {
    if (hasAttachment) {
      Animated.parallel([
        Animated.spring(attachBarAnim, {
          toValue: 1,
          useNativeDriver: false,
          damping: 20,
          stiffness: 280,
        }),
        Animated.timing(attachBarOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(attachBarAnim, {
          toValue: 0,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(attachBarOpacity, {
          toValue: 0,
          duration: 120,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [hasAttachment]);

  // ── Recording UI state ─────────────────────────────────────────────────────
  const [recState,   setRecState]   = useState<RecordingState>('idle');
  const [recSeconds, setRecSeconds] = useState(0);

  const recRef = useRef<{
    state:          RecordingState;
    recording:      Audio.Recording | null;
    intervalId:     ReturnType<typeof setInterval> | null;
    longPressTimer: ReturnType<typeof setTimeout>  | null;
    seconds:        number;
  }>({
    state:          'idle',
    recording:      null,
    intervalId:     null,
    longPressTimer: null,
    seconds:        0,
  });

  const syncState = (s: RecordingState) => {
    recRef.current.state = s;
    setRecState(s);
  };

  // ── Mic press animation ────────────────────────────────────────────────────
  const micPressScale = useRef(new Animated.Value(1)).current;
  const micGlowAnim   = useRef(new Animated.Value(0)).current;

  const animateMicPressIn = () => {
    Animated.parallel([
      Animated.spring(micPressScale, { toValue: 0.88, useNativeDriver: true, damping: 12, stiffness: 300 }),
      Animated.timing(micGlowAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  const animateMicPressOut = () => {
    Animated.parallel([
      Animated.spring(micPressScale, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 220 }),
      Animated.timing(micGlowAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  // ── Send press animation ───────────────────────────────────────────────────
  const sendPressScale = useRef(new Animated.Value(1)).current;

  const animateSendPress = useCallback(() => {
    Animated.sequence([
      Animated.spring(sendPressScale, { toValue: 0.84, useNativeDriver: true, damping: 10, stiffness: 340 }),
      Animated.spring(sendPressScale, { toValue: 1,    useNativeDriver: true, damping: 8,  stiffness: 240 }),
    ]).start();
  }, [sendPressScale]);

  // ── Hint animations (voice recording) ─────────────────────────────────────
  const lockHintAnim   = useRef(new Animated.Value(0)).current;
  const cancelHintAnim = useRef(new Animated.Value(0)).current;
  const lockedAnim     = useRef(new Animated.Value(0)).current;

  // ── Waveform bars ──────────────────────────────────────────────────────────
  const barAnims = useRef(
    Array.from({ length: WAVEFORM_BARS }, () => new Animated.Value(1)),
  ).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = () => {
    pulseLoop.current?.stop();
    const loops = barAnims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 35),
          Animated.timing(a, { toValue: 1.8, duration: 320 + (i % 4) * 50, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(a, { toValue: 1,   duration: 320 + (i % 4) * 50, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    );
    pulseLoop.current = Animated.parallel(loops);
    pulseLoop.current.start();
  };

  const stopPulse = () => {
    pulseLoop.current?.stop();
    pulseLoop.current = null;
    barAnims.forEach((a) => a.setValue(1));
  };

  // ── Recording actions ──────────────────────────────────────────────────────

  const _startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recRef.current.recording = recording;
      recRef.current.seconds   = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Animated.timing(micGlowAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      lockHintAnim.setValue(0);
      cancelHintAnim.setValue(0);
      lockedAnim.setValue(0);
      recRef.current.intervalId = setInterval(() => {
        recRef.current.seconds += 1;
        setRecSeconds(recRef.current.seconds);
      }, 1000);
      syncState('active');
      setRecSeconds(0);
      startPulse();
    } catch {/* permission denied */}
  };

  const _stopRecording = async (cancel = false) => {
    if (recRef.current.intervalId) { clearInterval(recRef.current.intervalId); recRef.current.intervalId = null; }
    stopPulse();
    animateMicPressOut();
    const rec = recRef.current.recording;
    recRef.current.recording = null;
    syncState('idle');
    setRecSeconds(0);
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      if (!cancel) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const uri    = rec.getURI();
        const status = await rec.getStatusAsync();
        const dur    = Math.floor((status.durationMillis ?? 0) / 1000);
        if (uri && dur > 0) {
          // Stage as compact preview above input — user presses send to dispatch
          setPendingVoice({ uri, duration: dur });
        }
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } catch {/* ignore */}
  };

  const _lockRecording = () => {
    syncState('locked');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Animated.timing(lockedAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  };

  // ── PanResponder for mic ───────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, _gs) => recRef.current.state !== 'idle',

      onPanResponderGrant: () => {
        if (recRef.current.state !== 'idle') return;
        Animated.spring(micPressScale, { toValue: 0.88, useNativeDriver: true, damping: 12, stiffness: 300 }).start();
        Animated.timing(micGlowAnim, { toValue: 0.6, duration: 100, useNativeDriver: true }).start();
        Haptics.selectionAsync().catch(() => {});
        recRef.current.longPressTimer = setTimeout(() => {
          recRef.current.longPressTimer = null;
          _startRecording();
        }, LONG_PRESS_DELAY);
      },

      onPanResponderMove: (_e, gs) => {
        if (recRef.current.state !== 'active') return;
        lockHintAnim.setValue(Math.min(1, Math.max(0, -gs.dy / Math.abs(LOCK_THRESHOLD_Y))));
        if (gs.dy > -20) {
          cancelHintAnim.setValue(Math.min(1, Math.max(0, -gs.dx / Math.abs(CANCEL_THRESHOLD_X))));
        }
      },

      onPanResponderRelease: (_e, gs) => {
        if (recRef.current.longPressTimer) {
          clearTimeout(recRef.current.longPressTimer);
          recRef.current.longPressTimer = null;
          animateMicPressOut();
          return;
        }
        if (recRef.current.state !== 'active') return;
        if (gs.dy <= LOCK_THRESHOLD_Y) _lockRecording();
        else if (gs.dx <= CANCEL_THRESHOLD_X) _stopRecording(true);
        else _stopRecording(false);
      },

      onPanResponderTerminate: () => {
        if (recRef.current.longPressTimer) {
          clearTimeout(recRef.current.longPressTimer);
          recRef.current.longPressTimer = null;
        }
        animateMicPressOut();
        if (recRef.current.state === 'active') _stopRecording(true);
      },
    }),
  ).current;

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (recRef.current.longPressTimer) clearTimeout(recRef.current.longPressTimer);
    if (recRef.current.intervalId)     clearInterval(recRef.current.intervalId);
    stopPulse();
    recRef.current.recording?.stopAndUnloadAsync().catch(() => {});
  }, []);

  // ── Send handler — multi-path ──────────────────────────────────────────────
  const handleSend = useCallback(() => {
    animateSendPress();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // 1. Inline attachment (image/video/doc from picker)
    if (inlineAttachment && onSendWithAttachment) {
      onSendWithAttachment({
        ...inlineAttachment,
        caption: text.trim() || undefined,
      });
      onChangeText('');
      return;
    }

    // 2. Staged GIF or image sticker
    if (pendingGif) {
      onSend({ gifUrl: pendingGif.url, gifTitle: text.trim() || pendingGif.title });
      setPendingGif(null);
      if (text.trim()) onChangeText('');
      return;
    }

    // 3. Staged voice note
    if (pendingVoice) {
      onSend({ voice: pendingVoice });
      setPendingVoice(null);
      return;
    }

    // 4. Plain text
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ text: trimmed });
    onChangeText('');
  }, [text, inlineAttachment, pendingGif, pendingVoice, onSend, onChangeText, onSendWithAttachment, animateSendPress]);

  // ── Emoji → insert into text (NOT send) ───────────────────────────────────
  const handleEmojiInsert = useCallback((emoji: string) => {
    onChangeText(text + emoji);
    // Keep panel open so user can add more emoji
  }, [text, onChangeText]);

  // ── GIF / image sticker → stage above input (NOT send) ────────────────────
  const handleGifStage = useCallback((gifUrl: string, gifTitle: string) => {
    setPendingGif({ url: gifUrl, title: gifTitle });
    closePanel();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [closePanel]);

  function fmtSecs(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const panelIsOpen = activePanel !== 'none';
  const stickerBtnIcon = panelIsOpen
    ? <KeyboardIcon size={22} color={T.TEXT_2} weight="regular" />
    : <SmileySticker size={22} color={T.TEXT_2} weight="regular" />;

  const bottomInset = (!keyboardVisible && !panelIsOpen) ? insets.bottom : 0;

  // ── LOCKED state ───────────────────────────────────────────────────────────
  if (recState === 'locked') {
    return (
      <View style={s.root} pointerEvents="box-none">
        <Animated.View
          style={[
            s.lockBadge,
            { opacity: lockedAnim, transform: [{ scale: lockedAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
          ]}
          pointerEvents="none"
        >
          <Lock size={12} color={T.ACCENT} weight="fill" />
          <Text style={s.lockBadgeText}>Locked</Text>
        </Animated.View>
        <View style={s.lockedRow}>
          <View style={s.lockedWave}>
            {barAnims.map((a, i) => (
              <Animated.View key={i} style={[s.lockedBar, { transform: [{ scaleY: a }] }]} />
            ))}
          </View>
          <Text style={s.lockedTimer}>{fmtSecs(recSeconds)}</Text>
          <TouchableOpacity style={s.lockedCancel} onPress={() => _stopRecording(true)} activeOpacity={0.8}>
            <X size={16} color={T.TEXT_2} />
          </TouchableOpacity>
          <TouchableOpacity style={s.lockedStop} onPress={() => _stopRecording(false)} activeOpacity={0.85}>
            <Square size={14} color="#fff" weight="fill" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingBottom: bottomInset }]}>

      {/* ── Edit banner ──────────────────────────────────────────────────── */}
      {isEditing && (
        <View style={s.contextBar}>
          <PaperPlaneRight size={14} color={T.SUCCESS} />
          <Text style={s.contextBarText} numberOfLines={1}>
            Editing: {editingMessage?.text ?? ''}
          </Text>
          <TouchableOpacity onPress={onCancelEdit} hitSlop={8}>
            <X size={16} color={T.TEXT_3} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Reply bar ────────────────────────────────────────────────────── */}
      {replyMessage && !isEditing ? (
        <Animated.View
          style={[
            s.contextBar,
            {
              opacity:   replySlide,
              transform: [{ translateY: replySlide.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
            },
          ]}
        >
          <ArrowBendUpLeft size={14} color={T.ACCENT} />
          <Text style={s.contextBarText} numberOfLines={1}>
            Replying to {replyMessage.user?.name ?? 'message'}
          </Text>
          <TouchableOpacity onPress={onClearReply} hitSlop={8}>
            <X size={16} color={T.TEXT_3} />
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* ── Attachment staging bar ────────────────────────────────────────── */}
      <Animated.View
        style={[
          s.attachmentBarWrap,
          {
            maxHeight: attachBarAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 72] }),
            opacity: attachBarOpacity,
          },
        ]}
        pointerEvents={hasAttachment ? 'auto' : 'none'}
      >
        {pendingVoice && (
          <VoiceCompactBar
            voice={pendingVoice}
            onRemove={() => setPendingVoice(null)}
          />
        )}
        {!pendingVoice && pendingGif && (
          <MediaAttachmentBar
            attachment={{ type: 'gif', uri: pendingGif.url, title: pendingGif.title, mimeType: 'image/gif', fileName: 'gif' }}
            onRemove={() => setPendingGif(null)}
          />
        )}
        {!pendingVoice && !pendingGif && inlineAttachment && (
          <MediaAttachmentBar
            attachment={inlineAttachment}
            onRemove={onRemoveInlineAttachment}
            onEdit={inlineAttachment.type === 'image' || inlineAttachment.type === 'video' ? onEditInlineAttachment : undefined}
          />
        )}
      </Animated.View>

      {/* ── Input row ────────────────────────────────────────────────────── */}
      <View style={s.row}>

        {/* Left: Sticker / Keyboard toggle */}
        {recState === 'idle' ? (
          <IconBtn style={s.sideBtn} onPress={handleStickerBtnPress} disabled={disabled}>
            {stickerBtnIcon}
          </IconBtn>
        ) : <View style={s.sideBtn} />}

        {/* Input pill */}
        {recState === 'active' ? (
          <View style={[s.pill, s.pillRec]}>
            <View style={s.recDot} />
            <Text style={s.recTimer}>{fmtSecs(recSeconds)}</Text>
            <View style={s.recWave}>
              {barAnims.map((a, i) => (
                <Animated.View key={i} style={[s.recBar, { transform: [{ scaleY: a }] }]} />
              ))}
            </View>
            <Animated.Text
              style={[
                s.slideHint,
                { opacity: cancelHintAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ]}
            >
              ← cancel
            </Animated.Text>
          </View>
        ) : (
          <View style={s.pill}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={onChangeText}
              onFocus={handleInputFocus}
              placeholder={isEditing ? 'Edit message…' : 'Message…'}
              placeholderTextColor={T.TEXT_3}
              style={s.input}
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
        )}

        {/* Attach */}
        {recState === 'idle' ? (
          <IconBtn style={s.sideBtn} onPress={onAttachPress} disabled={disabled}>
            <Paperclip size={22} color={T.TEXT_2} />
          </IconBtn>
        ) : null}

        {/* Camera — collapses when typing */}
        {recState === 'idle' ? (
          <Animated.View
            style={{
              width:   cameraWidthAnim,
              opacity: cameraOpacityAnim,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
            pointerEvents={hasText ? 'none' : 'auto'}
          >
            <IconBtn style={s.cameraBtn} onPress={onCameraPress} disabled={disabled || hasText}>
              <Camera size={22} color={T.TEXT_2} />
            </IconBtn>
          </Animated.View>
        ) : null}

        {/* Right: Mic / Send */}
        <View style={s.rightBtnWrap}>

          {/* Send button */}
          {recState === 'idle' ? (
            <Animated.View
              style={[
                s.btnAbsolute,
                {
                  opacity: sendAnim,
                  transform: [{ scale: Animated.multiply(sendAnim, sendPressScale) }],
                },
              ]}
              pointerEvents={hasContent ? 'auto' : 'none'}
            >
              <TouchableOpacity
                style={[s.rightBtn, s.actionBtn, isEditing && s.actionBtnEdit]}
                onPress={handleSend}
                activeOpacity={0.88}
                disabled={!hasContent || disabled}
              >
                <PaperPlaneRight size={20} color="#fff" weight="fill" />
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {/* Mic button */}
          {!hasContent || recState !== 'idle' ? (
            <Animated.View
              style={[
                s.btnAbsolute,
                recState === 'idle' && {
                  opacity: micAnim,
                  transform: [{ scale: Animated.multiply(micAnim, micPressScale) }],
                },
              ]}
            >
              {/* Lock hint */}
              {recState === 'active' ? (
                <Animated.View style={[s.lockHint, { opacity: lockHintAnim }]} pointerEvents="none">
                  <ArrowUp size={13} color={T.TEXT_3} />
                  <Text style={s.lockHintText}>Lock</Text>
                </Animated.View>
              ) : null}

              {/* Mic glow */}
              {recState === 'idle' && (
                <Animated.View style={[s.micGlow, { opacity: micGlowAnim }]} pointerEvents="none" />
              )}

              {/* Mic view with PanResponder */}
              <Animated.View
                style={[
                  s.rightBtn,
                  s.actionBtn,
                  recState === 'active' && s.actionBtnRec,
                  recState === 'idle' && { transform: [{ scale: micPressScale }] },
                ]}
                {...panResponder.panHandlers}
              >
                {recState === 'active'
                  ? <View style={s.recDotSmall} />
                  : <Microphone size={21} color="#fff" weight="fill" />
                }
              </Animated.View>
            </Animated.View>
          ) : null}
        </View>
      </View>

      {/* ── Sticker / GIF / Emoji panel ───────────────────────────────────── */}
      <MsComposerPanel
        isOpen={panelIsOpen}
        panelHeight={panelHeight}
        activeTab={activePanel === 'none' ? 'emoji' : activePanel}
        onTabChange={setActivePanel}
        onStickerPress={handleEmojiInsert}
        onGifPress={handleGifStage}
      />
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
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

  // Attachment staging bar
  attachmentBarWrap: {
    overflow: 'hidden',
    backgroundColor: T.BG,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },

  sideBtn: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cameraBtn: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 5,
    minHeight: 48,
  },
  pillRec: {
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: T.SURFACE_2,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingTop: Platform.OS === 'ios' ? 7 : 6,
    paddingBottom: Platform.OS === 'ios' ? 7 : 6,
    includeFontPadding: false,
    textAlignVertical: 'center',
    maxHeight: 130,
  },

  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#EF4444', flexShrink: 0 },
  recDotSmall: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  recTimer: { fontSize: 15, fontFamily: T.FONT.medium, color: T.TEXT, flexShrink: 0, minWidth: 36 },
  recWave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 22, overflow: 'hidden' },
  recBar: { flex: 1, minWidth: 2, height: 10, borderRadius: 1.5, backgroundColor: T.ACCENT, opacity: 0.7 },
  slideHint: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, flexShrink: 0 },

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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  actionBtnRec:  { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
  actionBtnEdit: { backgroundColor: T.SUCCESS,  shadowColor: T.SUCCESS  },

  micGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: T.ACCENT,
    top: -8,
    left: -8,
    zIndex: -1,
  },

  lockHint: {
    position: 'absolute',
    top: -36,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 1,
    zIndex: 10,
  },
  lockHintText: { fontSize: 9, fontFamily: T.FONT.medium, color: T.TEXT_3, letterSpacing: 0.3 },

  lockBadge: {
    position: 'absolute',
    top: -28,
    alignSelf: 'flex-end',
    marginRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.SURFACE_2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    zIndex: 10,
  },
  lockBadgeText: { fontSize: 10, fontFamily: T.FONT.medium, color: T.ACCENT },

  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: T.SURFACE,
  },
  lockedWave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 26, overflow: 'hidden' },
  lockedBar: { flex: 1, minWidth: 2, height: 12, borderRadius: 1.5, backgroundColor: T.ACCENT, opacity: 0.65 },
  lockedTimer: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT, flexShrink: 0, minWidth: 38, textAlign: 'right' },
  lockedCancel: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  lockedStop: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

// ── Attachment bar styles ────────────────────────────────────────────────────

const sa = StyleSheet.create({
  // Voice compact bar
  voiceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: T.SURFACE,
    marginHorizontal: 10,
    marginTop: 6,
    borderRadius: T.RADIUS.pill,
  },
  voiceIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${T.ACCENT}22`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voiceWave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 20,
  },
  voiceWaveBar: {
    width: 2.5,
    borderRadius: 2,
    minHeight: 3,
  },
  voiceDuration: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
    flexShrink: 0,
    minWidth: 32,
    textAlign: 'right',
  },
  voicePlayBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Media / attachment bar
  mediaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: T.SURFACE,
    marginHorizontal: 10,
    marginTop: 6,
    borderRadius: 16,
  },
  mediaThumbnailWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
    flexShrink: 0,
    position: 'relative',
  },
  mediaThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gifBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  gifBadgeText: {
    fontSize: 7,
    fontFamily: T.FONT.bold,
    color: '#fff',
    letterSpacing: 0.3,
  },
  docIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: `${T.ACCENT}18`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mediaInfo: {
    flex: 1,
    gap: 2,
  },
  mediaName: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  mediaSize: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  attachRemoveBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
