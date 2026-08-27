/**
 * MsUploadStatusPill — global floating indicator for background uploads.
 *
 * Mounted once in the root layout (next to MsGlobalDialogsHost), it subscribes
 * to the background-upload manager and shows a small, non-intrusive pill while
 * media is uploading in the background or has reached a terminal state. This is
 * the reliable in-app feedback that works on EVERY platform — web included,
 * where OS device notifications are not available at all.
 *
 * The pill is fully tappable: tapping it opens the Upload Details screen where
 * the user can watch progress, cancel, or retry. Terminal states (complete /
 * failed) auto-dismiss after 10 seconds via the manager's dismissal timers.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle, WarningCircle } from 'phosphor-react-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import { useBackgroundUploads, uploadManager } from '@/services/upload-manager';

export function MsUploadStatusPill() {
  const { uploads } = useBackgroundUploads();

  if (!uploads || uploads.length === 0) return null;

  const active = uploads.filter((u) => u.status === 'uploading');
  const failed = uploads.filter((u) => u.status === 'failed');
  const finished = uploads.filter((u) => u.status === 'complete');

  // Prefer reporting an in-flight upload; a terminal state is shown when there
  // is nothing still running (e.g. a failed upload awaiting a retry).
  const isUploading = active.length > 0;

  const openDetails = () => {
    router.push('/upload-details');
  };

  if (isUploading) {
    const sum = active.reduce((acc, u) => acc + (Number.isFinite(u.progress) ? u.progress : 0), 0);
    const pct = Math.round((sum / Math.max(1, active.length)) * 100);
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        <Pressable
          style={styles.pill}
          onPress={openDetails}
          accessibilityRole="button"
          accessibilityLabel={`Uploading ${pct}% — open upload details`}
        >
          <ActivityIndicator size="small" color={T.ACCENT} />
          <Text style={styles.label} numberOfLines={1}>
            Uploading{active.length > 1 ? ` ${active.length} items` : ''} · {pct}%
          </Text>
        </Pressable>
      </View>
    );
  }

  if (failed.length > 0) {
    const canRetry = failed.some(
      (u) => u.recoverable !== false && uploadManager.get(u.uploadId),
    );
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        <Pressable
          style={[styles.pill, styles.pillError]}
          onPress={openDetails}
          accessibilityRole="button"
          accessibilityLabel="Upload failed — open upload details"
        >
          <WarningCircle size={16} color="#FF6B6B" weight="fill" />
          <Text style={styles.label} numberOfLines={1}>
            Upload failed{canRetry ? ' · Retry' : ''}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (finished.length > 0) {
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        <Pressable
          style={[styles.pill, styles.pillSuccess]}
          onPress={openDetails}
          accessibilityRole="button"
          accessibilityLabel="Upload complete — open upload details"
        >
          <CheckCircle size={16} color="#35C47C" weight="fill" />
          <Text style={styles.label} numberOfLines={1}>
            Upload complete
          </Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9000,
    elevation: 9000,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    backgroundColor: 'rgba(24,24,30,0.96)',
    borderWidth: 1,
    borderColor: T.BORDER,
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    maxWidth: '88%',
  },
  pillError: {
    borderColor: 'rgba(255,107,107,0.5)',
  },
  pillSuccess: {
    borderColor: 'rgba(53,196,124,0.5)',
  },
  label: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: '#FFFFFF',
    flexShrink: 1,
  },
});
