/**
 * MsChatInputBar — premium MeetSweet chat input with full voice-recording UX.
 *
 * Gesture architecture
 * ───────────────────
 * The mic button always stays mounted in a fixed position with the SAME
 * PanResponder attached.  One PanResponder owns the complete touch lifecycle:
 *
 *   onPanResponderGrant → start a long-press timer (250 ms)
 *   timer fires         → startRecording() — state becomes 'active'
 *   onPanResponderMove  → track dy / dx; update lock/cancel hint anims
 *   onPanResponderRelease:
 *      recState active + dy ≤ −52  → lock (hands-free recording)
 *      recState active + dx ≤ −72  → cancel
 *      recState active + normal    → stop + call onVoiceReady
 *      recState idle (short tap)   → noop (long-press not triggered)
 *
 * This avoids the "gesture handoff" bug that occurs when you mix onLongPress
 * with a PanResponder on a different view.
 *
 * Voice recording states
 * ──────────────────────
 *   idle    → normal input row
 *   active  → recording: timer, waveform, "slide to cancel" / lock cues
 *   locked  → hands-free: waveform, Stop / Cancel buttons
 *
 * When recording ends (non-cancel), `onVoiceReady` is called so the parent
 * can show MsAttachmentPreview for the user to listen before sending.
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowBendUpLeft,
  ArrowUp,
  Lock,
  Microphone,
  PaperPlaneTilt,
  Paperclip,
  Smiley,
  Square,
  X,
} from 'phosphor-react-native';
import { Audio } from 'expo-av';
import { T } from '@/constants/theme';
import type { ReplyMessage } from '@kesha-antonov/react-native-chat';
import type { MsMessage } from '@/types/chat-message';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PendingVoice {
  uri: string;
  duration: number; // seconds
}

export interface SendPayload {
  text?: string;
  /** Legacy: parent should prefer onVoiceReady */
  voice?: PendingVoice;
  isPaid?: boolean;
}

type RecordingState = 'idle' | 'active' | 'locked';

// ─── Constants ────────────────────────────────────────────────────────────────

const LONG_PRESS_DELAY   = 250;  // ms before recording starts
const LOCK_THRESHOLD_Y   = -52;  // px upward to lock
const CANCEL_THRESHOLD_X = -72;  // px leftward to cancel
const ICON_ANIM_MS       = 180;
const WAVEFORM_BARS      = 16;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  text: string;
  onChangeText: (text: string) => void;
  onSend: (payload: SendPayload) => void;
  /** Called when a voice note is finished — parent shows preview before send */
  onVoiceReady?: (voice: PendingVoice) => void;
  replyMessage?: ReplyMessage | null;
  onClearReply?: () => void;
  editingMessage?: MsMessage | null;
  onCancelEdit?: () => void;
  onEmojiPress?: () => void;
  onAttachPress?: () => void;
  disabled?: boolean;
}

