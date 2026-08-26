/**
 * ChatAttachment — one media item inside a private-message bubble.
 *
 * Follows the local-media cache contract (services/chat-media + lib/chat-cache):
 *   • On mount the cache is consulted — if the attachment's file is already on
 *     device it renders from the LOCAL URI immediately (no re-download).
 *   • Otherwise the remote/preview representation renders with a clear
 *     Download action. Tapping it downloads into Expo File System, records
 *     metadata, and the bubble switches to the local file.
 *   • If the local file is ever missing/corrupt, the cache resolves to null
 *     and this component falls back to the canonical remote URL + Download
 *     again — a broken cache entry never shows a permanently broken bubble.
 *
 * Locked paid media keeps its existing compact locked card (no content is ever
 * exposed before purchase).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowDown, Check, Lock, Play } from 'phosphor-react-native';
import { T, MEDIA_BG } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { downloadChatMedia, getCachedChatMedia } from '@/services/chat-media';
import type { Attachment } from '@/services/private-inbox';

type MediaState = 'checking' | 'remote' | 'downloading' | 'local' | 'error';

/**
 * Measure an image's natural dimensions and return a height/width ratio,
 * clamped so extreme portraits/landscapes don't dominate the bubble. Falls
 * back to a sensible default until the image header loads.
 */
