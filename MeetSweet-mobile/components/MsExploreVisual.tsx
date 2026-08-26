import React from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

// A card Pressable (button on web) cannot contain a nested <button>, so the
// embedded Subscribe control drops its button role on web only (renders as a
// clickable div inside the card button). Native keeps full button semantics.
const INNER_BUTTON_ROLE = Platform.OS === 'web' ? undefined : 'button';
import { SealCheck, Play, Sparkle, Users } from 'phosphor-react-native';
import type { ContentPreview, Creator, TrendingCollection } from '@/lib/api-client-react';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { T, ALBUM_TONES, AppGradients } from '@/constants/theme';

// Two-column creator card grid: 20px screen padding each side, 12px gutter.
const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const CREATOR_CARD_WIDTH = Math.round((SCREEN_WIDTH - 40 - 12) / 2);

// Fallback solid tones when no real thumbnail
const TONE = ALBUM_TONES;

function tone(gradient: string) {
  return TONE[gradient] ?? T.SURFACE_2;
}

function fmtSubscribers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ─── Creator Identity (avatar + name + handle row) ────────────────────────────

export function MsCreatorIdentity({
  creator,
  size = 42,
  onPress,
}: {
  creator: Creator;
  size?: number;
  onPress?: () => void;
}) {
  const content = (
    <View style={identityStyles.wrap}>
      <MsAvatar
        size={size}
        initials={creator.initials}
        imageUri={creator.avatarUrl ?? undefined}
        showOnline={creator.isOnline}
      />
      <View style={identityStyles.copy}>
        <View style={identityStyles.nameRow}>
          <Text style={identityStyles.name} numberOfLines={1}>
            {creator.name}
          </Text>
          {creator.isVerified && <SealCheck size={13} color={T.TEXT} weight="fill" />}
        </View>
        <Text style={identityStyles.handle} numberOfLines={1}>
          {creator.handle}
        </Text>
      </View>
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress} style={identityStyles.pressable}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

// ─── Featured Creator Card ────────────────────────────────────────────────────

export function MsFeaturedCreatorCard({
  creator,
  onPress,
  onLongPress,
  onAvatarPress,
  onSubscribe,
  isSubscribed = false,
  subscribing = false,
}: {
  creator: Creator;
  onPress: () => void;
  onLongPress: () => void;
  onAvatarPress?: () => void;
  onSubscribe?: () => void;
  isSubscribed?: boolean;
  subscribing?: boolean;
}) {
  return (
    <Pressable
      style={[featuredStyles.card, { backgroundColor: tone(creator.gradient) }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`View ${creator.name}'s profile`}
    >
      {/* Banner image */}
      {creator.bannerUrl ? (
        <MsMediaLoader
          uri={creator.bannerUrl}
          style={featuredStyles.banner}
          resizeMode="cover"
          accessibleLabel={`${creator.name} banner`}
          errorMessage=""
          fallback={null}
        />
      ) : null}

      {/* Scrim over banner */}
      {creator.bannerUrl ? (
        <View style={featuredStyles.bannerScrim} pointerEvents="none" />
      ) : null}

      <View style={featuredStyles.mark}>
        <Sparkle size={14} color={T.TEXT} />
        <Text style={featuredStyles.markText}>FEATURED</Text>
      </View>

      <Pressable
        style={featuredStyles.avatarWrap}
        onPress={onAvatarPress ?? onPress}
        hitSlop={6}
      >
        <MsAvatar
          size={60}
          initials={creator.initials}
          imageUri={creator.avatarUrl ?? undefined}
          showOnline={creator.isOnline}
        />
      </Pressable>

      <View style={featuredStyles.featuredCopy}>
        <View style={featuredStyles.nameRow}>
          <Text style={featuredStyles.name} numberOfLines={1}>
            {creator.name}
          </Text>
          {creator.isVerified && <SealCheck size={14} color={T.TEXT} weight="fill" />}
        </View>
        <Text style={featuredStyles.handle}>
          {creator.handle} · {creator.category}
        </Text>
        <Text style={featuredStyles.bio} numberOfLines={2}>
          {creator.bio}
        </Text>
      </View>

      <View style={featuredStyles.footer}>
        <View style={featuredStyles.metric}>
          <Users size={13} color={T.TEXT_2} />
          <Text style={featuredStyles.metricText}>{fmtSubscribers(creator.subscriberCount ?? 0)} subscribers</Text>
        </View>
      </View>

      <Pressable
        style={[featuredStyles.subscribeBtn, isSubscribed && featuredStyles.subscribeBtnSubscribed]}
        onPress={onSubscribe}
        disabled={subscribing || !onSubscribe}
        hitSlop={6}
        accessibilityRole={INNER_BUTTON_ROLE}
        accessibilityLabel={isSubscribed ? `Subscribed to ${creator.name}` : `Subscribe to ${creator.name}`}
      >
        <Text style={[featuredStyles.subscribeBtnLabel, isSubscribed && { color: T.TEXT_2 }]}>
          {isSubscribed ? 'Subscribed' : 'Subscribe'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

// ─── Creator Card (premium discovery card) ───────────────────────────────────

/**
 * MsCreatorCard — the Explore creator card.
 *
 * Premium two-column card: cover banner on top (real banner image or a soft
 * platform-gradient fallback), avatar overlapping the banner with a gradient
 * ring, name + verified badge, handle, category chip, subscriber count, bio
 * and a brand-gradient subscribe CTA. Used for both creator discovery grids
 * and creator search results — one card, no separate search design.
 */
export function MsCreatorCard({
  creator,
  onPress,
  onLongPress,
  onAvatarPress,
  onSubscribe,
  isSubscribed = false,
  subscribing = false,
}: {
  creator: Creator;
  onPress: () => void;
  onLongPress: () => void;
  onAvatarPress?: () => void;
  onSubscribe?: () => void;
  isSubscribed?: boolean;
  subscribing?: boolean;
}) {
  const hasBanner = Boolean(creator.bannerUrl);
  const hasCategory = Boolean(creator.category);

  return (
    <Pressable
      style={creatorCardStyles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`View ${creator.name}'s profile`}
    >
      {/* Cover banner — real banner or gradient fallback, scrimmed for depth */}
      <View style={creatorCardStyles.bannerWrap}>
        {hasBanner ? (
          <MsMediaLoader
            uri={creator.bannerUrl}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibleLabel={`${creator.name} banner`}
            errorMessage=""
            fallback={null}
          />
        ) : (
          <BrandGradientFill colors={AppGradients.rosePurple} />
        )}
        <View style={creatorCardStyles.bannerScrim} pointerEvents="none" />
      </View>

      {/* Avatar overlapping the banner, wrapped in a platform-gradient ring */}
      <View style={creatorCardStyles.avatarWrap}>
        <Pressable
          style={creatorCardStyles.avatarRing}
          onPress={onAvatarPress ?? onPress}
          hitSlop={6}
          accessibilityRole={INNER_BUTTON_ROLE}
          accessibilityLabel={`View ${creator.name}'s profile`}
        >
          <BrandGradientFill />
          <View style={creatorCardStyles.avatarInset}>
            <MsAvatar
              size={52}
              initials={creator.initials}
              imageUri={creator.avatarUrl ?? undefined}
              showOnline={creator.isOnline}
            />
          </View>
        </Pressable>
      </View>

      {/* Identity + relevant creator info */}
      <View style={creatorCardStyles.body}>
        <View style={creatorCardStyles.nameRow}>
          <Text style={creatorCardStyles.name} numberOfLines={1}>
            {creator.name}
          </Text>
          {creator.isVerified && (
            <SealCheck size={13} color={T.PRIMARY_LIGHT} weight="fill" />
          )}
        </View>
        <Text style={creatorCardStyles.handle} numberOfLines={1}>
          {creator.handle}
        </Text>

        <View style={creatorCardStyles.metaRow}>
          {hasCategory && (
            <View style={creatorCardStyles.categoryChip}>
              <Text style={creatorCardStyles.categoryText} numberOfLines={1}>
                {creator.category}
              </Text>
            </View>
          )}
          <View style={creatorCardStyles.subscriberMetric}>
            <Users size={12} color={T.TEXT_2} weight="bold" />
            <Text style={creatorCardStyles.subscriberText} numberOfLines={1}>
              {fmtSubscribers(creator.subscriberCount ?? 0)}
            </Text>
          </View>
        </View>

        {Boolean(creator.bio) && (
          <Text style={creatorCardStyles.bio} numberOfLines={2}>
            {creator.bio}
          </Text>
        )}
      </View>

      {/* Subscribe CTA — brand gradient when actionable, muted when subscribed */}
      <Pressable
        style={[
          creatorCardStyles.subscribeBtn,
          isSubscribed && creatorCardStyles.subscribeBtnSubscribed,
        ]}
        onPress={onSubscribe}
        disabled={subscribing || !onSubscribe}
        hitSlop={6}
        accessibilityRole={INNER_BUTTON_ROLE}
        accessibilityLabel={isSubscribed ? `Subscribed to ${creator.name}` : `Subscribe to ${creator.name}`}
      >
        {!isSubscribed && <BrandGradientFill />}
        <Text
          style={[
            creatorCardStyles.subscribeLabel,
            isSubscribed && creatorCardStyles.subscribeLabelSubscribed,
          ]}
        >
          {subscribing ? 'Subscribing…' : isSubscribed ? 'Subscribed' : 'Subscribe'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

export function MsPreviewCard({
  preview,
  creator,
  onPress,
  onLongPress,
}: {
  preview: ContentPreview;
  creator: Creator;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      style={previewStyles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={preview.title}
    >
      <View style={[previewStyles.art, { backgroundColor: tone(preview.gradient) }]}>
        {preview.thumbnailUrl ? (
          <MsMediaLoader
            uri={preview.thumbnailUrl}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibleLabel={`Thumbnail for ${preview.title}`}
            errorMessage=""
            fallback={null}
          />
        ) : (
          <View style={previewStyles.artLines}>
            <View style={previewStyles.lineWide} />
            <View style={previewStyles.lineShort} />
            <View style={previewStyles.lineWide} />
          </View>
        )}

        {/* Creator avatar overlaid bottom-left */}
        <View style={previewStyles.creatorChip}>
          <MsAvatar
            size={18}
            initials={creator.initials}
            imageUri={creator.avatarUrl ?? undefined}
          />
        </View>

        <View style={previewStyles.typeMark}>
          <Play size={13} color={T.TEXT} weight="fill" />
          <Text style={previewStyles.typeText}>{preview.kind}</Text>
        </View>
        <View style={previewStyles.previewBadge}>
          <Text style={previewStyles.previewBadgeText}>PREVIEW</Text>
        </View>
      </View>
      <View style={previewStyles.body}>
        <Text style={previewStyles.title} numberOfLines={2}>
          {preview.title}
        </Text>
        <Text style={previewStyles.creator} numberOfLines={1}>
          {creator.name}{preview.duration ? ` · ${preview.duration}` : ''}
        </Text>
        <View style={previewStyles.footer}>
          <Text style={previewStyles.likes}>{preview.likes} likes</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Collection Card ──────────────────────────────────────────────────────────

export function MsCollectionCard({
  collection,
  onPress,
}: {
  collection: TrendingCollection;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[collectionStyles.card, { backgroundColor: tone(collection.gradient) }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={collection.title}
    >
      <View style={collectionStyles.icon}>
        <Sparkle size={16} color={T.TEXT} />
      </View>
      <View style={collectionStyles.copy}>
        <Text style={collectionStyles.title}>{collection.title}</Text>
        <Text style={collectionStyles.subtitle}>{collection.subtitle}</Text>
      </View>
      <Text style={collectionStyles.count}>{collection.itemCount} items</Text>
    </Pressable>
  );
}

// ─── Catalog Skeleton ─────────────────────────────────────────────────────────

export function MsCatalogSkeleton() {
  return (
    <View style={skeletonStyles.wrap}>
      <View style={skeletonStyles.heroRow}>
        <View style={skeletonStyles.featuredSkeleton} />
        <View style={skeletonStyles.featuredSkeleton} />
      </View>
      <View style={skeletonStyles.row}>
        <View style={skeletonStyles.avatar} />
        <View style={skeletonStyles.copy} />
        <View style={skeletonStyles.button} />
      </View>
      <View style={skeletonStyles.row}>
        <View style={skeletonStyles.avatar} />
        <View style={skeletonStyles.copy} />
        <View style={skeletonStyles.button} />
      </View>
      <View style={skeletonStyles.grid}>
        <View style={skeletonStyles.preview} />
        <View style={skeletonStyles.preview} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const identityStyles = StyleSheet.create({
  pressable: { flex: 1 },
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14, flexShrink: 1 },
  handle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, marginTop: 2 },
});

const featuredStyles = StyleSheet.create({
  card: {
    width: 300,
    minHeight: 292,
    borderRadius: T.RADIUS.xl,
    padding: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },
  banner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: T.RADIUS.xl,
  },
  bannerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,5,12,0.58)',
    borderRadius: T.RADIUS.xl,
  },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markText: { color: T.TEXT_2, fontFamily: T.FONT.semibold, fontSize: 11, letterSpacing: 1.2 },
  avatarWrap: { marginTop: 14 },
  featuredCopy: { marginTop: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 20, letterSpacing: -0.3, flexShrink: 1 },
  handle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13, marginTop: 3 },
  bio: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13, lineHeight: 19, marginTop: 9 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    // No visible border — depth comes from contrast
  },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 13 },
  price: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 11 },
  subscribeBtn: {
    marginTop: 12,
    height: 38,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeBtnLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.BG },
  subscribeBtnSubscribed: { backgroundColor: T.SURFACE_2 },
});

const creatorCardStyles = StyleSheet.create({
  card: {
    width: CREATOR_CARD_WIDTH,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },
  bannerWrap: {
    height: 96,
    overflow: 'hidden',
  },
  bannerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,5,12,0.30)',
  },
  avatarWrap: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginTop: -31,
  },
  avatarRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    padding: 2,
    overflow: 'hidden',
    backgroundColor: T.BG,
  },
  avatarInset: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 3,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 14,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  handle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11.5 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
  },
  categoryChip: {
    backgroundColor: T.ACCENT_LIGHT,
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '62%',
  },
  categoryText: {
    color: T.PRIMARY_LIGHT,
    fontFamily: T.FONT.semibold,
    fontSize: 9.5,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  subscriberMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  subscriberText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 11 },
  bio: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  subscribeBtn: {
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 4,
    height: 36,
    borderRadius: T.RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
  },
  subscribeLabel: {
    color: T.ACCENT_FG,
    fontFamily: T.FONT.semibold,
    fontSize: 12.5,
  },
  subscribeBtnSubscribed: { backgroundColor: T.SURFACE_2 },
  subscribeLabelSubscribed: { color: T.TEXT_2 },
});