export function MsChatInputBar({
  text,
  onChangeText,
  onSend,
  onVoiceReady,
  replyMessage,
  onClearReply,
  editingMessage,
  onCancelEdit,
  onEmojiPress,
  onAttachPress,
  disabled,
}: Props) {
  const hasText  = text.trim().length > 0;
  const isEditing = !!editingMessage;

  // ── Mic ↔ Send icon transition ────────────────────────────────────────────
  const sendAnim = useRef(new Animated.Value(hasText ? 1 : 0)).current;
  const micAnim  = useRef(new Animated.Value(hasText ? 0 : 1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(sendAnim, { toValue: hasText ? 1 : 0, duration: ICON_ANIM_MS, useNativeDriver: true }),
      Animated.timing(micAnim,  { toValue: hasText ? 0 : 1, duration: ICON_ANIM_MS, useNativeDriver: true }),
    ]).start();
  }, [hasText]);

  // ── Reply bar slide-in ─────────────────────────────────────────────────────
  const replySlide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(replySlide, {
      toValue: replyMessage ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [!!replyMessage]);

  // ── Recording UI state (drives re-render) ─────────────────────────────────
  const [recState,   setRecState]   = useState<RecordingState>('idle');
  const [recSeconds, setRecSeconds] = useState(0);

  // ── Mutable recording state — safe to read inside PanResponder closures ───
  // (React state is stale inside closures; refs are always current.)
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

  // Keep ref in sync with React state (for reads inside closures)
  const syncState = (s: RecordingState) => {
    recRef.current.state = s;
    setRecState(s);
  };

  // ── Hint animations (safe to call from PanResponder) ─────────────────────
  const lockHintAnim   = useRef(new Animated.Value(0)).current;
  const cancelHintAnim = useRef(new Animated.Value(0)).current;
  const lockedAnim     = useRef(new Animated.Value(0)).current;

  // ── Waveform bars ─────────────────────────────────────────────────────────
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

  // ── Core recording actions — plain functions (no useCallback needed) ──────

  const _startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recRef.current.recording = recording;
      recRef.current.seconds   = 0;

      // Reset hint anims
      lockHintAnim.setValue(0);
      cancelHintAnim.setValue(0);
      lockedAnim.setValue(0);

      // Timer
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
    // Clear timer
    if (recRef.current.intervalId) {
      clearInterval(recRef.current.intervalId);
      recRef.current.intervalId = null;
    }
    stopPulse();

    const rec = recRef.current.recording;
    recRef.current.recording = null;
    syncState('idle');
    setRecSeconds(0);

    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      if (!cancel) {
        const uri    = rec.getURI();
        const status = await rec.getStatusAsync();
        const dur    = Math.floor((status.durationMillis ?? 0) / 1000);
        if (uri && dur > 0) {
          if (onVoiceReady) {
            onVoiceReady({ uri, duration: dur });
          } else {
            onSend({ voice: { uri, duration: dur } });
          }
        }
      }
    } catch {/* ignore */}
  };

  const _lockRecording = () => {
    syncState('locked');
    Animated.timing(lockedAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  };

  // ── PanResponder (always mounted, manages full touch lifecycle) ───────────
  const panResponder = useRef(
    PanResponder.create({
      // Claim responder on touch start (for the mic button area)
      onStartShouldSetPanResponder: () => true,
      // Keep the responder during movement (important for swipe gestures)
      onMoveShouldSetPanResponder: (_e, _gs) => recRef.current.state !== 'idle',

      onPanResponderGrant: () => {
        if (recRef.current.state !== 'idle') return;
        // Start long-press timer — fires startRecording after LONG_PRESS_DELAY
        recRef.current.longPressTimer = setTimeout(() => {
          recRef.current.longPressTimer = null;
          _startRecording();
        }, LONG_PRESS_DELAY);
      },

      onPanResponderMove: (_e, gs) => {
        if (recRef.current.state !== 'active') return;

        // Lock hint (swipe up)
        const lockProgress = Math.min(1, Math.max(0, -gs.dy / Math.abs(LOCK_THRESHOLD_Y)));
        lockHintAnim.setValue(lockProgress);

        // Cancel hint (swipe left, only when not going up)
        if (gs.dy > -20) {
          const cancelProgress = Math.min(1, Math.max(0, -gs.dx / Math.abs(CANCEL_THRESHOLD_X)));
          cancelHintAnim.setValue(cancelProgress);
        }
      },

      onPanResponderRelease: (_e, gs) => {
        // Cancel pending long-press if released before it fired
        if (recRef.current.longPressTimer) {
          clearTimeout(recRef.current.longPressTimer);
          recRef.current.longPressTimer = null;
          return; // short tap — not a long press, do nothing
        }

        if (recRef.current.state !== 'active') return;

        if (gs.dy <= LOCK_THRESHOLD_Y) {
          _lockRecording();
        } else if (gs.dx <= CANCEL_THRESHOLD_X) {
          _stopRecording(true);
        } else {
          _stopRecording(false);
        }
      },

      onPanResponderTerminate: () => {
        // System interrupted the gesture (e.g. incoming call)
        if (recRef.current.longPressTimer) {
          clearTimeout(recRef.current.longPressTimer);
          recRef.current.longPressTimer = null;
        }
        if (recRef.current.state === 'active') {
          _stopRecording(true);
        }
      },
    }),
  ).current;

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
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
    onSend({ text: trimmed });
    onChangeText('');
  }, [text, onSend, onChangeText]);

  function fmtSecs(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── LOCKED recording state ─────────────────────────────────────────────────
  if (recState === 'locked') {
    return (
      <View style={s.root}>
        <Animated.View
          style={[
            s.lockBadge,
            {
              opacity: lockedAnim,
              transform: [{ scale: lockedAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            },
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

  // ── ACTIVE / IDLE recording state ─────────────────────────────────────────
  // The mic button (with PanResponder) always stays in the same layout position.
  // The pill area changes content based on recState, but the mic button tree is stable.
  return (
    <View style={s.root}>

      {/* Edit banner */}
      {isEditing && (
        <View style={s.contextBar}>
          <PaperPlaneTilt size={14} color={T.SUCCESS} />
          <Text style={s.contextBarText} numberOfLines={1}>
            Editing: {editingMessage?.text ?? ''}
          </Text>
          <TouchableOpacity onPress={onCancelEdit} hitSlop={8}>
            <X size={16} color={T.TEXT_3} />
          </TouchableOpacity>
        </View>
      )}

      {/* Reply bar — animated slide + fade */}
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

      <View style={s.row}>

        {/* Attach — hidden during active recording */}
        {recState === 'idle' ? (
          <TouchableOpacity style={s.sideBtn} onPress={onAttachPress} activeOpacity={0.7} disabled={disabled}>
            <Paperclip size={22} color={T.TEXT_2} />
          </TouchableOpacity>
        ) : (
          <View style={s.sideBtn} />
        )}

        {/* Pill — shows input or recording UI */}
        {recState === 'active' ? (
          /* ── Active recording pill ──────────────────────────────────────── */
          <View style={[s.pill, s.pillRec]}>
            <View style={s.recDot} />
            <Text style={s.recTimer}>{fmtSecs(recSeconds)}</Text>
            <View style={s.recWave}>
              {barAnims.map((a, i) => (
                <Animated.View key={i} style={[s.recBar, { transform: [{ scaleY: a }] }]} />
              ))}
            </View>
            <Animated.Text style={[s.slideHint, { opacity: cancelHintAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]}>
              ← cancel
            </Animated.Text>
          </View>
        ) : (
          /* ── Normal input pill ──────────────────────────────────────────── */
          <View style={s.pill}>
            <TouchableOpacity style={s.pillIcon} onPress={onEmojiPress} activeOpacity={0.7} disabled={disabled}>
              <Smiley size={22} color={T.TEXT_2} />
            </TouchableOpacity>
            <TextInput
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

        {/* Right button area — always the same layout position */}
        <View style={s.rightBtnWrap}>

          {/* Send button (visible when has text) */}
          {recState === 'idle' ? (
            <Animated.View
              style={[s.btnAbsolute, { opacity: sendAnim, transform: [{ scale: sendAnim }] }]}
              pointerEvents={hasText ? 'auto' : 'none'}
            >
              <TouchableOpacity
                style={[s.rightBtn, s.actionBtn, isEditing && s.actionBtnEdit]}
                onPress={handleSend}
                activeOpacity={0.8}
                disabled={!hasText || disabled}
              >
                <PaperPlaneTilt size={20} color="#fff" weight="fill" />
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {/* Mic button — always mounted when not typing; PanResponder owns gestures */}
          {!hasText || recState !== 'idle' ? (
            <Animated.View
              style={[
                s.btnAbsolute,
                recState === 'idle' && {
                  opacity: micAnim,
                  transform: [{ scale: micAnim }],
                },
              ]}
            >
              {/* Lock hint arrow (above mic during active recording) */}
              {recState === 'active' ? (
                <Animated.View style={[s.lockHint, { opacity: lockHintAnim }]} pointerEvents="none">
                  <ArrowUp size={13} color={T.TEXT_3} />
                  <Text style={s.lockHintText}>Lock</Text>
                </Animated.View>
              ) : null}

              {/* The mic view with PanResponder — never unmounts while mic is shown */}
              <View
                style={[
                  s.rightBtn,
                  s.actionBtn,
                  recState === 'active' && s.actionBtnRec,
                ]}
                {...panResponder.panHandlers}
              >
                {recState === 'active'
                  ? <View style={s.recDotSmall} />
                  : <Microphone size={20} color="#fff" weight="fill" />
                }
              </View>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </View>
  );
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
    gap: 8,
    paddingHorizontal: 12,
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

  // Recording pill content
  recDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    flexShrink: 0,
  },
  recDotSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recTimer: {
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    flexShrink: 0,
    minWidth: 36,
  },
  recWave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
    overflow: 'hidden',
  },
  recBar: {
    flex: 1,
    minWidth: 2,
    height: 10,
    borderRadius: 1.5,
    backgroundColor: T.ACCENT,
    opacity: 0.7,
  },
  slideHint: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    flexShrink: 0,
  },

  // Right buttons
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
  actionBtnRec:  { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
  actionBtnEdit: { backgroundColor: T.SUCCESS,  shadowColor: T.SUCCESS  },

  // Lock hint (above mic during active recording)
  lockHint: {
    position: 'absolute',
    top: -36,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 1,
    zIndex: 10,
  },
  lockHintText: {
    fontSize: 9,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
    letterSpacing: 0.3,
  },

  // Locked recording state (full row)
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: T.SURFACE,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
  },
  lockedWave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 26,
    overflow: 'hidden',
  },
  lockedBar: {
    flex: 1,
    minWidth: 2,
    height: 12,
    borderRadius: 1.5,
    backgroundColor: T.ACCENT,
    opacity: 0.65,
  },
  lockedTimer: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    flexShrink: 0,
    minWidth: 38,
    textAlign: 'right',
  },
  lockedCancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lockedStop: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },

  // Lock badge (above locked row)
  lockBadge: {
    position: 'absolute',
    top: -30,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  lockBadgeText: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.ACCENT,
  },
});
