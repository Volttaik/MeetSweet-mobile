/**
 * MsLinkPreviewCard — rich link preview rendered under a chat message that
 * contains a URL.
 *
 * The server resolves metadata once and ships it with the message payload, so
 * this card renders from stored data — no re-fetch on chat open, no polling.
 *
 * Two appearances:
 *   • MeetSweet internal links → profile / post / album / short preview with
 *     the creator's name + @handle, title and thumbnail. Tapping opens the
 *     matching screen IN-APP (never the browser).
 *   • External links → domain, title, description and og:image. Tapping opens
 *     the OS browser.
 */
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ArrowSquareOut, GlobeHemisphereWest, User } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import type { LinkPreview } from '@/types/chat-message';
import { isInternalPreview, openLinkPreview } from '@/lib/open-link';

// ─── Kind labels — human-readable, never raw ids ──────────────────────────────

const KIND_LABEL: Record<LinkPreview['kind'], string> = {
  profile: 'Profile',
  post: 'Post',
  album: 'Album',
  short: 'Short',
  video: 'Video',
  external: 'Link',
};

interface Props {
  preview: LinkPreview;
  /** 'left' = incoming (other), 'right' = outgoing (own). */
  position?: 'left' | 'right';
}

export function MsLinkPreviewCard({ preview, position = 'left' }: Props) {
  const isOwn = position === 'right';
  const internal = isInternalPreview(preview);

  const title = preview.title || preview.name || preview.url;
  const description = preview.description || null;
  const subtitle = internal
    ? preview.username
      ? `@${preview.username}`
      : preview.name
        ? preview.name
        : null
    : preview.domain || null;

  const handlePress = () => {
    if (internal) {
      openLinkPreview(preview);
      return;
    }
    if (preview.url) Linking.openURL(preview.url).catch(() => {});
  };

  return (
    <Animated.View entering={FadeIn.duration(180)}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          isOwn ? styles.cardOwn : styles.cardOther,
          pressed && styles.cardPressed,
        ]}
        accessibilityRole="link"
        accessibilityLabel={internal ? `Open ${KIND_LABEL[preview.kind]}: ${title}` : `Open link: ${title}`}
      >
        {preview.imageUrl ? (
          <View style={styles.thumbWrap}>
            <MsMediaLoader
              uri={preview.imageUrl}
              style={styles.thumb}
              resizeMode="cover"
              accessibleLabel={KIND_LABEL[preview.kind]}
            />
          </View>
        ) : (
          <View style={[styles.thumbWrap, styles.thumbFallback]}>
            {internal ? (
              <User size={22} color="rgba(255,255,255,0.55)" weight="duotone" />
            ) : (
              <GlobeHemisphereWest size={22} color="rgba(255,255,255,0.55)" weight="duotone" />
            )}
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.eyebrowRow}>
            <Text
              numberOfLines={1}
              style={[styles.eyebrow, isOwn ? styles.eyebrowOwn : styles.eyebrowOther]}
            >
              {KIND_LABEL[preview.kind]}
            </Text>
            {subtitle ? (
              <>
                <Text style={[styles.dot, isOwn ? styles.eyebrowOwn : styles.eyebrowOther]}>·</Text>
                <Text
                  numberOfLines={1}
                  style={[styles.eyebrow, isOwn ? styles.eyebrowOwn : styles.eyebrowOther]}
                >
                  {subtitle}
                </Text>
              </>
            ) : null}
          </View>

          <Text numberOfLines={2} style={[styles.title, isOwn ? styles.titleOwn : styles.titleOther]}>
            {title}
          </Text>

          {description ? (
            <Text numberOfLines={2} style={[styles.desc, isOwn ? styles.descOwn : styles.descOther]}>
              {description}
            </Text>
          ) : null}

          {!internal && preview.domain ? (
            <View style={styles.openRow}>
              <ArrowSquareOut size={11} color="rgba(255,255,255,0.4)" weight="bold" />
              <Text numberOfLines={1} style={[styles.openText, isOwn ? styles.descOwn : styles.descOther]}>
                {preview.domain}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
    borderWidth: 1,
  },
  cardOwn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardOther: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardPressed: {
    opacity: 0.82,
  },
  thumbWrap: {
    width: 72,
    minHeight: 64,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  eyebrow: {
    fontSize: 9,
    fontFamily: T.FONT.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  eyebrowOwn: { color: 'rgba(255,255,255,0.42)' },
  eyebrowOther: { color: T.TEXT_3 },
  dot: {
    fontSize: 9,
  },
  title: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    lineHeight: 17,
  },
  titleOwn: { color: '#FFFFFF' },
  titleOther: { color: T.TEXT },
  desc: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    lineHeight: 15,
  },
  descOwn: { color: 'rgba(255,255,255,0.62)' },
  descOther: { color: T.TEXT_2 },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  openText: {
    fontSize: 10,
    fontFamily: T.FONT.medium,
    flexShrink: 1,
  },
});
