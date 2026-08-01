/**
 * MsChatInputBar — production-quality MeetSweet messaging composer.
 *
 * Layout
 * ──────
 *   Empty  : [Sticker] [Input Pill] [Attach] [Camera] [Mic]
 *   Typing : [Sticker] [Input Pill] [Attach] [Camera→0] [Send]
 *
 * Interaction patterns (ref: WhatsApp screenshots)
 * ─────────────────────────────────────────────────
 * • Camera button animates to 0 width + 0 opacity when user types.
 * • Mic morphs into Send (cross-fade + scale) when text is non-empty.
 * • Sticker button toggles the sticker/GIF panel; becomes keyboard icon
 *   when panel is open (tapping returns to normal keyboard).
 * • Sticker/GIF panel is embedded below this component's root View.
 *   When open it behaves exactly like the keyboard — same height, slides
 *   smoothly, pushes the message list upward.
 * • Native keyboard provides emoji via the OS emoji key — we do NOT
 *   bundle a custom emoji database.
 * • Voice recording: hold mic to record, slide up to lock, slide left
 *   to cancel. PanResponder owns the full gesture lifecycle.
 *
 * Keyboard behaviour
 * ──────────────────
 * • This component tracks keyboard height via Keyboard events.
 * • When the sticker panel opens the keyboard is dismissed first.
 * • Panel height matches the last-seen keyboard height.
 * • Focusing the input while the panel is open closes the panel.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowBendUpLeft,
  ArrowUp,
  Camera,
  Keyboard as KeyboardIcon,
  Lock,
  Microphone,
  PaperPlane,
  Paperclip,
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

export interface SendPayload {
  text?: string;
  voice?: PendingVoice;
  isPaid?: boolean;
  /** Sticker emoji */
  sticker?: string;
  /** GIF remote URL */
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

// ─── Component props ──────────────────────────────────────────────────────────

interface Props {
  text: string;
  onChangeText: (text: string) => void;
  onSend: (payload: SendPayload) => void;
  onVoiceReady?: (voice: PendingVoice) => void;
  replyMessage?: ReplyMessage | null;
  onClearReply?: () => void;
  editingMessage?: MsMessage | null;
  onCancelEdit?: () => void;
  onAttachPress?: () => void;
  onCameraPress?: () => void;
  disabled?: boolean;
  /** @deprecated — use internal panel; kept for API compat */
  onEmojiPress?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MsChatInputBar = memo(function MsChatInputBar({
  text,
  onChangeText,
  onSend,
  onVoiceReady,
  replyMessage,
  onClearReply,
  editingMessage,
  onCancelEdit,
  onAttachPress,
  onCameraPress,
  disabled,
}: Props) {
  const hasText   = text.trim().length > 0;
  const isEditing = !!editingMessage;
  const insets    = useSafeAreaInsets();

  // ── Panel state ────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<PanelTab | 'none'>('none');
  // PanelTab: 'emoji' | 'stickers' | 'gifs' | 'none'
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_H);
  const inputRef = useRef<TextInput>(null);

  // ── Keyboard visibility + height tracking ─────────────────────────────────
  // We track visibility so bottom safe-area padding is only applied when the
  // keyboard is hidden. When the keyboard is up, the KeyboardAvoidingView
  // (react-native-keyboard-controller, translate-with-padding) already pushes
  // the entire toolbar above the keyboard — adding insets.bottom on top of
  // that would create an unwanted gap between the keyboard top and the bar.
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => {
      if (e.endCoordinates.height > 100) {
        setPanelHeight(e.endCoordinates.height);
      }
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardVisible(false);
    });

    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const openPanel = useCallback((tab: PanelTab) => {
    Keyboard.dismiss();
    setActivePanel(tab);
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel('none');
  }, []);

  const handleStickerBtnPress = useCallback(() => {
    if (activePanel !== 'none') {
      // Switch back to keyboard
      closePanel();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      openPanel('emoji');
    }
  }, [activePanel, openPanel, closePanel]);

  const handleInputFocus = useCallback(() => {
    if (activePanel !== 'none') closePanel();
  }, [activePanel, closePanel]);

