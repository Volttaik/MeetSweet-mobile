/**
 * MsChatInputBar — production-quality MeetSweet messaging composer.
 *
 * Layout
 * ──────
 *   Empty  : [Input Pill] [Attach] [Camera] [Mic]
 *   Typing : [Input Pill] [Attach] [Camera→0] [Send]
 *
 * Composer staging model
 * ──────────────────────
 * NOTHING sends automatically. The input is the central holding area.
 * • Emoji        → typed with the system emoji keyboard (no custom picker)
 * • GIF          → picked from the photo library, staged above input as thumbnail
 * • Voice note   → compact playback bar above input (press send to dispatch)
 * • Image/Video  → thumbnail above input; pen icon → full MsAttachmentPreview
 * • Document     → file chip above input (press send to dispatch)
 *
 * Keyboard behaviour
 * ──────────────────
 * • Tracks keyboard height via Keyboard events.
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
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowBendUpLeft,
  ArrowUp,
  Camera,
  File,
  Lock,
  Microphone,
  PaperPlaneRight,
  Paperclip,
  Pause,
  PencilSimple,
  Play,
  X,
} from 'phosphor-react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { T } from '@/constants/theme';
import type { ReplyMessage } from '@kesha-antonov/react-native-chat';
import type { MsMessage } from '@/types/chat-message';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PendingVoice {
  uri: string;
  duration: number;
}

/** Inline attachment staged above the input before sending */
export interface InlineAttachment {
  type: 'image' | 'video' | 'audio' | 'voice' | 'document' | 'gif' | 'sticker';
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
}

type RecordingState = 'idle' | 'active' | 'locked';

// ─── Constants ────────────────────────────────────────────────────────────────

const LONG_PRESS_DELAY   = 250;
const LOCK_THRESHOLD_Y   = -52;
const CANCEL_THRESHOLD_X = -72;
const WAVEFORM_BARS      = 16;
const MAX_REC_SECS       = 300; // 5 minutes
const WARN_AT_SECS       = 270; // 4 minutes 30 seconds

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Map a live dBFS metering value (−160 silence … 0 full scale) onto a 0..1 bar
 * height. Voice sits mostly in the −50..−5 dB band, so the linear amplitude is
 * boosted with a sqrt curve for a perceptible, natural-looking wave.
 */
function normalizeDb(db: number | undefined | null): number {
  if (db == null || !Number.isFinite(db)) return 0.15;
  const amp = Math.pow(10, Math.max(-160, Math.min(0, db)) / 20);
  return Math.min(1, Math.max(0.1, Math.sqrt(amp)));
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

// ─── Live waveform — metering-driven bars rendered on the UI thread ───────────

const WaveBar = memo(function WaveBar({
  wave,
  index,
  barStyle,
}: {
  wave: SharedValue<number[]>;
  index: number;
  barStyle: any;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    height: Math.max(3, wave.value[index] * 22),
  }));
  return <Reanimated.View style={[barStyle, animatedStyle]} />;
});

