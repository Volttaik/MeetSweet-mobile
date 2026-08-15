/**
 * MsUploadProgress — polished, reusable upload/progress overlay.
 *
 * Stages:  PREPARING → UPLOADING → PROCESSING → COMPLETED
 *
 * Features:
 *   - Smooth animated progress bar with a live percentage label (the internal
 *     value interpolates between real progress events, so the bar never
 *     appears frozen or jumps).
 *   - Vertical step tracker (spinner → check) for multi-phase operations.
 *   - Success state with a springy checkmark.
 *   - Error state with Retry / Back-to-edit actions.
 *   - Semi-transparent veil: the app stays visible behind the card, so the
 *     progress UI never feels like it has swallowed the whole screen.
 *
 * Usage:
 *   <MsUploadProgress
 *     visible={step === 'uploading' || step === 'creating'}
 *     title="Uploading Media"
 *     subtitle="Uploading item 2 of 5…"
 *     progress={uploadProgress}
 *     stages={[{ key: 'upload', label: 'Upload Media' }, …]}
 *     activeStage={stageKey}
 *     status={status}
 *     successTitle="Published!"
 *     errorMessage={error}
 *     onRetry={handlePublish}
 *     onCancel={() => setStep('preview')}
 *     onDone={() => router.replace('/(tabs)')}
 *   />
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowClockwise, Check, WarningCircle, X } from 'phosphor-react-native';
import { T } from '@/constants/theme';

export interface UploadStage {
  key: string;
  label: string;
}

export type UploadStatus = 'uploading' | 'success' | 'error';

interface MsUploadProgressProps {
  visible: boolean;
  /** Main title, e.g. "Uploading Media" or "Creating Post" */
  title: string;
  /** Secondary line, e.g. "Uploading item 2 of 5…" */
  subtitle?: string;
  /** Real progress 0..1 (drives the animated bar) */
  progress: number;
  /** Accent colour for the bar / highlights (defaults to T.ACCENT) */
  accentColor?: string;
  /** Optional step tracker */
  stages?: UploadStage[];
  /** Key of the currently-active stage */
  activeStage?: string | null;
  status?: UploadStatus;
  /** Success copy (used when status === 'success') */
  successTitle?: string;
  successSubtitle?: string;
  /** Error copy (used when status === 'error') */
  errorMessage?: string;
  /** Retry the operation (error state) */
  onRetry?: () => void;
  /** Return to the editor (error state / cancel) */
  onCancel?: () => void;
  /** Continue after success */
  onDone?: () => void;
}

