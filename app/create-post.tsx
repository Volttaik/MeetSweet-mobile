import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { ArrowLeft, Check, FilmStrip, Image as ImageIcon, VideoCamera, X } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { uploadMedia } from '@/services/media';
import { createPost } from '@/services/posts';
import { getCategories, type Category } from '@/services/categories';

// ─── Types ────────────────────────────────────────────────────────────────────

type PublishStep = 'compose' | 'uploading' | 'creating' | 'processing' | 'success';

const VISIBILITY_OPTIONS = [
  {
    value: 'public' as const,
    label: 'Public Preview',
    description: 'Visible to everyone',
  },
  {
    value: 'subscribers' as const,
    label: 'Subscribers Only',
    description: 'Locked until subscription',
  },
  {
    value: 'draft' as const,
    label: 'Draft',
    description: 'Only you can see this',
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreatePostScreen() {
  const insets = useSafeAreaInsets();

  const [caption,    setCaption]    = useState('');
  const [visibility, setVisibility] = useState<'public' | 'subscribers' | 'draft'>('public');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [tags,       setTags]       = useState<string[]>([]);
  const [tagInput,   setTagInput]   = useState('');

  // Media state
  const [mediaUri,   setMediaUri]   = useState<string | null>(null);
  const [mediaType,  setMediaType]  = useState<'image' | 'video' | null>(null);
  const [mediaMime,  setMediaMime]  = useState('image/jpeg');
  const [mediaName,  setMediaName]  = useState('media.jpg');

  // Publish state
  const [step,           setStep]           = useState<PublishStep>('compose');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error,          setError]          = useState('');

  useEffect(() => {
    getCategories().then(({ categories }) => setCategories(categories)).catch(() => {});
  }, []);

  // ─── Media picker ─────────────────────────────────────────────────────────
  // Uses the same pattern as edit-profile avatar/banner upload:
  //   1. requestMediaLibraryPermissionsAsync
  //   2. launchImageLibraryAsync
  //   3. uploadMedia(uri, mime, filename, onProgress) via XHR FormData
  //   4. use result.id in the post payload

  const pickMedia = useCallback(async (type: 'image' | 'video') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow access to your media library to upload content.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:    type === 'image' ? ['images'] : ['videos'],
      allowsEditing: type === 'image',
      aspect:        type === 'image' ? [4, 5] : undefined,
      quality:       type === 'image' ? 0.85 : undefined,
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
  }, []);

  const removeMedia = () => { setMediaUri(null); setMediaType(null); };

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
      setError('Add a caption or upload media before publishing.');
      return;
    }

    setError('');
    setStep('uploading');
    setUploadProgress(0);

    try {
      let mediaIds: string[] | undefined;

      // Upload media using the same XHR FormData approach as edit-profile
      if (mediaUri && mediaType) {
        const uploaded = await uploadMedia(mediaUri, mediaMime, mediaName, (p) => {
          setUploadProgress(p);
        });
        if (uploaded.id) mediaIds = [uploaded.id];
      }

      setStep('creating');

      await createPost({
        caption: caption.trim(),
        visibility,
        media_ids: mediaIds,
        categories: selectedCategories,
        tags,
      });

      setStep('processing');
      await new Promise((r) => setTimeout(r, 600));
      setStep('success');
      await new Promise((r) => setTimeout(r, 1200));

      router.replace('/(tabs)');
    } catch (err) {
      setError((err as Error).message ?? 'Publish failed. Please try again.');
      setStep('compose');
    }
  };

  // ─── Publishing overlay ───────────────────────────────────────────────────

  if (step !== 'compose') {
    return (
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.overlayCard}>
          {step === 'success' ? (
            <>
              <View style={styles.successIcon}>
                <Check size={32} color={T.BG} weight="bold" />
              </View>
              <Text style={styles.overlayTitle}>Published!</Text>
              <Text style={styles.overlaySubtitle}>Your post is now live.</Text>
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

  // ─── Compose view ─────────────────────────────────────────────────────────

  const selectedOption = VISIBILITY_OPTIONS.find((o) => o.value === visibility)!;
  const canPublish     = !!(caption.trim() || mediaUri);

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
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity
          style={[styles.publishBtn, !canPublish && styles.publishBtnDisabled]}
          onPress={handlePublish}
          activeOpacity={0.8}
          disabled={!canPublish}
        >
          <Text style={styles.publishBtnLabel}>Publish</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Media ─────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Media</Text>

          {!mediaUri ? (
            <View style={styles.mediaPickerRow}>
              <TouchableOpacity
                style={styles.mediaPickerBtn}
                onPress={() => pickMedia('image')}
                activeOpacity={0.8}
              >
                <ImageIcon size={26} color={T.ACCENT} />
                <Text style={styles.mediaPickerLabel}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mediaPickerBtn}
                onPress={() => pickMedia('video')}
                activeOpacity={0.8}
              >
                <VideoCamera size={26} color={T.ACCENT} />
                <Text style={styles.mediaPickerLabel}>Video</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mediaPreview}>
              {mediaType === 'image' ? (
                <Image source={{ uri: mediaUri }} style={styles.mediaImg} resizeMode="cover" />
              ) : (
                <View style={styles.videoThumb}>
                  <FilmStrip size={40} color={T.TEXT_2} />
                  <Text style={styles.videoLabel}>Video selected</Text>
                </View>
              )}
              <TouchableOpacity style={styles.removeMedia} onPress={removeMedia}>
                <X size={15} color={T.TEXT} weight="bold" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Caption ───────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Caption</Text>
          <View style={styles.captionWrap}>
            <TextInput
              placeholder="What's on your mind?"
              placeholderTextColor={T.TEXT_3}
              value={caption}
              onChangeText={setCaption}
              multiline
              numberOfLines={5}
              maxLength={2200}
              style={styles.captionInput}
              textAlignVertical="top"
            />
            <Text style={styles.captionCount}>{caption.length}/2200</Text>
          </View>
        </View>

        {/* ── Visibility ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visibility</Text>
          <View style={styles.visibilityOptions}>
            {VISIBILITY_OPTIONS.map((opt) => {
              const isActive = opt.value === visibility;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.visibilityOption, isActive && styles.visibilityOptionActive]}
                  onPress={() => setVisibility(opt.value)}
                  activeOpacity={0.75}
                >
                  <View style={styles.visibilityText}>
                    <Text style={[styles.visibilityLabel, isActive && styles.visibilityLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.visibilityDesc, isActive && styles.visibilityDescActive]}>
                      {opt.description}
                    </Text>
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

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {!!error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Publish footer button ─────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.publishFooterBtn, !canPublish && styles.publishFooterBtnDisabled]}
          onPress={handlePublish}
          disabled={!canPublish}
          activeOpacity={0.85}
        >
          <Text style={styles.publishFooterBtnLabel}>
            Publish{visibility !== 'public' ? ` · ${selectedOption.label}` : ''}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
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
  publishBtn: {
    paddingHorizontal: 18,
    height: 34,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnDisabled: { backgroundColor: T.SURFACE_2 },
  publishBtnLabel: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },

  scrollContent: { paddingBottom: 20 },

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

  // Media
  mediaPickerRow: { flexDirection: 'row', gap: 12 },
  mediaPickerBtn: {
    flex: 1,
    height: 100,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: T.BORDER_2,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mediaPickerLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  mediaPreview: {
    position: 'relative',
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
  },
  mediaImg: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: T.SURFACE,
  },
  videoThumb: {
    width: '100%',
    height: 200,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  videoLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  removeMedia: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Caption
  captionWrap: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    borderWidth: 1.5,
    borderColor: T.BORDER_2,
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
    borderWidth: 1.5,
    borderColor: T.BORDER_2,
    gap: 12,
  },
  visibilityOptionActive: {
    borderColor: T.ACCENT,
    backgroundColor: T.ACCENT_LIGHT,
  },
  visibilityText:  { flex: 1 },
  visibilityLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  visibilityLabelActive: { color: T.TEXT },
  visibilityDesc: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    marginTop: 1,
  },
  visibilityDescActive: { color: T.TEXT_2 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Chips (categories + tags)
  chipsWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER_2,
  },
  chipActive: {
    backgroundColor: T.ACCENT_LIGHT,
    borderColor: T.ACCENT,
  },
  chipLabel:       { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  chipLabelActive: { color: T.ACCENT },

  // Tag input
  tagInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  tagInput: {
    flex: 1,
    height: 46,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    borderWidth: 1.5,
    borderColor: T.BORDER_2,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
  },
  tagAddBtn: {
    height: 46,
    paddingHorizontal: 18,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAddLabel: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER_2,
  },
  tagChipLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.ACCENT },

  // Error
  errorBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: T.RADIUS.md,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  errorText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: '#EF4444',
    textAlign: 'center',
  },

  // Footer publish button
  publishFooterBtn: {
    marginHorizontal: 20,
    marginTop: 24,
    height: 52,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishFooterBtnDisabled: { backgroundColor: T.SURFACE_2 },
  publishFooterBtnLabel: {
    fontFamily: T.FONT.semibold,
    fontSize: 16,
    color: T.TEXT,
  },

  // Publishing overlay
  overlay: {
    flex: 1,
    backgroundColor: T.BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayTitle: {
    fontSize: 22,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.4,
  },
  overlaySubtitle: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },
  progressBar: {
    width: 200,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.SURFACE_2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: T.ACCENT,
    borderRadius: 2,
  },
});