function useNaturalRatio(uri: string | null, fallback: number): number {
  const [ratio, setRatio] = useState(fallback);
  useEffect(() => {
    if (!uri) return;
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (!alive || !w || !h) return;
        setRatio(Math.min(Math.max(h / w, 0.62), 1.85));
      },
      () => {
        // Unmeasurable (offline / exotic host) — keep the fallback ratio.
      },
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return ratio;
}

interface ChatAttachmentProps {
  attachment: Attachment;
  messageId: string;
  userId?: string | null;
  onUnlock: () => void;
  /** Open the fullscreen viewer with a resolved (local-or-remote) URI. */
  onOpen: (uri: string, isVideo: boolean) => void;
}

export function ChatAttachment({ attachment, messageId, userId, onUnlock, onOpen }: ChatAttachmentProps) {
  const isVideo = attachment.media_type === 'video';
  const remoteUri = attachment.media_url;
  // Video preview = thumbnail when available, otherwise the video itself.
  const remotePreview = isVideo ? (attachment.thumbnail_url ?? attachment.media_url) : attachment.media_url;

  const [state, setState] = useState<MediaState>('checking');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const displayUri = localUri ?? (isVideo ? remotePreview : remoteUri);

  // Hooks before the early return. Images follow their natural dimensions;
  // videos use a fixed 16:10 frame (no natural-size probe for video URLs).
  const ratio = useNaturalRatio(isVideo ? null : displayUri, isVideo ? 16 / 10 : 4 / 3);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Consult the local cache; fall back to remote when nothing is cached. */
  const resolveCache = useCallback(async () => {
    if (!attachment.media_url) {
      setState('remote');
      return;
    }
    const cached = await getCachedChatMedia(
      attachment.id,
      attachment.media_type,
      attachment.media_url,
      userId ?? undefined,
    );
    if (!mountedRef.current) return;
    if (cached) {
      setLocalUri(cached);
      setState('local');
    } else {
      setState('remote');
    }
  }, [attachment.id, attachment.media_type, attachment.media_url, userId]);

  useEffect(() => {
    void resolveCache();
  }, [resolveCache]);

  const handleDownload = useCallback(async () => {
    if (!attachment.media_url) return;
    setState('downloading');
    const local = await downloadChatMedia({
      attachmentId: attachment.id,
      userId: userId ?? '',
      messageId,
      mediaType: attachment.media_type,
      remoteUrl: attachment.media_url,
    });
    if (!mountedRef.current) return;
    if (local) {
      setLocalUri(local);
      setState('local');
    } else {
      setState('error');
    }
  }, [attachment.id, attachment.media_url, attachment.media_type, messageId, userId]);

  const handlePress = useCallback(() => {
    if (!displayUri) return;
    onOpen(displayUri, isVideo);
  }, [displayUri, isVideo, onOpen]);

  // ── Locked paid media — never exposes the content until purchased ─────────
  if (attachment.is_locked) {
    return (
      <Pressable style={styles.lockedCard} onPress={onUnlock} accessibilityRole="button" accessibilityLabel={`Unlock paid media for ₦${attachment.price.toLocaleString()}`}>
        <View style={styles.lockedIcon}>
          <BrandGradientFill />
          <Lock size={14} color="#FFFFFF" weight="fill" />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.lockedTitle}>Paid media</Text>
          <Text style={styles.lockedSub}>Tap to unlock for ₦{attachment.price.toLocaleString()}</Text>
        </View>
        <View style={styles.unlockBtn}>
          <BrandGradientFill />
          <Text style={styles.unlockBtnText}>Unlock</Text>
        </View>
      </Pressable>
    );
  }

  if (!remotePreview && !localUri) {
    return <Text style={styles.attachmentNote}>Attachment ({attachment.media_type})</Text>;
  }

  const cached = state === 'local' && !!localUri;

  return (
    <Pressable
      onPress={cached ? handlePress : undefined}
      style={[styles.media, { aspectRatio: ratio }]}
      accessibilityRole={cached ? 'button' : undefined}
      accessibilityLabel={isVideo ? 'Video message. Tap to play.' : 'Image message. Tap to view.'}
    >
      <MsMediaLoader
        uri={displayUri ?? ''}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibleLabel=""
        errorMessage=""
        fallback={null}
      />

      {/* Play badge only once the video is available locally (tappable). */}
      {isVideo && cached ? (
        <View style={styles.playBadge} pointerEvents="none">
          <View style={styles.playBadgeInner}>
            <Play size={18} color={T.ACCENT_FG} weight="fill" />
          </View>
        </View>
      ) : null}

      {/* Paid + purchased — show it was unlocked */}
      {attachment.price > 0 && !attachment.is_locked ? (
        <View style={styles.unlockedBadge}>
          <BrandGradientFill />
          <Check size={9} color="#FFFFFF" weight="bold" />
          <Text style={styles.unlockedBadgeText}>Unlocked</Text>
        </View>
      ) : null}

      {/* Download / downloading overlay — remote preview stays visible under it */}
      {!cached ? (
        <View style={styles.downloadOverlay} pointerEvents="box-none">
          {state === 'checking' || state === 'downloading' ? (
            <View style={styles.downloadPill}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.downloadPillText}>
                {state === 'downloading' ? 'Downloading…' : 'Checking…'}
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={handleDownload}
              style={styles.downloadBtn}
              accessibilityRole="button"
              accessibilityLabel={isVideo ? 'Download video' : 'Download image'}
            >
              <ArrowDown size={15} color="#FFFFFF" weight="bold" />
              <Text style={styles.downloadBtnText}>
                {state === 'error' ? 'Retry download' : 'Download'}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  media: {
    width: '100%',
    borderRadius: T.RADIUS.md,
    overflow: 'hidden',
    backgroundColor: MEDIA_BG,
  },
  playBadge: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadgeInner: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.pill,
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: T.FONT.semibold,
  },
  downloadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  downloadPillText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontFamily: T.FONT.medium,
  },
  unlockedBadge: {
    position: 'absolute',
    top: 8, left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: T.ACCENT,
  },
  unlockedBadgeText: { color: '#FFFFFF', fontSize: 9, fontFamily: T.FONT.bold },
  attachmentNote: { color: T.TEXT_3, fontSize: 12, fontFamily: T.FONT.regular },
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  lockedIcon: {
    width: 32, height: 32, borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  lockedTitle: { color: T.TEXT, fontSize: 13, fontFamily: T.FONT.semibold },
  lockedSub: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.regular },
  unlockBtn: {
    overflow: 'hidden',
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: T.ACCENT,
  },
  unlockBtnText: { color: '#FFFFFF', fontSize: 11, fontFamily: T.FONT.semibold },
});