export function MsUploadProgress({
  visible,
  title,
  subtitle,
  progress,
  accentColor = T.ACCENT,
  stages,
  activeStage,
  status = 'uploading',
  successTitle = 'Done!',
  successSubtitle,
  errorMessage = 'Something went wrong. Please try again.',
  onRetry,
  onCancel,
  onDone,
}: MsUploadProgressProps) {
  const insets = useSafeAreaInsets();

  // ── Animated display progress (interpolates between real progress events) ──
  const displayAnim = useRef(new Animated.Value(0)).current;
  const [pct, setPct] = useState(0);
  const [spin, setSpin] = useState(false); // indeterminate state (preparing)

  useEffect(() => {
    const id = displayAnim.addListener(({ value }) =>
      setPct(Math.round(Math.min(1, Math.max(0, value)) * 100)),
    );
    return () => displayAnim.removeListener(id);
  }, [displayAnim]);

  // When shown (or real progress arrives), glide toward it.
  useEffect(() => {
    if (!visible) return;
    if (status === 'success') {
      displayAnim.setValue(1);
      setPct(100);
      return;
    }
    if (progress <= 0) {
      // Preparing — gently pulse an indeterminate bar
      setSpin(true);
      Animated.timing(displayAnim, { toValue: 0.12, duration: 700, useNativeDriver: false }).start();
      return;
    }
    setSpin(false);
    Animated.timing(displayAnim, {
      toValue: progress,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [visible, progress, status, displayAnim]);

  // ── Success check spring ────────────────────────────────────────────────────
  const checkScale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (status === 'success') {
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 9,
        stiffness: 220,
        mass: 0.9,
      }).start();
    } else {
      checkScale.setValue(0);
    }
  }, [status, checkScale]);

  if (!visible) return null;

  const activeIdx = stages?.findIndex((s) => s.key === activeStage) ?? -1;
  const barWidth = displayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const barOpacity = displayAnim.interpolate({
    inputRange: [0, 0.06, 0.12],
    outputRange: [1, 0.45, 1],
  });

  return (
    <View style={[styles.overlay, { paddingTop: insets.top }]} pointerEvents="auto">
      <View style={styles.veil} />

      <View style={styles.card}>
        {status === 'error' ? (
          /* ── Error state ─────────────────────────────────────────────── */
          <View style={styles.centerCol}>
            <View style={[styles.statusIcon, { backgroundColor: `${T.ERROR}1A` }]}>
              <WarningCircle size={30} color={T.ERROR} weight="fill" />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <View style={styles.errorActions}>
              {onRetry && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: accentColor }]}
                  onPress={onRetry}
                  activeOpacity={0.85}
                >
                  <ArrowClockwise size={16} color="#fff" weight="bold" />
                  <Text style={styles.primaryBtnLabel}>Try again</Text>
                </TouchableOpacity>
              )}
              {onCancel && (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={onCancel}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryBtnLabel}>Back to edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : status === 'success' ? (
          /* ── Success state ───────────────────────────────────────────── */
          <View style={styles.centerCol}>
            <Animated.View
              style={[
                styles.statusIcon,
                { backgroundColor: `${accentColor}22`, transform: [{ scale: checkScale }] },
              ]}
            >
              <Check size={32} color={accentColor} weight="bold" />
            </Animated.View>
            <Text style={styles.title}>{successTitle}</Text>
            {!!successSubtitle && <Text style={styles.subtitle}>{successSubtitle}</Text>}
            {onDone && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: accentColor, marginTop: 8 }]}
                onPress={onDone}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnLabel}>Continue</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          /* ── Progress state ───────────────────────────────────────────── */
          <View style={styles.centerCol}>
            {/* Spinner for indeterminate (preparing) phase */}
            <View style={[styles.spinnerWrap, { borderColor: `${accentColor}26` }]}>
              {spin ? (
                <ActivityIndicator size="small" color={accentColor} />
              ) : (
                <Text style={[styles.pctBig, { color: accentColor }]}>{pct}%</Text>
              )}
            </View>

            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

            {/* Progress bar */}
            <View style={styles.barWrap}>
              <Animated.View
                style={[
                  styles.bar,
                  { width: barWidth, backgroundColor: accentColor, opacity: barOpacity },
                ]}
              />
            </View>

            {/* Step tracker */}
            {stages && stages.length > 0 && (
              <View style={styles.stageList}>
                {stages.map((s, i) => {
                  const isDone = activeIdx === -1 ? false : i < activeIdx;
                  const isActive = i === activeIdx;
                  return (
                    <View key={s.key} style={styles.stageRow}>
                      <View
                        style={[
                          styles.stageDot,
                          isDone && { backgroundColor: `${accentColor}22` },
                          isActive && { backgroundColor: `${accentColor}22` },
                        ]}
                      >
                        {isDone ? (
                          <Check size={11} color={accentColor} weight="bold" />
                        ) : isActive ? (
                          <ActivityIndicator size="small" color={accentColor} style={{ transform: [{ scale: 0.6 }] }} />
                        ) : (
                          <View style={[styles.stageDotIdle, { backgroundColor: T.SURFACE_2 }]} />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.stageLabel,
                          isDone && { color: T.TEXT_2 },
                          isActive && { color: T.TEXT },
                          !isDone && !isActive && { color: T.TEXT_3 },
                        ]}
                      >
                        {s.label}
                      </Text>
                      {isDone && <Text style={[styles.stageStatus, { color: accentColor }]}>Done</Text>}
                      {isActive && <Text style={styles.stageStatus}>In progress</Text>}
                    </View>
                  );
                })}
              </View>
            )}

            {onCancel && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onCancel}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <X size={14} color={T.TEXT_3} />
                <Text style={styles.cancelLabel}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 50,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,6,9,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: T.SURFACE,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 26,
    alignItems: 'center',
    ...T.SHADOWS.hard,
  },
  centerCol: { alignItems: 'center', width: '100%' },
  spinnerWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pctBig: {
    fontSize: 22,
    fontFamily: T.FONT.bold,
    letterSpacing: -1,
  },
  statusIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 18,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  errorText: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  barWrap: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: T.SURFACE_2,
    overflow: 'hidden',
    marginTop: 2,
  },
  bar: { height: '100%', borderRadius: 4 },
  stageList: { width: '100%', marginTop: 20 },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.BORDER,
  },
  stageDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stageDotIdle: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stageLabel: { flex: 1, fontFamily: T.FONT.medium, fontSize: 13 },
  stageStatus: { fontFamily: T.FONT.regular, fontSize: 11, color: T.TEXT_3 },
  errorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    width: '100%',
  },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: T.RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  primaryBtnLabel: { color: '#fff', fontFamily: T.FONT.semibold, fontSize: 14 },
  secondaryBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnLabel: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 14 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    marginTop: 6,
  },
  cancelLabel: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12 },
});