const LiveWaveform = memo(function LiveWaveform({
  wave,
  barStyle,
}: {
  wave: SharedValue<number[]>;
  barStyle: any;
}) {
  return (
    <>
      {Array.from({ length: WAVEFORM_BARS }, (_, i) => (
        <WaveBar key={i} wave={wave} index={i} barStyle={barStyle} />
      ))}
    </>
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
  const player = useAudioPlayer(voice.uri);
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;
  const position  = Math.floor(status.currentTime ?? 0);

  useEffect(() => () => { player.remove(); }, [player]);

  const togglePlay = async () => {
    try {
      if (isPlaying) {
        player.pause();
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
      if (status.didJustFinish) await player.seekTo(0);
      player.play();
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
      <MsPressable style={sa.voicePlayBtn} onPress={togglePlay}>
        {isPlaying
          ? <Pause size={13} color="#fff" weight="fill" />
          : <Play  size={13} color="#fff" weight="fill" />
        }
      </MsPressable>
      <MsPressable style={sa.attachRemoveBtn} onPress={onRemove} hitSlop={6}>
        <X size={12} color={T.TEXT_3} />
      </MsPressable>
    </View>
  );
});

// ─── AudioAttachmentBar — compact audio preview with inline playback ──────────

const AudioAttachmentBar = memo(function AudioAttachmentBar({
  attachment,
  onRemove,
}: {
  attachment: InlineAttachment;
  onRemove: () => void;
}) {
  const player = useAudioPlayer(attachment.uri);
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;
  const position  = Math.floor(status.currentTime ?? 0);

  useEffect(() => () => { player.remove(); }, [player]);

  const togglePlay = async () => {
    try {
      if (isPlaying) {
        player.pause();
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
      if (status.didJustFinish) await player.seekTo(0);
      player.play();
    } catch {/* ignore */}
  };

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const duration = attachment.duration ?? 0;
  const barHeights = [5,9,14,8,12,16,7,10,13,6,15,9,11,14,8,12,7,10,5,13,9,14,6,11,15,8,12,7,10,13];

  return (
    <View style={sa.voiceBar}>
      <View style={sa.voiceIcon}>
        <Microphone size={15} color={T.ACCENT} weight="fill" />
      </View>
      <View style={sa.voiceWave}>
        {barHeights.slice(0, 22).map((h, i) => (
          <View
            key={i}
            style={[
              sa.voiceWaveBar,
              {
                height: h,
                backgroundColor: duration > 0 && i / 22 <= (isPlaying ? position / duration : 0)
                  ? T.ACCENT
                  : 'rgba(255,255,255,0.15)',
              },
            ]}
          />
        ))}
      </View>
      <Text style={sa.voiceDuration}>
        {fmt(isPlaying ? position : duration)}
      </Text>
      <MsPressable style={sa.voicePlayBtn} onPress={togglePlay}>
        {isPlaying
          ? <Pause size={13} color="#fff" weight="fill" />
          : <Play  size={13} color="#fff" weight="fill" />
        }
      </MsPressable>
      <MsPressable style={sa.attachRemoveBtn} onPress={onRemove} hitSlop={6}>
        <X size={12} color={T.TEXT_3} />
      </MsPressable>
    </View>
  );
});

// ─── MediaAttachmentBar — image / video / gif / document ──────────────────────

const MediaAttachmentBar = memo(function MediaAttachmentBar({
  attachment,
  onRemove,
  onEdit,
}: {
  attachment: InlineAttachment;
  onRemove: () => void;
  onEdit?: () => void;
}) {
  const isMedia  = attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'gif' || attachment.type === 'sticker';
  const isDoc    = attachment.type === 'document';
  const fileName = (attachment as InlineAttachment).fileName ?? '';
  const fileSize = (attachment as InlineAttachment).fileSize;

  return (
    <View style={sa.mediaBar}>
      {isMedia && (
        <View style={sa.mediaThumbnailWrap}>
          <Image
            // Down-sample at decode time: a freshly-picked 12MP photo must
            // not be decoded into a 48x48 box on the JS/UI thread — that
            // stalls the whole composer. width/height are decode hints.
            source={{ uri: attachment.uri, width: 96, height: 96 }}
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
          {attachment.type === 'sticker' && (
            <View style={sa.gifBadge}>
              <Text style={sa.gifBadgeText}>STICKER</Text>
            </View>
          )}
        </View>
      )}

      {isDoc && (
        <View style={sa.docIconWrap}>
          <File size={20} color={T.ACCENT} weight="duotone" />
        </View>
      )}

      <View style={sa.mediaInfo}>
        <Text style={sa.mediaName} numberOfLines={1}>
          {attachment.type === 'gif'
            ? 'GIF'
            : attachment.type === 'sticker' ? 'Sticker'
            : attachment.type === 'image' ? 'Photo'
            : attachment.type === 'video' ? 'Video'
            : fileName}
        </Text>
        {fileSize ? (
          <Text style={sa.mediaSize}>{formatFileSize(fileSize)}</Text>
        ) : null}
      </View>

      {onEdit && (
        <MsPressable style={sa.editBtn} onPress={onEdit} hitSlop={6}>
          <PencilSimple size={14} color={T.TEXT_2} />
        </MsPressable>
      )}
      <MsPressable style={sa.attachRemoveBtn} onPress={onRemove} hitSlop={6}>
        <X size={12} color={T.TEXT_3} />
      </MsPressable>
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
  /** Hard-disable the whole composer (blocked room). */
  disabled?: boolean;
  /** A media upload is in flight — disable ONLY the send button so the
   *  composer stays responsive, while the staged attachment + send button
   *  remain visible (no mid-upload mic swap). */
  sending?: boolean;

  // ── Inline attachment staging (image/video/doc from picker) ──────────────
  /** Pending media attachment to preview above the input */
  inlineAttachment?: InlineAttachment | null;
  /** Called when user taps ✕ on inline attachment */
  onRemoveInlineAttachment?: () => void;
  /** Called when user taps ✏ on inline attachment — open full preview */
  onEditInlineAttachment?: () => void;
  /** Called when send is pressed while an inline attachment is staged */
  onSendWithAttachment?: (payload: AttachmentSendPayload) => void;
  /** Realtime: called when voice recording starts (true) / stops (false). */
  onRecordingStateChange?: (recording: boolean) => void;
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
  sending,
  inlineAttachment,
  onRemoveInlineAttachment,
  onEditInlineAttachment,
  onSendWithAttachment,
  onRecordingStateChange,
}: Props) {
  const isEditing = !!editingMessage;
  const insets    = useSafeAreaInsets();

  // ── Composer staged items ─────────────────────────────────────────────────
  const [pendingVoice, setPendingVoice] = useState<PendingVoice | null>(null);

  const hasText    = text.trim().length > 0;
  const hasContent = hasText || !!pendingVoice || !!inlineAttachment;

  const inputRef = useRef<TextInput>(null);

  // ── Keyboard tracking ─────────────────────────────────────────────────────
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));

    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

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
  const hasAttachment = !!(pendingVoice || inlineAttachment);

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
  const [recState,    setRecState]    = useState<RecordingState>('idle');
  const [recSeconds,  setRecSeconds]  = useState(0);
  const [recWarning,  setRecWarning]  = useState(false);   // 4:30 warning
  const [micDenied,   setMicDenied]   = useState(false);   // permission denied banner

  // ── Audio recorder (expo-audio) — created once per mount, prepared on demand.
  //     Metering is enabled so the live waveform is driven by real dBFS values
  //     instead of a fake JS-thread pulse.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // ── Live waveform — metering samples pushed into a shared-value ring buffer
  //     that the bars read on the UI thread (zero JS work per frame).
  const waveHeights = useSharedValue<number[]>(new Array(WAVEFORM_BARS).fill(0.15));
  const ringBufferRef = useRef<number[]>([]);

  const recRef = useRef<{
    state:              RecordingState;
    recording:          boolean;
    intervalId:         ReturnType<typeof setInterval> | null;
    meteringIntervalId: ReturnType<typeof setInterval> | null;
    longPressTimer:     ReturnType<typeof setTimeout>  | null;
    seconds:            number;
  }>({
    state:              'idle',
    recording:          false,
    intervalId:         null,
    meteringIntervalId: null,
    longPressTimer:     null,
    seconds:            0,
  });

  const syncState = (s: RecordingState) => {
    recRef.current.state = s;
    setRecState(s);
  };

  // ── Mic press animation ────────────────────────────────────────────────────
  const micPressScale = useRef(new Animated.Value(1)).current;
  const micGlowAnim   = useRef(new Animated.Value(0)).current;

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

  // ── Live waveform sampling — reads the recorder's dBFS metering at 10 Hz and
  //     scrolls a WAVEFORM_BARS window of normalized heights through the shared
  //     value. Bars re-render on the UI thread; no layout churn per frame.
  const startMetering = () => {
    stopMetering();
    recRef.current.meteringIntervalId = setInterval(() => {
      if (!recRef.current.recording) return;
      const db = recorder.getStatus().metering;
      ringBufferRef.current.push(normalizeDb(db));
      if (ringBufferRef.current.length > WAVEFORM_BARS) ringBufferRef.current.shift();
      waveHeights.value = ringBufferRef.current.slice();
    }, 100);
  };

  const stopMetering = () => {
    if (recRef.current.meteringIntervalId) {
      clearInterval(recRef.current.meteringIntervalId);
      recRef.current.meteringIntervalId = null;
    }
    ringBufferRef.current.length = 0;
    waveHeights.value = new Array(WAVEFORM_BARS).fill(0.15);
  };

  // ── Recording actions ──────────────────────────────────────────────────────

  const _startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setMicDenied(true);
        animateMicPressOut();
        return;
      }
      setMicDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'doNotMix' });
      await recorder.prepareToRecordAsync({ isMeteringEnabled: true });
      recorder.record();
      recRef.current.recording = true;
      recRef.current.seconds   = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Animated.timing(micGlowAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      lockHintAnim.setValue(0);
      cancelHintAnim.setValue(0);
      lockedAnim.setValue(0);
      setRecWarning(false);
      recRef.current.intervalId = setInterval(() => {
        recRef.current.seconds += 1;
        const s = recRef.current.seconds;
        setRecSeconds(s);
        // Warning at 4:30
        if (s === WARN_AT_SECS) {
          setRecWarning(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
        // Auto-stop at 5:00
        if (s >= MAX_REC_SECS) {
          _stopRecording(false);
        }
      }, 1000);
      syncState('active');
      setRecSeconds(0);
      startMetering();
      onRecordingStateChange?.(true);
    } catch {/* permission denied or device error */}
  };

  const _stopRecording = async (cancel = false) => {
    if (recRef.current.intervalId) { clearInterval(recRef.current.intervalId); recRef.current.intervalId = null; }
    stopMetering();
    animateMicPressOut();
    const wasRecording = recRef.current.recording;
    recRef.current.recording = false;
    syncState('idle');
    setRecSeconds(0);
    setRecWarning(false);
    onRecordingStateChange?.(false);
    if (!wasRecording) return;
    try {
      await recorder.stop();
      if (!cancel) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const uri = recorder.uri;
        const dur = Math.max(0, Math.floor(recorder.currentTime ?? 0));
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

  // ── Mic hold-to-record gesture (native gesture-handler, UI thread) ─────────
  // Replaces the JS-thread PanResponder: activation, translation tracking and
  // release all run through the native gesture system instead of simulated
  // JS touch handling.
  const gestureEndedRef = useRef(false);

  const micGesture = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      // Touch-down: press-in feedback + the long-press timer that starts
      // recording after LONG_PRESS_DELAY ms.
      if (recRef.current.state !== 'idle') return;
      Animated.spring(micPressScale, { toValue: 0.88, useNativeDriver: true, damping: 12, stiffness: 300 }).start();
      Animated.timing(micGlowAnim, { toValue: 0.6, duration: 100, useNativeDriver: true }).start();
      Haptics.selectionAsync().catch(() => {});
      recRef.current.longPressTimer = setTimeout(() => {
        recRef.current.longPressTimer = null;
        _startRecording();
      }, LONG_PRESS_DELAY);
    })
    .onUpdate((e) => {
      if (recRef.current.state !== 'active') return;
      lockHintAnim.setValue(Math.min(1, Math.max(0, -e.translationY / Math.abs(LOCK_THRESHOLD_Y))));
      if (e.translationY > -20) {
        cancelHintAnim.setValue(Math.min(1, Math.max(0, -e.translationX / Math.abs(CANCEL_THRESHOLD_X))));
      }
    })
    .onEnd((e) => {
      gestureEndedRef.current = true;
      if (recRef.current.longPressTimer) {
        clearTimeout(recRef.current.longPressTimer);
        recRef.current.longPressTimer = null;
        animateMicPressOut();
        return;
      }
      if (recRef.current.state !== 'active') return;
      if (e.translationY <= LOCK_THRESHOLD_Y) _lockRecording();
      else if (e.translationX <= CANCEL_THRESHOLD_X) _stopRecording(true);
      else _stopRecording(false);
    })
    .onFinalize(() => {
      // Gesture was cancelled/stolen (not a normal release) — behave like the
      // old onPanResponderTerminate.
      if (!gestureEndedRef.current) {
        if (recRef.current.longPressTimer) {
          clearTimeout(recRef.current.longPressTimer);
          recRef.current.longPressTimer = null;
        }
        animateMicPressOut();
        if (recRef.current.state === 'active') _stopRecording(true);
      }
      gestureEndedRef.current = false;
    });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (recRef.current.longPressTimer) clearTimeout(recRef.current.longPressTimer);
    if (recRef.current.intervalId)     clearInterval(recRef.current.intervalId);
    stopMetering();
    if (recRef.current.recording) void recorder.stop();
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

    // 2. Staged voice note
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
  }, [text, inlineAttachment, pendingVoice, onSend, onChangeText, onSendWithAttachment, animateSendPress]);

  function fmtSecs(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const bottomInset = !keyboardVisible ? insets.bottom : 0;

  // ── LOCKED state ───────────────────────────────────────────────────────────
  if (recState === 'locked') {
    return (
      <View style={s.root} pointerEvents="box-none">
        {/* Lock badge floating above */}
        <Animated.View
          style={[
            s.lockBadge,
            { opacity: lockedAnim, transform: [{ scale: lockedAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
          ]}
          pointerEvents="none"
        >
          <Lock size={12} color={T.SUCCESS} weight="fill" />
          <Text style={[s.lockBadgeText, { color: T.SUCCESS }]}>Locked</Text>
        </Animated.View>

        {/* Warning banner at 4:30 */}
        {recWarning && (
          <View style={s.recWarningBanner}>
            <Text style={s.recWarningText}>Max recording time in 30 seconds</Text>
          </View>
        )}

        <View style={s.lockedRow}>
          {/* Live waveform */}
          <View style={s.lockedWave}>
            <LiveWaveform wave={waveHeights} barStyle={s.lockedBar} />
          </View>

          {/* Timer */}
          <Text style={[s.lockedTimer, recWarning && { color: '#EF4444' }]}>
            {fmtSecs(recSeconds)}
          </Text>

          {/* Cancel */}
          <MsPressable style={s.lockedCancel} onPress={() => _stopRecording(true)}
            accessibilityLabel="Cancel recording"
          >
            <X size={16} color={T.TEXT_2} />
          </MsPressable>

          {/* Stop / confirm — green after lock */}
          <MsPressable style={s.lockedStop} onPress={() => _stopRecording(false)}
            accessibilityLabel="Stop and confirm recording"
          >
            <Lock size={15} color="#fff" weight="fill" />
          </MsPressable>
        </View>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingBottom: bottomInset }]}>

      {/* ── Microphone permission denied banner ───────────────────────────── */}
      {micDenied && (
        <MsPressable
          style={s.micDeniedBanner}
          onPress={async () => {
            const { Linking } = await import('react-native');
            Linking.openSettings();
          }}
          accessibilityLabel="Microphone access required. Tap to open settings."
          accessibilityRole="button"
        >
          <Microphone size={14} color="#fff" weight="fill" />
          <Text style={s.micDeniedText}>Microphone access required. Tap to open settings.</Text>
          <MsPressable
            hitSlop={10}
            onPress={() => setMicDenied(false)}
            accessibilityLabel="Dismiss"
          >
            <X size={14} color="rgba(255,255,255,0.55)" />
          </MsPressable>
        </MsPressable>
      )}

      {/* ── Edit banner ──────────────────────────────────────────────────── */}
      {isEditing && (
        <View style={s.contextBar}>
          <PaperPlaneRight size={14} color={T.SUCCESS} />
          <Text style={s.contextBarText} numberOfLines={1}>
            Editing: {editingMessage?.text ?? ''}
          </Text>
          <MsPressable onPress={onCancelEdit} hitSlop={8}>
            <X size={16} color={T.TEXT_3} />
          </MsPressable>
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
          <MsPressable onPress={onClearReply} hitSlop={8}>
            <X size={16} color={T.TEXT_3} />
          </MsPressable>
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
        {!pendingVoice && inlineAttachment && (
          inlineAttachment.type === 'audio' ? (
            <AudioAttachmentBar
              attachment={inlineAttachment}
              onRemove={onRemoveInlineAttachment ?? (() => {})}
            />
          ) : (
            <MediaAttachmentBar
              attachment={inlineAttachment}
              onRemove={onRemoveInlineAttachment ?? (() => {})}
              onEdit={inlineAttachment.type === 'image' || inlineAttachment.type === 'video' ? onEditInlineAttachment : undefined}
            />
          )
        )}
      </Animated.View>

      {/* ── Input row ────────────────────────────────────────────────────── */}
      <View style={s.row}>

        {/* Input pill */}
        {recState === 'active' ? (
          <View style={[s.pill, s.pillRec, recWarning && s.pillRecWarn]}>
            <View style={[s.recDot, recWarning && s.recDotWarn]} />
            <Text style={[s.recTimer, recWarning && s.recTimerWarn]}>{fmtSecs(recSeconds)}</Text>
            <View style={s.recWave}>
              <LiveWaveform wave={waveHeights} barStyle={s.recBar} />
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
              <MsPressable
                style={[s.rightBtn, s.actionBtn, isEditing && s.actionBtnEdit]}
                onPress={handleSend}
                      disabled={!hasContent || disabled || sending}
              >
                <PaperPlaneRight size={20} color="#fff" weight="fill" />
              </MsPressable>
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

              {/* Mic view — native gesture-handler pan (hold-to-record) */}
              <GestureDetector gesture={micGesture}>
                <Animated.View
                  style={[
                    s.rightBtn,
                    s.actionBtn,
                    recState === 'active' && s.actionBtnRec,
                    recState === 'idle' && { transform: [{ scale: micPressScale }] },
                  ]}
                >
                  {recState === 'active'
                    ? <View style={s.recDotSmall} />
                    : <Microphone size={21} color="#fff" weight="fill" />
                  }
                </Animated.View>
              </GestureDetector>
            </Animated.View>
          ) : null}
        </View>
      </View>

    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Transparent so the chat wallpaper (MsChatBackground) shows through the
  // whole composer — message area AND input area share one background layer.
  // Only the pill and floating preview chips stay opaque for readability.
  root: { backgroundColor: 'transparent' },

  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 8,
    // Translucent dark so reply/edit banners stay readable over any wallpaper
    // while the background still shows through around them.
    backgroundColor: 'rgba(12,12,15,0.72)',
  },
  contextBarText: {
    flex: 1,
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  // Attachment staging bar — transparent so the wallpaper continues behind
  // the staged-attachment chips.
  attachmentBarWrap: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
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
  // Green stop button after lock
  lockedStop: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.SUCCESS, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Warning variant styles
  recWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  recWarningText: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: '#EF4444',
    textAlign: 'center',
  },
  pillRecWarn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  recDotWarn:   { backgroundColor: '#FF6B6B' },
  recTimerWarn: { color: '#EF4444' },

  // Mic permission denied banner
  micDeniedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderRadius: 0,
  },
  micDeniedText: {
    flex: 1,
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: '#fff',
    flexShrink: 1,
  },
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
