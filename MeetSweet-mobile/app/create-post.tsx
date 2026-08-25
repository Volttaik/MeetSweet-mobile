import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FilmStrip,
  Image as ImageIcon,
  MonitorPlay,
  PlayCircle,
  VideoCamera,
  X,
  TextT,
} from 'phosphor-react-native';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { MsTierBadge } from '@/components/MsTierBadge';
import { MsRoomCreationLoader } from '@/components/MsRoomCreationLoader';
import { T, AppGradients } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { uploadMedia } from '@/services/media';
import { createPost } from '@/services/posts';
import { useAuth } from '@/contexts/AuthContext';
import { usePostActions } from '@/contexts/PostActionsContext';
import { dialogs } from '@/components/MsGlobalDialogs';
import { apiFetch } from '@/services/api';
import { getCategories, type Category } from '@/services/categories';
import { shouldShowOnboarding, completeOnboarding } from '@/services/onboarding';
import { MsOnboardingModal, type OnboardingScreen } from '@/components/MsOnboardingModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'type-select' | 'onboard' | 'media-picker' | 'preview' | 'uploading' | 'creating' | 'processing' | 'success';
type ContentType = 'post' | 'album' | 'video' | 'shorts';

import { TIERS, TIER_ORDER, type ContentTier } from '@/constants/tiers';

// Tier options shown in the create-post picker (Free → Subscriber → Subscriber+).
// Shorts and Albums are excluded: Shorts are always free, and Albums are
// purchase-only (priced via the dedicated create-album flow), so the picker is
// hidden for both content types.
const TIER_OPTIONS = TIER_ORDER.map((t) => ({ value: t, ...TIERS[t] }));