const previewStyles = StyleSheet.create({
  card: {
    width: 164,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },
  art: { height: 130, padding: 12, justifyContent: 'space-between' },
  dimmedArt: { opacity: 0.2 },
  artLines: { gap: 7, marginTop: 30 },
  lineWide: { height: 5, width: '70%', backgroundColor: 'rgba(255,255,255,0.23)', borderRadius: 3 },
  lineShort: { height: 5, width: '42%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3 },
  creatorChip: {
    position: 'absolute',
    left: 10,
    bottom: 32,
  },
  typeMark: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  typeText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 10, textTransform: 'capitalize' },
  previewBadge: {
    position: 'absolute',
    right: 10,
    top: 10,
    backgroundColor: 'rgba(0,0,0,0.42)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  previewBadgeText: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 8, letterSpacing: 0.8 },
  body: { padding: 12, gap: 4 },
  title: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 12, lineHeight: 17 },
  creator: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 10 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, marginTop: 10 },
  likes: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 9 },
  locked: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 9, flexShrink: 1, textAlign: 'right' },
  lockedPremium: { color: T.GOLD },
});

const collectionStyles = StyleSheet.create({
  card: {
    width: 240,
    height: 134,
    borderRadius: T.RADIUS.xl,
    padding: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...T.SHADOWS.soft,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { marginTop: 8 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 16 },
  subtitle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, marginTop: 3 },
  count: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 11 },
});

const skeletonStyles = StyleSheet.create({
  wrap: { paddingTop: 20 },
  heroRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
  featuredSkeleton: {
    width: 254,
    height: 260,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 24,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: T.SURFACE_2 },
  copy: { height: 34, flex: 1, backgroundColor: T.SURFACE },
  button: { width: 80, height: 31, borderRadius: T.RADIUS.sm, backgroundColor: T.SURFACE },
  grid: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 22 },
  preview: { flex: 1, height: 210, borderRadius: T.RADIUS.lg, backgroundColor: T.SURFACE },
});
