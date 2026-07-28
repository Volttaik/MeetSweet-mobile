import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FilmStrip,
  Image as ImageIcon,
  Lightning,
  LockSimple,
  MonitorPlay,
  PlayCircle,
  VideoCamera,
  X,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { uploadMedia } from '@/services/media';
import { createPost } from '@/services/posts';
import type { PostMediaInput } from '@/services/posts';
import { getCategories, type Category } from '@/services/categories';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'onboard' | 'media-picker' | 'preview' | 'uploading' | 'creating' | 'processing' | 'success';
type VideoContentType = 'short' | 'video';

const VISIBILITY_OPTIONS = [
  { value: 'public' as const,      label: 'Public',      description: 'Visible to everyone' },
  { value: 'subscribers' as const, label: 'Subscribers', description: 'Subscribers only' },
  { value: 'draft' as const,       label: 'Draft',       description: 'Only you' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreatePostScreen() {
  const insets = useSafeAreaInsets();

  // Onboarding fields
  const [caption,              setCaption]              = useState('');
  const [visibility,           setVisibility]           = useState<'public' | 'subscribers' | 'draft'>('public');
  const [categories,           setCategories]           = useState<Category[]>([]);
  const [selectedCategories,   setSelectedCategories]   = useState<string[]>([]);
  const [tags,                 setTags]                 = useState<string[]>([]);
  const [tagInput,             setTagInput]             = useState('');
  const [isPaid,               setIsPaid]               = useState(false);
  const [creditPrice,          setCreditPrice]          = useState('50');

  // Media state
  const [mediaUri,   setMediaUri]   = useState<string | null>(null);
  const [mediaType,  setMediaType]  = useState<'image' | 'video' | null>(null);
  const [mediaMime,  setMediaMime]  = useState('image/jpeg');
  const [mediaName,  setMediaName]  = useState('media.jpg');

  // Thumbnail state (long-form video only)
  const [thumbnailUri,  setThumbnailUri]  = useState<string | null>(null);
  const [thumbnailMime, setThumbnailMime] = useState('image/jpeg');
  const [thumbnailName, setThumbnailName] = useState('thumbnail.jpg');

  // Flow state
  const [step,           setStep]           = useState<Step>('onboard');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error,          setError]          = useState('');

  // Media picker modal
  const [pickerVisible, setPickerVisible] = useState(false);

  // Video type selector (Short vs Long-form Video)
  const [videoContentType,      setVideoContentType]      = useState<VideoContentType | null>(null);
  const [videoTypeSheetVisible, setVideoTypeSheetVisible] = useState(false);

  useEffect(() => {
    getCategories().then(({ categories }) => setCategories(categories)).catch(() => {});
  }, []);

  // ─── Media picker ─────────────────────────────────────────────────────────
  // Identical approach to edit-profile avatar/banner: requestPermission → launchImageLibraryAsync

  const pickMedia = useCallback(async (type: 'image' | 'video') => {
    setPickerVisible(false);
    await new Promise((r) => setTimeout(r, 300)); // let modal close first

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow access to your media library to upload content.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:       type === 'image' ? ['images'] : ['videos'],
      allowsEditing:    type === 'image',
      aspect:           type === 'image' ? [4, 5] : undefined,
      quality:          type === 'image' ? 0.85 : undefined,
      videoMaxDuration: 300,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const mime  = asset.mimeType ?? (type === 'image' ? 'image/jpeg' : 'video/mp4');
    const ext   = asset.fileName?.split('.').pop() ?? (type === 'image' ? 'jpg' : 'mp4');

    setMediaUri(asset.uri);
    setMediaType(type);
    setMediaMime(mime);
    setMediaName(asset.fileName ?? `media-${Date.now()}.${ext}`);
    // For videos, show the content-type selector before proceeding to preview
    if (type === 'video') {
      setVideoTypeSheetVisible(true);
    } else {
      setStep('preview');
    }
  }, []);

  const removeMedia = () => {
    setMediaUri(null);
    setMediaType(null);
    setThumbnailUri(null);
    setStep('onboard');
  };

  // ─── Thumbnail picker (long-form video only) ──────────────────────────────

  const pickThumbnail = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow access to your media library to select a thumbnail.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
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
    if (!caption.trim() && !mediaUri) {
      setError('Add a caption or select media before publishing.');
      return;
    }
    // If video but no type chosen yet, prompt the user
    if (mediaType === 'video' && !videoContentType) {
      setVideoTypeSheetVisible(true);
      return;
    }

    setError('');
    setStep('uploading');
    setUploadProgress(0);

    try {
      let mediaArr: PostMediaInput[] | undefined;

      if (mediaUri && mediaType) {
        const uploaded = await uploadMedia(mediaUri, mediaMime, mediaName, (p) => {
          // Scale media upload to 0–90% so thumbnail upload fits in 90–100%
          setUploadProgress(thumbnailUri && mediaType === 'video' && videoContentType === 'video' ? p * 0.9 : p);
        });

        // Upload custom thumbnail for long-form video if one was selected
        let thumbUrl: string | undefined;
        if (thumbnailUri && mediaType === 'video' && videoContentType === 'video') {
          const uploadedThumb = await uploadMedia(thumbnailUri, thumbnailMime, thumbnailName, (p) => {
            setUploadProgress(0.9 + p * 0.1);
          });
          thumbUrl = uploadedThumb.url;
        }

        mediaArr = [{
          url:           uploaded.url,
          blob_path:     uploaded.objectKey,
          type:          mediaType === 'video' ? 'video' : 'image',
          mime_type:     uploaded.mimeType,
          size_bytes:    uploaded.sizeBytes,
          ...(thumbUrl ? { thumbnail_url: thumbUrl } : {}),
        }];
      }

      setStep('creating');

      // Both Short and Video content types use the same createPost endpoint.
      // The backend has no dedicated /shorts or /videos endpoints.
      await createPost({
        caption:    caption.trim(),
        visibility: isPaid ? 'subscribers' as const : visibility,
        media:      mediaArr,
        categories: selectedCategories,
        tags,
        ...(isPaid ? { unlock_price: parseInt(creditPrice, 10) || 50 } : {}),
      });

      setStep('processing');
      await new Promise((r) => setTimeout(r, 600));
      setStep('success');
      await new Promise((r) => setTimeout(r, 1200));

      router.replace('/(tabs)');
    } catch (err) {
      setError((err as Error).message ?? 'Publish failed. Please try again.');
      setStep('preview');
    }
  };

  const contentLabel =
    videoContentType === 'short' ? 'Short' :
    videoContentType === 'video' ? 'Video' :
    'Post';

  // ─── Publishing overlay ───────────────────────────────────────────────────

  if (step === 'uploading' || step === 'creating' || step === 'processing' || step === 'success') {
    return (
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.overlayCard}>
          {step === 'success' ? (
            <>
              <View style={styles.successIcon}>
                <Check size={32} color={T.BG} weight="bold" />
              </View>
              <Text style={styles.overlayTitle}>Published!</Text>
              <Text style={styles.overlaySubtitle}>Your {contentLabel.toLowerCase()} is now live.</Text>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={T.ACCENT} />
              <Text style={styles.overlayTitle}>
                {step === 'uploading' ? 'Uploading Media'
                  : step === 'creating' ? 'Creating Post'
                  : 'Processing…'}
              </Text>
              {step === 'uploading' && uploadProgress > 0 ? (
                <>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${Math.round(uploadProgress * 100)}%` as any }]} />
                  </View>
                  <Text style={styles.overlaySubtitle}>{Math.round(uploadProgress * 100)}%</Text>
                </>
              ) : (
                <Text style={styles.overlaySubtitle}>Please wait…</Text>
              )}
            </>
          )}
        </View>
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
          {mediaUri && (
            <View style={styles.previewMediaWrap}>
              {mediaType === 'image' ? (
                <Image source={{ uri: mediaUri }} style={styles.previewImg} resizeMode="cover" />
              ) : (
                <View style={styles.videoThumb}>
                  <FilmStrip size={40} color={T.TEXT_2} />
                  <Text style={styles.videoLabel}>Video selected</Text>
                </View>
              )}
              <TouchableOpacity style={styles.removeMedia} onPress={removeMedia}>
                <X size={15} color={T.TEXT} weight="bold" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.changeMedia}
                onPress={() => setPickerVisible(true)}
              >
                <Text style={styles.changeMediaLabel}>Change</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Thumbnail picker — long-form video only */}
          {mediaType === 'video' && videoContentType === 'video' && (
            <View style={[styles.section, { paddingTop: 8 }]}>
              <Text style={styles.sectionTitle}>Video Thumbnail</Text>
              <TouchableOpacity
                style={styles.thumbnailPicker}
                onPress={pickThumbnail}
                activeOpacity={0.8}
              >
                {thumbnailUri ? (
                  <Image
                    source={{ uri: thumbnailUri }}
                    style={styles.thumbnailPreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.thumbnailEmpty}>
                    <PlayCircle size={30} color={T.TEXT_3} />
                    <Text style={styles.thumbnailEmptyLabel}>Tap to add a thumbnail</Text>
                  </View>
                )}
              </TouchableOpacity>
              {thumbnailUri ? (
                <TouchableOpacity onPress={() => setThumbnailUri(null)} activeOpacity={0.7}>
                  <Text style={styles.thumbnailRemoveLabel}>Remove thumbnail</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* Caption preview */}
          {!!caption.trim() && (
            <View style={styles.previewCaption}>
              <Text style={styles.previewCaptionText}>{caption}</Text>
            </View>
          )}

          {/* Paid badge */}
          {isPaid && (
            <View style={styles.paidBadge}>
              <LockSimple size={14} color={T.ACCENT} />
              <Text style={styles.paidBadgeText}>Paid content · {creditPrice} credits to unlock</Text>
            </View>
          )}

          {/* Visibility */}
          <View style={styles.previewMeta}>
            <Text style={styles.previewMetaLabel}>Visibility</Text>
            <Text style={styles.previewMetaValue}>
              {isPaid ? 'Subscribers Only (Paid)' : VISIBILITY_OPTIONS.find(o => o.value === visibility)?.label}
            </Text>
          </View>

          {selectedCategories.length > 0 && (
            <View style={styles.previewMeta}>
              <Text style={styles.previewMetaLabel}>Categories</Text>
              <Text style={styles.previewMetaValue}>
                {categories.filter(c => selectedCategories.includes(c.id)).map(c => c.name).join(', ')}
              </Text>
            </View>
          )}

          {tags.length > 0 && (
            <View style={styles.previewMeta}>
              <Text style={styles.previewMetaLabel}>Tags</Text>
              <Text style={styles.previewMetaValue}>{tags.map(t => `#${t}`).join(' ')}</Text>
            </View>
          )}

          {!!error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.publishFooterBtn} onPress={handlePublish} activeOpacity={0.85}>
            <Text style={styles.publishFooterBtnLabel}>Publish now</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Media picker modal */}
        <MediaPickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onPickImage={() => pickMedia('image')}
          onPickVideo={() => pickMedia('video')}
          onSkipMedia={() => setPickerVisible(false)}
          insets={insets}
        />
        {/* Video type selector */}
        <VideoTypeModal
          visible={videoTypeSheetVisible}
          onClose={() => setVideoTypeSheetVisible(false)}
          onSelectShort={() => { setVideoContentType('short'); setVideoTypeSheetVisible(false); setStep('preview'); }}
          onSelectVideo={() => { setVideoContentType('video'); setVideoTypeSheetVisible(false); setStep('preview'); }}
          insets={insets}
        />
      </View>
    );
  }

  // ─── Onboarding step (default) ────────────────────────────────────────────

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={T.TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create {contentLabel}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Intro label ───────────────────────────────────────────────── */}
        <View style={styles.introWrap}>
          <Text style={styles.introTitle}>What are you sharing?</Text>
          <Text style={styles.introSubtitle}>Fill in the details below, then continue to select your media.</Text>
        </View>

        {/* ── Caption ───────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Caption</Text>
          <View style={styles.captionWrap}>
            <TextInput
              placeholder="Describe your post…"
              placeholderTextColor={T.TEXT_3}
              value={caption}
              onChangeText={setCaption}
              multiline
              numberOfLines={5}
              maxLength={2200}
              style={styles.captionInput}
              textAlignVertical="top"
              selectionColor="#888"
            />
            <Text style={styles.captionCount}>{caption.length}/2200</Text>
          </View>
        </View>

        {/* ── Visibility ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visibility</Text>
          <View style={styles.visibilityOptions}>
            {VISIBILITY_OPTIONS.map((opt) => {
              const isActive = opt.value === visibility && !isPaid;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.visibilityOption, isActive && styles.visibilityOptionActive]}
                  onPress={() => { setVisibility(opt.value); setIsPaid(false); }}
                  activeOpacity={0.75}
                >
                  <View style={styles.visibilityText}>
                    <Text style={[styles.visibilityLabel, isActive && styles.visibilityLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.visibilityDesc}>{opt.description}</Text>
                  </View>
                  {isActive && (
                    <View style={styles.checkCircle}>
                      <Check size={12} color={T.BG} weight="bold" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Paid content toggle ───────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paid Content</Text>
          <TouchableOpacity
            style={[styles.paidToggleRow, isPaid && styles.paidToggleRowActive]}
            onPress={() => setIsPaid((v) => !v)}
            activeOpacity={0.8}
          >
            <View style={styles.paidToggleLeft}>
              <View style={[styles.paidIconWrap, isPaid && styles.paidIconWrapActive]}>
                <LockSimple size={16} color={isPaid ? T.BG : T.TEXT_2} />
              </View>
              <View>
                <Text style={[styles.paidToggleLabel, isPaid && styles.paidToggleLabelActive]}>
                  Charge credits to unlock
                </Text>
                <Text style={styles.paidToggleDesc}>
                  Fans pay credits to see this post
                </Text>
              </View>
            </View>
            <View style={[styles.toggle, isPaid && styles.toggleOn]}>
              <View style={[styles.toggleThumb, isPaid && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>

          {isPaid && (
            <View style={styles.creditPriceRow}>
              <Text style={styles.creditPriceLabel}>Credits to unlock</Text>
              <View style={styles.creditPriceInput}>
                <TextInput
                  value={creditPrice}
                  onChangeText={(v) => setCreditPrice(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  style={styles.creditPriceField}
                  placeholderTextColor={T.TEXT_3}
                  selectionColor="#888"
                />
                <Text style={styles.creditUnit}>credits</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Categories ────────────────────────────────────────────────── */}
        {categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Categories</Text>
            <View style={styles.chipsWrap}>
              {categories.map((cat) => {
                const active = selectedCategories.includes(cat.id);
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleCategory(cat.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Tags ──────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <View style={styles.tagInputRow}>
            <TextInput
              placeholder="#hashtag"
              placeholderTextColor={T.TEXT_3}
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={addTag}
              returnKeyType="done"
              autoCapitalize="none"
              style={styles.tagInput}
              selectionColor="#888"
            />
            <TouchableOpacity style={styles.tagAddBtn} onPress={addTag} activeOpacity={0.75}>
              <Text style={styles.tagAddLabel}>Add</Text>
            </TouchableOpacity>
          </View>
          {tags.length > 0 && (
            <View style={styles.chipsWrap}>
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={styles.tagChip}
                  onPress={() => removeTag(tag)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.tagChipLabel}>#{tag}</Text>
                  <X size={11} color={T.TEXT_2} weight="bold" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Continue button ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnLabel}>Continue</Text>
          <ArrowRight size={18} color={T.BG} weight="bold" />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Media picker modal */}
      <MediaPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPickImage={() => pickMedia('image')}
        onPickVideo={() => pickMedia('video')}
        onSkipMedia={() => { setPickerVisible(false); setStep('preview'); }}
        insets={insets}
      />
      {/* Video type selector */}
      <VideoTypeModal
        visible={videoTypeSheetVisible}
        onClose={() => setVideoTypeSheetVisible(false)}
        onSelectShort={() => { setVideoContentType('short'); setVideoTypeSheetVisible(false); setStep('preview'); }}
        onSelectVideo={() => { setVideoContentType('video'); setVideoTypeSheetVisible(false); setStep('preview'); }}
        insets={insets}
      />
    </View>
  );
}

// ─── Video Type Modal ─────────────────────────────────────────────────────────

function VideoTypeModal({
  visible,
  onClose,
  onSelectShort,
  onSelectVideo,
  insets,
}: {
  visible: boolean;
  onClose: () => void;
  onSelectShort: () => void;
  onSelectVideo: () => void;
  insets: { bottom: number };
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Upload as</Text>
          <Text style={styles.modalSubtitle}>Choose how to publish this video</Text>

          <TouchableOpacity style={styles.mediaOption} onPress={onSelectShort} activeOpacity={0.8}>
            <View style={styles.mediaOptionIcon}>
              <Lightning size={24} color={T.ACCENT} />
            </View>
            <View style={styles.mediaOptionText}>
              <Text style={styles.mediaOptionLabel}>Short</Text>
              <Text style={styles.mediaOptionDesc}>Vertical short-form · appears in the Shorts feed</Text>
            </View>
            <ArrowRight size={16} color={T.TEXT_3} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.mediaOption} onPress={onSelectVideo} activeOpacity={0.8}>
            <View style={styles.mediaOptionIcon}>
              <MonitorPlay size={24} color={T.ACCENT} />
            </View>
            <View style={styles.mediaOptionText}>
              <Text style={styles.mediaOptionLabel}>Long-form Video</Text>
              <Text style={styles.mediaOptionDesc}>Standard video · appears in the Videos feed</Text>
            </View>
            <ArrowRight size={16} color={T.TEXT_3} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Media Picker Modal ───────────────────────────────────────────────────────

function MediaPickerModal({
  visible,
  onClose,
  onPickImage,
  onPickVideo,
  onSkipMedia,
  insets,
}: {
  visible: boolean;
  onClose: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onSkipMedia: () => void;
  insets: { bottom: number };
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Select Media</Text>
          <Text style={styles.modalSubtitle}>Choose what to upload for this post</Text>

          <TouchableOpacity style={styles.mediaOption} onPress={onPickImage} activeOpacity={0.8}>
            <View style={styles.mediaOptionIcon}>
              <ImageIcon size={24} color={T.ACCENT} />
            </View>
            <View style={styles.mediaOptionText}>
              <Text style={styles.mediaOptionLabel}>Photo</Text>
              <Text style={styles.mediaOptionDesc}>Select an image from your library</Text>
            </View>
            <ArrowRight size={16} color={T.TEXT_3} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.mediaOption} onPress={onPickVideo} activeOpacity={0.8}>
            <View style={styles.mediaOptionIcon}>
              <VideoCamera size={24} color={T.ACCENT} />
            </View>
            <View style={styles.mediaOptionText}>
              <Text style={styles.mediaOptionLabel}>Video</Text>
              <Text style={styles.mediaOptionDesc}>Select a video (up to 5 minutes)</Text>
            </View>
            <ArrowRight size={16} color={T.TEXT_3} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipOption} onPress={onSkipMedia} activeOpacity={0.75}>
            <Text style={styles.skipLabel}>Post without media</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 56,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    letterSpacing: -0.2,
  },

  scrollContent: { paddingBottom: 20 },

  introWrap: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  introTitle: {
    fontSize: 22,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  introSubtitle: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 20,
  },

  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Caption
  captionWrap: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    padding: 14,
    minHeight: 120,
  },
  captionInput: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    minHeight: 80,
  },
  captionCount: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'right',
    marginTop: 6,
  },

  // Visibility
  visibilityOptions: { gap: 8 },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    gap: 12,
  },
  visibilityOptionActive: { backgroundColor: T.ACCENT_LIGHT },
  visibilityText: { flex: 1 },
  visibilityLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  visibilityLabelActive: { color: T.TEXT },
  visibilityDesc: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 1 },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: T.ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },

  // Paid toggle
  paidToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    gap: 12,
  },
  paidToggleRowActive: { backgroundColor: T.ACCENT_LIGHT },
  paidToggleLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  paidIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
  },
  paidIconWrapActive: { backgroundColor: T.ACCENT },
  paidToggleLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  paidToggleLabelActive: { color: T.TEXT },
  paidToggleDesc: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: T.SURFACE_2,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: { backgroundColor: T.ACCENT },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: T.TEXT_3,
  },
  toggleThumbOn: {
    backgroundColor: T.BG,
    alignSelf: 'flex-end',
  },
  creditPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    padding: 14,
  },
  creditPriceLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT },
  creditPriceInput: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  creditPriceField: {
    width: 70, height: 36,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.sm,
    paddingHorizontal: 10,
    fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT,
    textAlign: 'center',
  },
  creditUnit: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },

  // Chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
  },
  chipActive: { backgroundColor: T.ACCENT_LIGHT },
  chipLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  chipLabelActive: { color: T.ACCENT },

  // Tag input
  tagInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  tagInput: {
    flex: 1, height: 44,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    borderWidth: 0,
    paddingHorizontal: 16,
    fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT,
  },
  tagAddBtn: {
    height: 44, paddingHorizontal: 18,
    borderRadius: T.RADIUS.pill, backgroundColor: T.ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  tagAddLabel: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
  },
  tagChipLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.ACCENT },

  // Continue button
  continueBtn: {
    marginHorizontal: 20,
    marginTop: 28,
    height: 50,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  continueBtnLabel: { fontFamily: T.FONT.semibold, fontSize: 15, color: T.BG },

  // Preview step
  previewMediaWrap: { position: 'relative', margin: 20, borderRadius: T.RADIUS.lg, overflow: 'hidden' },
  previewImg: { width: '100%', aspectRatio: 4 / 5, backgroundColor: T.SURFACE },
  videoThumb: {
    width: '100%', height: 220,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  videoLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  removeMedia: {
    position: 'absolute', top: 10, right: 10,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  changeMedia: {
    position: 'absolute', bottom: 10, right: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: T.RADIUS.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  changeMediaLabel: { fontSize: 12, fontFamily: T.FONT.semibold, color: '#FFF' },
  previewCaption: {
    marginHorizontal: 20, marginBottom: 12,
    padding: 14,
    backgroundColor: T.SURFACE, borderRadius: T.RADIUS.md,
  },
  previewCaptionText: { fontSize: 15, fontFamily: T.FONT.regular, color: T.TEXT, lineHeight: 22 },
  paidBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 12,
    padding: 12,
    backgroundColor: T.ACCENT_LIGHT, borderRadius: T.RADIUS.md,
  },
  paidBadgeText: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.ACCENT },
  previewMeta: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginHorizontal: 20, paddingVertical: 12,
  },
  previewMetaLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  previewMetaValue: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },

  // Thumbnail picker
  thumbnailPicker: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    overflow: 'hidden',
  },
  thumbnailPreview: {
    width: '100%',
    height: '100%',
  },
  thumbnailEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  thumbnailEmptyLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
  thumbnailRemoveLabel: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: '#EF4444',
    textAlign: 'center' as const,
    paddingVertical: 6,
  },

  // Error
  errorBanner: {
    marginHorizontal: 20, marginTop: 16,
    padding: 12, borderRadius: T.RADIUS.md,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  errorText: { fontSize: 13, fontFamily: T.FONT.regular, color: '#EF4444', textAlign: 'center' },

  publishFooterBtn: {
    marginHorizontal: 20, marginTop: 20,
    height: 50, borderRadius: T.RADIUS.pill,
    backgroundColor: T.ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  publishFooterBtnLabel: { fontFamily: T.FONT.semibold, fontSize: 15, color: T.BG },

  // Publishing overlay
  overlay: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },
  overlayCard: { alignItems: 'center', gap: 16, padding: 32 },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: T.ACCENT, alignItems: 'center', justifyContent: 'center',
  },
  overlayTitle: { fontSize: 22, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.4 },
  overlaySubtitle: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  progressBar: {
    width: 200, height: 4, borderRadius: 2,
    backgroundColor: T.SURFACE_2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: T.ACCENT, borderRadius: 2 },

  // Media picker modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
    gap: 4,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20, fontFamily: T.FONT.bold, color: T.TEXT,
    letterSpacing: -0.4, marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2,
    marginBottom: 16,
  },
  mediaOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16,
  },
  mediaOptionIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
  },
  mediaOptionText: { flex: 1 },
  mediaOptionLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT },
  mediaOptionDesc: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },
  skipOption: {
    alignItems: 'center', paddingVertical: 18,
  },
  skipLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_2 },
});