  // ── Mic ↔ Send animation ───────────────────────────────────────────────────
  const sendAnim = useRef(new Animated.Value(hasText ? 1 : 0)).current;
  const micAnim  = useRef(new Animated.Value(hasText ? 0 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(sendAnim, {
        toValue: hasText ? 1 : 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 320,
        mass: 0.8,
      }),
      Animated.spring(micAnim, {
        toValue: hasText ? 0 : 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 320,
        mass: 0.8,
      }),
    ]).start();
  }, [hasText]);

  // ── Camera collapse animation ──────────────────────────────────────────────
  // useNativeDriver: false because we animate `width`
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
          if (onVoiceReady) onVoiceReady({ uri, duration: dur });
          else onSend({ voice: { uri, duration: dur } });
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

  // ── Send text ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    animateSendPress();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSend({ text: trimmed });
    onChangeText('');
  }, [text, onSend, onChangeText, animateSendPress]);

  // ── Sticker / GIF from panel ──────────────────────────────────────────────
  const handleStickerPress = useCallback((sticker: string) => {
    onSend({ sticker });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [onSend]);

  const handleGifPress = useCallback((gifUrl: string, gifTitle: string) => {
    onSend({ gifUrl, gifTitle });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [onSend]);

  function fmtSecs(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const panelIsOpen = activePanel !== 'none';
  const stickerBtnIcon = panelIsOpen
    ? <KeyboardIcon size={22} color={T.TEXT_2} weight="regular" />
    : <SmileySticker size={22} color={T.TEXT_2} weight="regular" />;

  // Bottom inset: only when keyboard is hidden and no panel is open.
  // When keyboard is up, KAV already positions us above it.
  // When panel is open, the panel itself fills the bottom space.
  const bottomInset = (!keyboardVisible && !panelIsOpen) ? insets.bottom : 0;

  // ── LOCKED state ───────────────────────────────────────────────────────────
  if (recState === 'locked') {
    return (
      <View style={[s.root, { paddingBottom: bottomInset }]}>
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
          <PaperPlane size={14} color={T.SUCCESS} />
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
          /* Recording active */
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
          /* Normal input */
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
              {/* Camera icon using a simple UTF-8 or phosphor CameraIcon */}
              <CameraIcon />
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
              pointerEvents={hasText ? 'auto' : 'none'}
            >
              <TouchableOpacity
                style={[s.rightBtn, s.actionBtn, isEditing && s.actionBtnEdit]}
                onPress={handleSend}
                activeOpacity={0.88}
                disabled={!hasText || disabled}
              >
                {/* Horizontal forward-facing paper plane */}
                <PaperPlane size={20} color="#fff" weight="fill" />
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {/* Mic button */}
          {!hasText || recState !== 'idle' ? (
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

      {/* ── Sticker / GIF panel ───────────────────────────────────────────── */}
      <MsComposerPanel
        isOpen={panelIsOpen}
        panelHeight={panelHeight}
        activeTab={activePanel === 'none' ? 'emoji' : activePanel}
        onTabChange={setActivePanel}
        onStickerPress={handleStickerPress}
        onGifPress={handleGifPress}
      />
    </View>
  );
});

// ─── Camera icon helper ───────────────────────────────────────────────────────
function CameraIcon() {
  return <Camera size={22} color={T.TEXT_2} />;
}

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

  // Input pill
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

  // Recording pill
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#EF4444', flexShrink: 0 },
  recDotSmall: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  recTimer: { fontSize: 15, fontFamily: T.FONT.medium, color: T.TEXT, flexShrink: 0, minWidth: 36 },
  recWave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 22, overflow: 'hidden' },
  recBar: { flex: 1, minWidth: 2, height: 10, borderRadius: 1.5, backgroundColor: T.ACCENT, opacity: 0.7 },
  slideHint: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, flexShrink: 0 },

  // Right button area
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

  // Mic glow ring
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

  // Lock hint (above mic)
  lockHint: {
    position: 'absolute',
    top: -36,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 1,
    zIndex: 10,
  },
  lockHintText: { fontSize: 9, fontFamily: T.FONT.medium, color: T.TEXT_3, letterSpacing: 0.3 },

  // Locked recording state
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