// Content type definitions for the type picker carousel
const CONTENT_TYPES: {
  type: ContentType;
  label: string;
  icon: React.ReactNode;
  description: string;
  accentColor: string;
}[] = [
  {
    type: 'post',
    label: 'Post',
    icon: <TextT size={28} color={T.ACCENT_FG} weight="bold" />,
    description: 'Text + images\nShows in Home feed',
    accentColor: T.ACCENT,
  },
  // Albums are deliberately NOT offered here — they are purchase-only content
  // created through the dedicated album flow (/create-album) which requires a
  // price. A tier picker here would violate the purchase-only rule.
  {
    type: 'video',
    label: 'Video',
    icon: <MonitorPlay size={28} color={T.ACCENT_FG} weight="bold" />,
    description: 'Long-form video\nShows in Explore only',
    accentColor: T.INFO,
  },
  {
    type: 'shorts',
    label: 'Shorts',
    icon: <VideoCamera size={28} color={T.ACCENT_FG} weight="bold" />,
    description: 'Vertical video (≤60s)\nShows in Shorts only',
    accentColor: T.ERROR,
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreatePostScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { markContentCreated } = usePostActions();
  const params = useLocalSearchParams<{ type?: string }>();

  // Content type state
  const [contentType, setContentType] = useState<ContentType>('post');

  // Onboarding fields
  const [caption,              setCaption]              = useState('');
  const [tier,                 setTier]                 = useState<ContentTier>('free');
  const [categories,           setCategories]           = useState<Category[]>([]);
  const [selectedCategories,   setSelectedCategories]   = useState<string[]>([]);
  const [tags,                 setTags]                 = useState<string[]>([]);
  const [tagInput,             setTagInput]             = useState('');
  const [videoTitle,           setVideoTitle]           = useState('');

  // Media state
  const [mediaUri,   setMediaUri]   = useState<string | null>(null);
  const [mediaType,  setMediaType]  = useState<'image' | 'video' | null>(null);
  const [mediaMime,  setMediaMime]  = useState('image/jpeg');
  const [mediaName,  setMediaName]  = useState('media.jpg');
  // Real asset dimensions/duration (from the picker) — sent with the upload so
  // the media record carries the true aspect ratio + duration.
  const [mediaAssetWidth,   setMediaAssetWidth]   = useState<number | undefined>(undefined);
  const [mediaAssetHeight,  setMediaAssetHeight]  = useState<number | undefined>(undefined);
  const [mediaAssetDuration, setMediaAssetDuration] = useState<number | undefined>(undefined);

  // Thumbnail state (video only)
  const [thumbnailUri,      setThumbnailUri]      = useState<string | null>(null);
  const [thumbnailMime,     setThumbnailMime]     = useState('image/jpeg');
  const [thumbnailName,     setThumbnailName]     = useState('thumbnail.jpg');
  const [retrievingThumb,   setRetrievingThumb]   = useState(false);

  // Flow state
  const initialStep: Step = params.type ? 'onboard' : 'type-select';
  const [step,           setStep]           = useState<Step>(initialStep);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error,          setError]          = useState('');
  const [publishFailed,  setPublishFailed]  = useState(false);

  // Media picker modal
  const [pickerVisible, setPickerVisible] = useState(false);

  // Post creation onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check for post creation onboarding on mount
  useEffect(() => {
    shouldShowOnboarding('post_creation_onboarded').then((shouldShow) => {
      if (shouldShow) setShowOnboarding(true);
    });
  }, []);

  const handleOnboardingComplete = async () => {
    await completeOnboarding('post_creation_onboarded');
    setShowOnboarding(false);
  };

  // Post creation onboarding screens
  const POST_CREATION_ONBOARDING: OnboardingScreen[] = [
    {
      title: 'Create Content',
      subtitle: 'Share Posts, Albums, Videos, and Shorts with your audience on MeetSweet.',
      icon: 'video',
      buttonLabel: 'Next',
      imageSource: require('../assets/onboarding/post-create.jpg'),
    },
    {
      title: 'Choose Content Type',
      subtitle: 'Select from Posts, Albums, Videos, or Shorts. Each type has different features.',
      icon: 'text',
      buttonLabel: 'Next',
      imageSource: require('../assets/onboarding/post-types.jpg'),
    },
    {
      title: 'Set Visibility',
      subtitle: 'Posts and Videos can be Free, Subscriber, or Subscriber+. Shorts are public and Albums are purchase-only.',
      icon: 'shield',
      buttonLabel: 'Start Creating',
      imageSource: require('../assets/onboarding/post-visibility.jpg'),
    },
  ];

  // ─── Draft key ────────────────────────────────────────────────────────────
  const DRAFT_KEY = 'ms_create_post_draft';

  useEffect(() => {
    getCategories().then(({ categories }) => setCategories(categories)).catch(() => {});
    // If type param was passed (e.g. from profile tab)
    if (params.type === 'video')  { setContentType('video');  }
    if (params.type === 'shorts') { setContentType('shorts'); }

    // ── Restore draft ────────────────────────────────────────────────────────
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const draft = JSON.parse(raw);
        if (draft.caption)                     setCaption(draft.caption);
        if (draft.tags)                        setTags(draft.tags);
        if (draft.tier) {
          const rawTier = draft.tier as string;
          if (rawTier === 'subscriber_plus') setTier('subscriber_plus');
          else if (rawTier === 'subscriber') setTier('subscriber');
          else setTier('free');
        }
        // Albums are created through the dedicated /create-album flow, so
        // only post/video/shorts can be restored here (a stale album draft
        // from before that change falls back to the default content type).
        if (
          (draft.contentType === 'post' || draft.contentType === 'video' || draft.contentType === 'shorts') &&
          !params.type
        ) {
          setContentType(draft.contentType);
        }
        if (draft.videoTitle)                  setVideoTitle(draft.videoTitle);
        if (draft.mediaUri)                    setMediaUri(draft.mediaUri);
        if (draft.mediaType)                   setMediaType(draft.mediaType);
        if (draft.mediaMime)                   setMediaMime(draft.mediaMime);
        if (draft.mediaName)                   setMediaName(draft.mediaName);
        if (draft.thumbnailUri)                setThumbnailUri(draft.thumbnailUri);
        if (draft.selectedCategories)          setSelectedCategories(draft.selectedCategories);
      } catch {/* ignore corrupt draft */}
    }).catch(() => {});
  }, []);

  // ── Auto-save draft ────────────────────────────────────────────────────────
  useEffect(() => {
    const draftData = {
      caption,
      videoTitle,
      tier,
      contentType,
      tags,
      selectedCategories,
      mediaUri,
      mediaType,
      mediaMime,
      mediaName,
      thumbnailUri,
      updatedAt: new Date().toISOString(),
    };
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftData)).catch(() => {});
  }, [
    caption,
    videoTitle,
    tier,
    contentType,
    tags,
    selectedCategories,
    mediaUri,
    mediaType,
    mediaMime,
    mediaName,
    thumbnailUri,
  ]);

  // ── Auto-save draft on field changes ──────────────────────────────────────
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Don't auto-save during upload/success steps
    if (step === 'uploading' || step === 'creating' || step === 'success') return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      const draft = { caption, tags, tier, contentType, videoTitle };
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }, 800);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [caption, tags, tier, contentType, videoTitle, step]);

  // ─── Media picker ─────────────────────────────────────────────────────────

  const pickMedia = useCallback(async (type: 'image' | 'video') => {
    setPickerVisible(false);
    await new Promise((r) => setTimeout(r, 300));

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      dialogs.alert({ title: 'Permission required', message: 'Allow access to your media library to upload content.' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:       type === 'image' ? ['images'] : ['videos'],
      allowsEditing:    false,   // no forced crop — full native aspect ratio
      quality:          type === 'image' ? 0.92 : undefined,
      videoMaxDuration: contentType === 'shorts' ? 60 : 300,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const mime  = asset.mimeType ?? (type === 'image' ? 'image/jpeg' : 'video/mp4');
    const ext   = asset.fileName?.split('.').pop() ?? (type === 'image' ? 'jpg' : 'mp4');

    setMediaUri(asset.uri);
    setMediaType(type);
    setMediaMime(mime);
    setMediaName(asset.fileName ?? `media-${Date.now()}.${ext}`);
    setMediaAssetWidth(asset.width ?? undefined);
    setMediaAssetHeight(asset.height ?? undefined);
    // expo-image-picker reports `duration` in MILLISECONDS. The media record
    // (and every API response) stores SECONDS — converting here keeps feed
    // badges and the player's duration display truthful (a 48s video used to
    // show "13:15:35" because 47735ms was stored as 47735 seconds).
    setMediaAssetDuration(asset.duration ? Math.round(asset.duration / 1000) : undefined);

    // Auto-generate thumbnail from the first frame for both long-form videos and Shorts.
    // The user can still tap the thumbnail to pick a custom one.
    if (type === 'video' && (contentType === 'video' || contentType === 'shorts')) {
      setRetrievingThumb(true);
      try {
        const thumb = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 150 });
        setThumbnailUri(thumb.uri);
        setThumbnailMime('image/jpeg');
        setThumbnailName(`thumb-${Date.now()}.jpg`);
      } catch {
        // Silent fallback — thumbnail picker still visible so user can add manually
      } finally {
        setRetrievingThumb(false);
      }
    }

    setStep('preview');
  }, [contentType]);

  const removeMedia = () => {
    setMediaUri(null);
    setMediaType(null);
    setThumbnailUri(null);
    setStep('onboard');
  };

  // ─── Thumbnail picker (video only) ────────────────────────────────────────

  const pickThumbnail = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,   // no forced crop on thumbnail either
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setThumbnailUri(asset.uri);
    setThumbnailMime(asset.mimeType ?? 'image/jpeg');
    setThumbnailName(asset.fileName ?? `thumb-${Date.now()}.jpg`);
  }, []);

  // ─── Tags ─────────────────────────────────────────────────────────────────

  const addTag = () => {
    const cleaned = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (cleaned && !tags.includes(cleaned) && tags.length < 10) {
      setTags((t) => [...t, cleaned]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags((t) => t.filter((x) => x !== tag));

  const toggleCategory = (id: string) =>
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  // ─── Publish ──────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!caption.trim() && !mediaUri && contentType !== 'post') {
      setError('Select media before publishing.');
      return;
    }
    if (contentType === 'video' && !videoTitle.trim()) {
      setError('Add a title for your video.');
      return;
    }

    setError('');
    setPublishFailed(false);
    setStep('uploading');
    setUploadProgress(0);

    try {
      let mediaIds: string[] | undefined;
      // Hoisted so it's available in the createPost payload below
      let thumbUrl: string | undefined;

      if (mediaUri && mediaType) {
        // Pass the asset's real dimensions/duration so the media record (and
        // every feed/detail response) carries the true aspect ratio + duration
        // — the player sizes instantly instead of jumping after the first frame.
        const assetMeta =
          mediaType === 'video'
            ? { width: mediaAssetWidth, height: mediaAssetHeight, durationSecs: mediaAssetDuration }
            : undefined;
        const uploaded = await uploadMedia(mediaUri, mediaMime, mediaName, (p) => {
          setUploadProgress(thumbnailUri ? p * 0.9 : p);
        }, assetMeta, contentType === 'video');

        if (thumbnailUri) {
          const uploadedThumb = await uploadMedia(thumbnailUri, thumbnailMime, thumbnailName, (p) => {
            setUploadProgress(0.9 + p * 0.1);
          });
          thumbUrl = uploadedThumb.url || undefined;
        }

        // Use the stable media ID returned by POST /api/uploads/:id/complete.
        mediaIds = [uploaded.id];

        // Attach thumbnail to the media record (best-effort PATCH).
        // We also send thumbnail_url directly in createPost below as a fallback.
        if (thumbUrl && uploaded.id) {
          try {
            const { getAccessToken } = await import('@/lib/session-storage');
            const _tok = await getAccessToken();
            if (_tok) {
              await apiFetch(`/media/${uploaded.id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${_tok}` },
                body: JSON.stringify({ thumbnail_url: thumbUrl }),
              });
            }
          } catch {
            // Non-critical — thumbnail will still be set via createPost's thumbnail_url field
          }
        }
      }

      setStep('creating');

      // Map contentType → backend content_type field
      const backendContentType: Record<ContentType, 'post' | 'video' | 'short' | 'album'> = {
        post:   'post',
        album:  'album',
        video:  'video',
        shorts: 'short',
      };

      const finalCaption = caption.trim();

      // Shorts are always free/public; everything else maps from the tier picker.
      const resolvedVisibility =
        contentType === 'shorts' ? 'public' : (tier === 'subscriber_plus' ? 'subscribers' : TIERS[tier].visibility);

      await createPost({
        caption:       finalCaption,
        visibility:    resolvedVisibility,
        media_ids:     mediaIds,
        categories:    selectedCategories,
        tags,
        content_type:  backendContentType[contentType],
        // Send title as its own field for videos (not collapsed into caption)
        title:         contentType === 'video' && videoTitle.trim() ? videoTitle.trim() : undefined,
        // Send tier so backend can store it when multi-tier is supported
        tier:          contentType === 'shorts' ? 'free' : tier,
        // Send thumbnail URL directly — fallback if the separate PATCH fails
        thumbnail_url: thumbUrl,
        // Comments ON by default — the backend creates/associates a Comment
        // Room when the post is created (post → commentRoomId).
        comments_enabled: true,
      });

      setStep('processing');
      await new Promise((r) => setTimeout(r, 600));
      setStep('success');
      await new Promise((r) => setTimeout(r, 1200));

      // Clear the draft on success
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      // Bump the shared content-created version so the (already-mounted) Home
      // and Profile feeds refresh on their next focus — the new post appears
      // without closing/reopening the app.
      markContentCreated();
      router.replace('/(tabs)');
    } catch (err) {
      setError((err as Error).message ?? 'Publish failed. Please try again.');
      setPublishFailed(true);
    }
  };

  const contentLabel = {
    post:   'Post',
    album:  'Album',
    video:  'Video',
    shorts: 'Short',
  }[contentType];

  // ─── Publishing overlay (Create Chatroom-style loader) ─────────────────────
  // The step machine drives clean status copy around the shared disc loader:
  //   PREPARING → UPLOADING → CREATING → PROCESSING → COMPLETE
  if (step === 'uploading' || step === 'creating' || step === 'processing' || step === 'success') {
    const phaseCopy = {
      uploading: {
        label: 'Uploading',
        status: thumbnailUri && uploadProgress >= 0.88 ? 'Uploading thumbnail…' : 'Uploading media…',
      },
      creating:  { label: 'Creating',  status: `Creating your ${contentLabel.toLowerCase()}…` },
      processing:{ label: 'Finalising',status: 'Wrapping up…' },
    }[step === 'success' ? 'processing' : step];

    return (
      <MsRoomCreationLoader
        visible
        label={phaseCopy.label}
        hint={phaseCopy.status}
        status={step === 'success' ? null : phaseCopy.status}
        error={publishFailed ? error : null}
        success={step === 'success' && !publishFailed}
        successTitle="Published!"
        successSubtitle={`Your ${contentLabel.toLowerCase()} is live.`}
        onRetry={publishFailed ? handlePublish : undefined}
        onCancel={publishFailed ? () => { setPublishFailed(false); setStep('preview'); } : undefined}
        onDone={() => router.replace('/(tabs)')}
      />
    );
  }

  // ─── Type Select step ─────────────────────────────────────────────────────

  if (step === 'type-select') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => goBack()}>
            <X size={20} color={T.TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create</Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.typeSectionTitle}>What would you like to share?</Text>

        <ScrollView contentContainerStyle={styles.typeGrid} showsVerticalScrollIndicator={false}>
          {CONTENT_TYPES.map((ct) => (
            <TouchableOpacity
              key={ct.type}
              style={[styles.typeCard, contentType === ct.type && { borderColor: ct.accentColor, borderWidth: 2 }]}
              onPress={() => {
                // Creator-only types (videos, shorts, albums) open the styled
                // creator gate sheet; on server-confirmed activation the flow
                // continues here. The server stays the authority.
                if ((ct.type === 'video' || ct.type === 'shorts' || ct.type === 'album') && user && !user.isCreator) {
                  dialogs.creatorGate({
                    message: ct.type === 'album'
                      ? 'Albums are a creator feature — set a price and sell your collection.'
                      : ct.type === 'video'
                        ? 'Long-form videos are a creator feature.'
                        : 'Shorts are a creator feature.',
                    onSuccess: () => { setContentType(ct.type); setStep('onboard'); },
                  });
                  return;
                }
                setContentType(ct.type);
                setStep('onboard');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.typeCardIcon, { backgroundColor: ct.accentColor }]}>
                {ct.icon}
              </View>
              <View style={styles.typeCardText}>
                <Text style={styles.typeCardLabel}>{ct.label}</Text>
                <Text style={styles.typeCardDesc}>{ct.description}</Text>
              </View>
              <ArrowRight size={18} color={T.TEXT_3} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ─── Preview step ─────────────────────────────────────────────────────────

  if (step === 'preview') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setStep('onboard')}>
            <ArrowLeft size={20} color={T.TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Preview</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Media preview */}
          {!!mediaUri && (
            <View style={styles.previewMediaWrap}>
              {mediaType === 'image' ? (
                <Image source={{ uri: mediaUri }} style={styles.previewImg} resizeMode="cover" />
              ) : (
                <View style={{ aspectRatio: contentType === 'shorts' ? 9 / 16 : 16 / 9, overflow: 'hidden' }}>
                  <MsVideoPlayer
                    videoId={mediaUri}
                    uri={mediaUri}
                    mode="standard"
                    fillContainer
                    autoPlay
                  />
                </View>
              )}
              <TouchableOpacity style={styles.removeMedia} onPress={removeMedia}>
                <X size={15} color={T.TEXT} weight="bold" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.changeMedia} onPress={() => setPickerVisible(true)}>
                <Text style={styles.changeMediaLabel}>Change</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Thumbnail picker — auto-generated from first frame; tap to change */}
          {(contentType === 'video' || contentType === 'shorts') && (
            <View style={[styles.section, { paddingTop: 8 }]}>
              <Text style={styles.sectionTitle}>Thumbnail</Text>
              {retrievingThumb ? (
                <View style={[styles.thumbnailPicker, styles.thumbnailRetrieving]}>
                  <ActivityIndicator size="small" color={T.TEXT_2} />
                  <Text style={styles.thumbnailRetrievingLabel}>Retrieving thumbnail…</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.thumbnailPicker} onPress={pickThumbnail} activeOpacity={0.8}>
                  {thumbnailUri ? (
                    <>
                      <Image source={{ uri: thumbnailUri }} style={styles.thumbnailPreview} resizeMode="cover" />
                      <View style={styles.thumbnailChangeBadge}>
                        <Text style={styles.thumbnailChangeBadgeLabel}>Tap to change</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.thumbnailPlaceholder}>
                      <ImageIcon size={24} color={T.TEXT_3} />
                      <Text style={styles.thumbnailPlaceholderLabel}>Add thumbnail</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <Text style={styles.charHint}>Auto-extracted from video · tap to use a custom image</Text>
            </View>
          )}

          {/* Caption summary */}
          {!!caption.trim() && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Caption</Text>
              <Text style={styles.previewCaption} numberOfLines={3}>{caption}</Text>
            </View>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.tagRow}>
                {tags.map((t) => (
                  <View key={t} style={styles.tagChip}>
                    <Text style={styles.tagChipLabel}>#{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Visibility summary — Shorts have no tier, show Public instead */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visibility</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {contentType === 'shorts' ? (
                <Text style={styles.previewCaption}>Public · available to everyone</Text>
              ) : (
                <MsTierBadge tier={tier} size="sm" />
              )}
            </View>
          </View>

          {/* Error */}
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* Publish button */}
          <TouchableOpacity style={styles.publishBtn} onPress={handlePublish} activeOpacity={0.85}>
            <LinearGradient colors={AppGradients.brand} locations={AppGradients.brandLocs} style={StyleSheet.absoluteFill} />
            <Text style={styles.publishLabel}>Publish {contentLabel}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Media picker modal */}
        <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
          <Pressable style={styles.pickerOverlay} onPress={() => setPickerVisible(false)}>
            <View style={[styles.pickerSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={styles.pickerHandle} />
              <Text style={styles.pickerTitle}>Select Media</Text>
              <TouchableOpacity style={styles.pickerOption} onPress={() => pickMedia('image')} activeOpacity={0.8}>
                <ImageIcon size={22} color={T.TEXT_2} />
                <Text style={styles.pickerOptionLabel}>Photo</Text>
              </TouchableOpacity>
              {contentType !== 'post' && (
                <TouchableOpacity style={styles.pickerOption} onPress={() => pickMedia('video')} activeOpacity={0.8}>
                  <FilmStrip size={22} color={T.TEXT_2} />
                  <Text style={styles.pickerOptionLabel}>
                    {contentType === 'shorts' ? 'Short Video (max 60s)' : 'Video (max 5 min)'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.pickerCancel} onPress={() => setPickerVisible(false)}>
                <Text style={styles.pickerCancelLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // ─── Onboard step (main form) ─────────────────────────────────────────────

  // Albums are only created via /create-album, so they never appear here;
  // fall back to 'post' defensively (e.g. a stale draft before the change).
  const selectedCt = CONTENT_TYPES.find((c) => c.type === contentType) ?? CONTENT_TYPES[0];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setStep('type-select')}>
          <ArrowLeft size={20} color={T.TEXT} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.headerTypeBadge, { backgroundColor: selectedCt.accentColor + '22' }]}>
            <Text style={[styles.headerTypeLabel, { color: selectedCt.accentColor }]}>{selectedCt.label}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => {
            if (!mediaUri && contentType !== 'post') {
              setPickerVisible(true);
            } else {
              setStep('preview');
            }
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.continueBtnLabel}>Next</Text>
          <ArrowRight size={14} color={T.BG} weight="bold" />
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.formContent}>

          {/* Video title (video type only) */}
          {contentType === 'video' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Title *</Text>
              <TextInput
                style={styles.input}
                value={videoTitle}
                onChangeText={setVideoTitle}
                placeholder="Give your video a title…"
                placeholderTextColor={T.TEXT_3}
                maxLength={150}
                autoFocus
              />
            </View>
          )}

          {/* Caption */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {contentType === 'video' || contentType === 'shorts' ? 'Description' : 'Caption'}
            </Text>
            <TextInput
              style={[styles.input, styles.captionInput]}
              value={caption}
              onChangeText={setCaption}
              placeholder={
                contentType === 'post'   ? "What's on your mind?" :
                contentType === 'album'  ? "Describe your album…" :
                contentType === 'video'  ? "Tell viewers about this video…" :
                "Add a caption…"
              }
              placeholderTextColor={T.TEXT_3}
              multiline
              maxLength={contentType === 'video' ? 2000 : 2200}
              textAlignVertical="top"
              autoFocus={contentType !== 'video'}
            />
            <Text style={styles.charHint}>{caption.length}/{contentType === 'video' ? 2000 : 2200}</Text>
          </View>

          {/* Media selector */}
          {contentType !== 'post' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {contentType === 'album'  ? 'Photos / Videos' :
                 contentType === 'video'  ? 'Video File' :
                 'Short Video'}
              </Text>
              {mediaUri ? (
                <View style={styles.previewMediaWrap}>
                  {mediaType === 'image' ? (
                    <Image source={{ uri: mediaUri }} style={{ height: 160, borderRadius: 12 }} resizeMode="cover" />
                  ) : (
                    <View style={{ aspectRatio: contentType === 'shorts' ? 9 / 16 : 16 / 9, overflow: 'hidden', borderRadius: 12 }}>
                      <MsVideoPlayer
                        videoId={mediaUri}
                        uri={mediaUri}
                        mode="standard"
                        fillContainer
                        autoPlay
                      />
                    </View>
                  )}
                  <TouchableOpacity style={styles.removeMedia} onPress={removeMedia}>
                    <X size={14} color={T.TEXT} weight="bold" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.mediaPicker} onPress={() => setPickerVisible(true)} activeOpacity={0.8}>
                  <View style={[styles.mediaPickerIcon, { backgroundColor: selectedCt.accentColor + '22' }]}>
                    {selectedCt.icon}
                  </View>
                  <Text style={styles.mediaPickerLabel}>
                    {contentType === 'album'  ? 'Select photos or videos' :
                     contentType === 'video'  ? 'Select video (max 5 min)' :
                     'Select short video (max 60s)'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Post image picker */}
          {contentType === 'post' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Add Image (optional)</Text>
              {mediaUri ? (
                <View style={styles.previewMediaWrap}>
                  <Image source={{ uri: mediaUri }} style={{ height: 200, borderRadius: 12 }} resizeMode="cover" />
                  <TouchableOpacity style={styles.removeMedia} onPress={removeMedia}>
                    <X size={14} color={T.TEXT} weight="bold" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.mediaPicker} onPress={() => pickMedia('image')} activeOpacity={0.8}>
                  <ImageIcon size={28} color={T.TEXT_3} />
                  <Text style={styles.mediaPickerLabel}>Add a photo</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Visibility picker — creators only. Hidden for non-creators (plain
              Create Post flow, posts stay public), Shorts (always free) and
              Albums (purchase-only via the album flow) */}
          {user?.isCreator && contentType !== 'shorts' && contentType !== 'album' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Visibility</Text>
              <View style={styles.visibilityRow}>
                {TIER_OPTIONS.map((opt) => {
                  const active = opt.value === tier;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.visOpt,
                        active && { ...styles.visOptActive, borderColor: opt.color },
                      ]}
                      onPress={() => setTier(opt.value)}
                      activeOpacity={0.75}
                    >
                      <MsTierBadge tier={opt.value} size="xs" />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.tierHint}>
                {TIERS[tier].description}
              </Text>
            </View>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Categories</Text>
              <View style={styles.categoryRow}>
                {categories.map((cat) => {
                  const active = selectedCategories.includes(cat.id);
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.catChip, active && styles.catChipActive]}
                      onPress={() => toggleCategory(cat.id)}
                      activeOpacity={0.75}
                    >
                      {active && <BrandGradientFill />}
                      <Text style={[styles.catLabel, active && styles.catLabelActive]}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Tags */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tags</Text>
            <View style={styles.tagInput}>
              <Text style={styles.tagHash}>#</Text>
              <TextInput
                style={styles.tagTextInput}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={addTag}
                placeholder="Add a tag…"
                placeholderTextColor={T.TEXT_3}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                blurOnSubmit={false}
              />
              {tagInput.trim().length > 0 && (
                <TouchableOpacity onPress={addTag} hitSlop={8}>
                  <Check size={16} color={T.PRIMARY_LIGHT} weight="bold" />
                </TouchableOpacity>
              )}
            </View>
            {tags.length > 0 && (
              <View style={styles.tagRow}>
                {tags.map((t) => (
                  <TouchableOpacity key={t} style={styles.tagChip} onPress={() => removeTag(t)} activeOpacity={0.8}>
                    <Text style={styles.tagChipLabel}>#{t}</Text>
                    <X size={10} color={T.TEXT_2} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Routing info banner */}
          <View style={[styles.routingBanner, { backgroundColor: selectedCt.accentColor + '12' }]}>
            <Text style={[styles.routingText, { color: selectedCt.accentColor }]}>
              {contentType === 'post'   ? 'Will appear in Home feed & your Profile' :
               contentType === 'album'  ? 'Will appear in Home feed & your Profile' :
               contentType === 'video'  ? 'Will appear in Explore & your Profile' :
               'Will appear in Shorts & your Profile'}
            </Text>
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      </KeyboardAwareScrollViewCompat>

      {/* Media picker modal */}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerVisible(false)}>
          <View style={[styles.pickerSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Select Media</Text>
            {contentType !== 'video' && contentType !== 'shorts' && (
              <TouchableOpacity style={styles.pickerOption} onPress={() => pickMedia('image')} activeOpacity={0.8}>
                <ImageIcon size={22} color={T.TEXT_2} />
                <Text style={styles.pickerOptionLabel}>Photo</Text>
              </TouchableOpacity>
            )}
            {contentType !== 'post' && (
              <TouchableOpacity style={styles.pickerOption} onPress={() => pickMedia('video')} activeOpacity={0.8}>
                <FilmStrip size={22} color={T.TEXT_2} />
                <Text style={styles.pickerOptionLabel}>
                  {contentType === 'shorts' ? 'Short Video (max 60s)' : 'Video (max 5 min)'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.pickerCancel} onPress={() => setPickerVisible(false)}>
              <Text style={styles.pickerCancelLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Post creation onboarding modal */}
      <MsOnboardingModal
        visible={showOnboarding}
        screens={POST_CREATION_ONBOARDING}
        onComplete={handleOnboardingComplete}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  thumbnailChangeBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: T.RADIUS.full,
  },
  thumbnailChangeBadgeLabel: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },
  thumbnailRetrieving: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 64,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
  },
  thumbnailRetrievingLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
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
    flex: 1,
    fontSize: 17,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    textAlign: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: T.RADIUS.full,
  },
  headerTypeLabel: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
  },
  continueBtnLabel: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },

  // Type select
  typeSectionTitle: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  typeGrid: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  typeCardIcon: {
    width: 56,
    height: 56,
    borderRadius: T.RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeCardText: { flex: 1 },
  typeCardLabel: {
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    marginBottom: 2,
  },
  typeCardDesc: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 17,
  },

  // Form
  formContent: { paddingHorizontal: 20, paddingBottom: 60, gap: 0 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    // Vertically centre the text inside the 48px field on Android.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  captionInput: {
    height: 120,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  charHint: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'right',
    marginTop: 4,
  },

  mediaPicker: {
    height: 100,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexDirection: 'row',
  },
  mediaPickerIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPickerLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  previewMediaWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  previewImg: { width: '100%', height: 240, borderRadius: 12 },
  videoThumb: {
    height: 160,
    backgroundColor: T.SURFACE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  videoLabel: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  removeMedia: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeMedia: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  changeMediaLabel: { fontSize: 12, fontFamily: T.FONT.medium, color: '#fff' },
  previewCaption: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 21,
  },

  thumbnailPicker: {
    height: 90,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: T.SURFACE,
  },
  thumbnailPreview: { width: '100%', height: '100%' },
  thumbnailPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexDirection: 'row',
  },
  thumbnailPlaceholderLabel: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },

  tierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tierHint: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 6,
  },
  visibilityRow: { flexDirection: 'row', gap: 8 },
  visOpt: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    minHeight: 32,
  },
  visOptActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  visLabel: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_3 },
  visLabelActive: { color: T.TEXT },

  tierRow: { flexDirection: 'row', gap: 8 },
  tierOpt: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tierLabel: { fontSize: 12, fontFamily: T.FONT.semibold, color: T.TEXT },
  tierOptDesc: { fontSize: 10, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 2 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    padding: 14,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  toggleIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT },
  toggleDesc: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 1 },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: T.SURFACE_2,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: T.ACCENT, overflow: 'hidden' },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  toggleKnobOn: { alignSelf: 'flex-end' },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  priceInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    height: 32,
  },
  priceUnit: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2 },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    overflow: 'hidden',
  },
  catChipActive: {},
  catLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  catLabelActive: { color: '#FFFFFF', fontFamily: T.FONT.bold },

  tagInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 14,
    height: 44,
    gap: 6,
  },
  tagHash: { fontSize: 15, fontFamily: T.FONT.medium, color: T.TEXT_3 },
  tagTextInput: { flex: 1, fontSize: 15, fontFamily: T.FONT.regular, color: T.TEXT },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
  },
  tagChipLabel: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },

  routingBanner: {
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  routingText: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    lineHeight: 18,
  },

  errorText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.DANGER,
    marginBottom: 12,
  },

  publishBtn: {
    height: 52,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  publishLabel: { fontSize: 16, fontFamily: T.FONT.semibold, color: T.ACCENT_FG },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },

  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 4,
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: { fontSize: 16, fontFamily: T.FONT.semibold, color: T.TEXT, marginBottom: 8 },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  pickerOptionLabel: { fontSize: 15, fontFamily: T.FONT.medium, color: T.TEXT },
  pickerCancel: { paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  pickerCancelLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_2 },
});