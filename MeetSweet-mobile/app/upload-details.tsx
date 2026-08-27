/**
 * UploadDetailsScreen — the dedicated Upload Manager.
 *
 * Opened by tapping the floating upload toast. Shows every tracked upload with
 * its media/post preview, filename, live progress, status, percentage, and the
 * actions that matter: Cancel while uploading, Retry while a failed upload is
 * still retryable. Completion/failure states are shown too, and terminal
 * uploads auto-dismiss after 10 seconds (manager-side timers), so the screen
 * empties out on its own once everything settles.
 */
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  CheckCircle,
  CloudArrowUp,
  FilmStrip,
  Image as ImageIcon,
  WarningCircle,
  XCircle,
} from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { goBack } from '@/lib/safe-back';
import { GradientText } from '@/components/GradientText';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { T, alpha, AppGradients } from '@/constants/theme';
import { useBackgroundUploads, uploadManager, type BackgroundUpload } from '@/services/upload-manager';

function UploadCard({ upload }: { upload: BackgroundUpload }) {
  const pct = Math.round((Number.isFinite(upload.progress) ? upload.progress : 0) * 100);
  const isLive = Boolean(uploadManager.get(upload.uploadId));
  const uploading = upload.status === 'uploading';
  const failed = upload.status === 'failed';
  const complete = upload.status === 'complete';

  return (
    <View style={styles.card}>
      {/* ── Preview ── */}
      <View style={styles.previewWrap}>
        {upload.previewUri && (upload.mediaType === 'image' || upload.mediaType === 'video') ? (
          <Image source={{ uri: upload.previewUri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={[styles.preview, styles.previewPlaceholder]}>
            {upload.mediaType === 'video' ? (
              <FilmStrip size={26} color={T.TEXT_3} weight="bold" />
            ) : upload.mediaType === 'image' ? (
              <ImageIcon size={26} color={T.TEXT_3} weight="bold" />
            ) : (
              <CloudArrowUp size={26} color={T.TEXT_3} weight="bold" />
            )}
          </View>
        )}
        {uploading ? (
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>{pct}%</Text>
          </View>
        ) : null}
      </View>

      {/* ── Info ── */}
      <View style={styles.info}>
        <Text style={styles.fileName} numberOfLines={1}>
          {upload.fileName || upload.label || 'Your upload'}
        </Text>
        <Text style={styles.fileMeta} numberOfLines={1}>
          {upload.label === 'video' ? 'Video' : upload.label === 'post' ? 'Post' : 'Upload'} · {upload.mediaType}
        </Text>

        {/* Status line */}
        {uploading ? (
          <View style={styles.statusRow}>
            <Text style={styles.statusUploading}>Uploading… {pct}%</Text>
          </View>
        ) : failed ? (
          <View style={styles.statusRow}>
            <WarningCircle size={13} color={T.ERROR} weight="fill" />
            <Text style={styles.statusFailed} numberOfLines={2}>
              {upload.error || 'Upload failed'}
            </Text>
          </View>
        ) : complete ? (
          <View style={styles.statusRow}>
            <CheckCircle size={13} color={T.SUCCESS} weight="fill" />
            <Text style={styles.statusComplete}>Upload complete</Text>
          </View>
        ) : null}

        {/* Progress bar while uploading */}
        {uploading ? (
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={AppGradients.brand}
              locations={AppGradients.brandLocs}
              start={AppGradients.brandStart}
              end={AppGradients.brandEnd}
              style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, pct))}%` }]}
            />
          </View>
        ) : null}

        {/* Unrecoverable failures can never be retried — tell the user to pick
            another file instead of offering a Retry that would just fail again. */}
        {failed && !upload.recoverable ? (
          <Text style={styles.unrecoverableNote}>
            This video can't be uploaded. Select another video to try again.
          </Text>
        ) : (
          <View style={styles.actions}>
            {uploading ? (
              <Pressable
                style={styles.cancelBtn}
                onPress={() => uploadManager.cancel(upload.uploadId)}
                accessibilityRole="button"
                accessibilityLabel="Cancel upload"
              >
                <XCircle size={15} color={T.ERROR} weight="fill" />
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
            ) : null}
            {failed && isLive ? (
              <Pressable
                style={styles.retryBtn}
                onPress={() => uploadManager.retry(upload.uploadId)}
                accessibilityRole="button"
                accessibilityLabel="Retry upload"
              >
                <BrandGradientFill />
                <ArrowCounterClockwise size={15} color="#FFFFFF" weight="bold" />
                <Text style={styles.retryLabel}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

export default function UploadDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { uploads } = useBackgroundUploads();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => goBack()} hitSlop={10} accessibilityRole="button">
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <GradientText text="Upload Details" style={styles.headerTitle} />
        <View style={{ width: 36 }} />
      </View>

      {uploads.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <CloudArrowUp size={30} color={T.TEXT_3} weight="bold" />
          </View>
          <Text style={styles.emptyTitle}>No active uploads</Text>
          <Text style={styles.emptySubtitle}>
            Uploads that are running, complete, or waiting for a retry will appear here.
          </Text>
          <Pressable style={styles.doneBtn} onPress={() => goBack()} accessibilityRole="button">
            <Text style={styles.doneLabel}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {uploads.map((u) => (
            <UploadCard key={u.uploadId} upload={u} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: T.FONT.bold,
    letterSpacing: -0.3,
  },

  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },

  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER,
    padding: 12,
  },
  previewWrap: { position: 'relative' },
  preview: {
    width: 84,
    height: 84,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
  },
  previewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  previewBadgeText: {
    color: '#FFFFFF',
    fontFamily: T.FONT.bold,
    fontSize: 10,
  },

  info: { flex: 1, gap: 4 },
  fileName: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  fileMeta: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusUploading: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.PRIMARY_LIGHT,
  },
  statusFailed: {
    flex: 1,
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.ERROR,
    lineHeight: 16,
  },
  unrecoverableNote: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
    lineHeight: 17,
  },
  statusComplete: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.SUCCESS,
  },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: T.SURFACE_2,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    borderWidth: 1,
    borderColor: alpha(T.ERROR, 0.5),
    backgroundColor: alpha(T.ERROR, 0.08),
  },
  cancelLabel: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.ERROR,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    overflow: 'hidden',
  },
  retryLabel: {
    fontSize: 13,
    fontFamily: T.FONT.bold,
    color: '#FFFFFF',
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 20,
  },
  doneBtn: {
    marginTop: 12,
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
  },
  doneLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
});
