/**
 * CreateAlbumScreen — Multi-step album creation flow.
 *
 * Steps: details → cover → content → preview → publishing → success
 *
 * Albums are purchase-only: the creator sets a price (no Free/Subscriber/
 * Subscriber+ tiers). The backend accepts POST /albums with:
 *   { title, description, visibility, price, cover_media_id?, media_ids[] }
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { goBack } from '@/lib/safe-back';
import {
  ArrowLeft,
  ArrowRight,
  FilmStrip,
  Image as ImageIcon,
  Images,
  LockSimple,
  Plus,
  Star,
  VideoCamera,
  X,
} from 'phosphor-react-native';
import { T, alpha, AppGradients } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { useAuth } from '@/contexts/AuthContext';
import { dialogs } from '@/components/MsGlobalDialogs';
import { Sparkle } from 'phosphor-react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { MsRoomCreationLoader } from '@/components/MsRoomCreationLoader';
import { uploadMedia } from '@/services/media';
import { createAlbum } from '@/services/albums';
import { getCategories, type Category } from '@/services/categories';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | 'details'
  | 'cover'
  | 'content'
  | 'preview'
  | 'uploading'
  | 'creating'
  | 'success';

interface MediaItem {
  uri: string;
  type: 'image' | 'video';
  mime: string;
  name: string;
  uploadedId?: string;
  // Real asset dimensions/duration — sent with the upload so the media record
  // carries the true aspect ratio + duration (instant player sizing).
  width?: number;
  height?: number;
  durationSecs?: number;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const ALBUM_DRAFT_KEY = 'ms_create_album_draft';

export default function CreateAlbumScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Details fields — albums are purchase-only, so the creator always sets a
  // price; there is no Free/Subscriber/Subscriber+ tier selection.
  const [title,               setTitle]               = useState('');
  const [description,         setDescription]         = useState('');
  const [price,               setPrice]               = useState('500');
  const [categories,          setCategories]          = useState<Category[]>([]);
  const [selectedCategories,  setSelectedCategories]  = useState<string[]>([]);

  // Cover image
  const [coverUri,  setCoverUri]  = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState('image/jpeg');
  const [coverName, setCoverName] = useState('cover.jpg');

  // Content items
  const [items, setItems] = useState<MediaItem[]>([]);

  // Flow state
  const [step,           setStep]           = useState<Step>('details');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel,    setUploadLabel]    = useState('');
  const [error,          setError]          = useState('');
  const [publishFailed,  setPublishFailed]  = useState(false);

  // Media picker modal
  const [pickerVisible,  setPickerVisible]  = useState(false);
  const [pickerTarget,   setPickerTarget]   = useState<'cover' | 'item'>('cover');

  useEffect(() => {
    getCategories().then(({ categories }) => setCategories(categories)).catch(() => {});

    // Restore album draft
    AsyncStorage.getItem(ALBUM_DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const draft = JSON.parse(raw);
        if (draft.title)               setTitle(draft.title);
        if (draft.description)         setDescription(draft.description);
        if (draft.price)               setPrice(draft.price);
        if (draft.selectedCategories)  setSelectedCategories(draft.selectedCategories);
        if (draft.coverUri)            setCoverUri(draft.coverUri);
        if (draft.coverMime)           setCoverMime(draft.coverMime);
        if (draft.coverName)           setCoverName(draft.coverName);
        if (Array.isArray(draft.items)) setItems(draft.items);
      } catch {/* ignore */}
    }).catch(() => {});
  }, []);

  // Auto-save album draft
  useEffect(() => {
    const draft = {
      title,
      description,
      price,
      selectedCategories,
      coverUri,
      coverMime,
      coverName,
      items,
      updatedAt: new Date().toISOString(),
    };
    AsyncStorage.setItem(ALBUM_DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
  }, [
    title,
    description,
    price,
    selectedCategories,
    coverUri,
    coverMime,
    coverName,
    items,
  ]);

  // ─── Media picker ─────────────────────────────────────────────────────────

  const pickMedia = useCallback(async (type: 'image' | 'video', target: 'cover' | 'item') => {
    setPickerVisible(false);
    await new Promise((r) => setTimeout(r, 300));

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      dialogs.alert({ title: 'Permission required', message: 'Allow access to your media library to upload content.' });
      return;
    }

    // Cover image must be an image; items can be image or video
    const effectiveType = target === 'cover' ? 'image' : type;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:       effectiveType === 'image' ? ['images'] : ['videos'],
      allowsEditing:    effectiveType === 'image' && target === 'cover',
      aspect:           effectiveType === 'image' && target === 'cover' ? [1, 1] : undefined,
      quality:          effectiveType === 'image' ? 0.85 : undefined,
      videoMaxDuration: 300,
      // Album ITEMS support multi-select (up to the 20-item cap); the cover is
      // always a single image. Every selected asset is appended in picker order
      // and uploaded individually — the album is never limited to one file.
      allowsMultipleSelection: target === 'item',
      selectionLimit:          target === 'item' ? Math.max(1, 20 - items.length) : 1,
    });

    if (result.canceled || result.assets.length === 0) return;

    if (target === 'cover') {
      const asset = result.assets[0];
      const mime  = asset.mimeType ?? 'image/jpeg';
      const ext   = asset.fileName?.split('.').pop() ?? 'jpg';
      const name  = asset.fileName ?? `media-${Date.now()}.${ext}`;
      setCoverUri(asset.uri);
      setCoverMime(mime);
      setCoverName(name);
      return;
    }

    // Items — append EVERY selected asset, preserving the picker order so the
    // server's sort_order matches what the creator sees.
    const picked: MediaItem[] = result.assets.map((asset) => {
      const mime = asset.mimeType ?? (effectiveType === 'image' ? 'image/jpeg' : 'video/mp4');
      const ext  = asset.fileName?.split('.').pop() ?? (effectiveType === 'image' ? 'jpg' : 'mp4');
      const name = asset.fileName ?? `media-${Date.now()}-${asset.uri.slice(-6)}.${ext}`;
      return {
        uri: asset.uri,
        type: effectiveType,
        mime,
        name,
        width: asset.width ?? undefined,
        height: asset.height ?? undefined,
        // expo-image-picker reports `duration` in MILLISECONDS — the media
        // record stores SECONDS (same conversion as create-post).
        durationSecs: asset.duration ? Math.round(asset.duration / 1000) : undefined,
      };
    });
    setItems((prev) => {
      const room = Math.max(0, 20 - prev.length);
      const next = picked.slice(0, room);
      if (picked.length > room) {
        dialogs.alert({ title: 'Album limit', message: `Albums can contain up to 20 items. ${next.length} added.` });
      }
      return [...prev, ...next];
    });
  }, [items.length]);

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleCategory = (id: string) =>
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  // ─── Publish ──────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!title.trim()) {
      setError('Please give your album a title.');
      return;
    }
    if (!coverUri) {
      setError('Please select a cover image.');
      return;
    }

    const albumPrice = parseInt(price, 10) || 0;
    if (albumPrice < 1) {
      setError('Set an album price — albums are purchase-only.');
      return;
    }
    if (albumPrice > 1_000_000) {
      setError('Album price must be ₦1,000,000 or less.');
      return;
    }

    setError('');
    setPublishFailed(false);
    setStep('uploading');
    setUploadProgress(0);

    try {
      // 1. Upload cover
      setUploadLabel('Uploading cover…');
      const uploadedCover = await uploadMedia(coverUri, coverMime, coverName, (p) => {
        setUploadProgress(p * 0.3); // 0–30%
      });

      // 2. Upload content items
      const itemIds: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setUploadLabel(`Uploading item ${i + 1} of ${items.length}…`);
        const uploaded = await uploadMedia(
          item.uri,
          item.mime,
          item.name,
          (p) => {
            setUploadProgress(0.3 + (i + p) / items.length * 0.6); // 30–90%
          },
          // Pass dimensions/duration for videos (instant aspect ratio + seek range).
          item.type === 'video'
            ? { width: item.width, height: item.height, durationSecs: item.durationSecs }
            : { width: item.width, height: item.height },
        );
        if (uploaded.id) {
          itemIds.push(uploaded.id);
          setItems((prev) =>
            prev.map((it, idx) => idx === i ? { ...it, uploadedId: uploaded.id } : it)
          );
        }
      }

      setUploadProgress(0.95);
      setStep('creating');

      // 3. Create album — purchase-only: always public and always priced so
      // members see the price and purchase to continue.
      await createAlbum({
        title:          title.trim(),
        description:    description.trim() || undefined,
        visibility:     'public',
        price:          albumPrice,
        cover_media_id: uploadedCover.id,
        media_ids:      itemIds,
        categories:     selectedCategories,
      });

      setStep('success');
      AsyncStorage.removeItem(ALBUM_DRAFT_KEY).catch(() => {});
      await new Promise((r) => setTimeout(r, 1400));
      router.replace('/(tabs)/explore');
    } catch (err) {
      setError((err as Error).message ?? 'Publish failed. Please try again.');
      setPublishFailed(true);
    }
  };

  // ─── Creator gate ─────────────────────────────────────────────────────────
  // Albums are creator-only. The SERVER is the authority (POST /albums still
  // rejects non-creators), but a non-creator should be routed into the
  // Become-a-Creator flow instead of hitting a dead-end 403 after filling
  // the whole form.
  if (user && !user.isCreator) {
    return (
      <View style={[styles.screen, styles.gateWrap, { paddingTop: insets.top + 40 }]}>
        <View style={styles.gateIcon}>
          <BrandGradientFill />
          <Sparkle size={30} color="#FFFFFF" weight="fill" />
        </View>
        <Text style={styles.gateTitle}>Creators only</Text>
        <Text style={styles.gateBody}>
          Albums are a creator feature — set a price and sell your collection
          directly to fans.
        </Text>
        <TouchableOpacity
          style={styles.gateCta}
          activeOpacity={0.85}
          onPress={() => router.push('/become-creator')}
        >
          <Text style={styles.gateCtaLabel}>Become a Creator</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goBack()} activeOpacity={0.7} style={styles.gateBack}>
          <Text style={styles.gateBackLabel}>Not now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Publishing overlay (Create Chatroom-style loader) ─────────────────────

  if (step === 'uploading' || step === 'creating' || step === 'success') {
    return (
      <MsRoomCreationLoader
        visible
        label={step === 'creating' ? 'Creating Album' : 'Uploading'}
        status={
          step === 'creating'
            ? 'Building your album…'
            : (uploadLabel || 'Uploading media…')
        }
        error={publishFailed ? error : null}
        success={step === 'success' && !publishFailed}
        successTitle="Album Published!"
        successSubtitle="Your album is now live on Explore."
        onRetry={publishFailed ? handlePublish : undefined}
        onCancel={publishFailed ? () => { setPublishFailed(false); setStep('preview'); } : undefined}
        onDone={() => router.replace('/(tabs)/explore')}
      />
    );
  }

  // ─── Preview step ─────────────────────────────────────────────────────────

  if (step === 'preview') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setStep('content')}>
            <ArrowLeft size={20} color={T.TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Preview Album</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Cover preview */}
          {coverUri && (
            <View style={styles.coverPreviewWrap}>
              <Image source={{ uri: coverUri }} style={styles.coverPreviewImg} resizeMode="cover" />
              <View style={styles.coverBadge}>
                <Images size={12} color={T.TEXT} weight="bold" />
                <Text style={styles.coverBadgeText}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          )}

          {/* Album info */}
          <View style={styles.previewInfo}>
            <Text style={styles.previewTitle}>{title}</Text>
            {!!description.trim() && (
              <Text style={styles.previewDesc}>{description}</Text>
            )}
          </View>

          {/* Purchase price — albums are purchase-only */}
          <View style={styles.paidBadge}>
            <BrandGradientFill />
            <LockSimple size={14} color="#FFFFFF" weight="fill" />
            <Text style={styles.paidBadgeText}>Purchase-only · ₦{parseInt(price, 10).toLocaleString()} to unlock</Text>
          </View>

          {/* Content grid preview */}
          {items.length > 0 && (
            <View style={styles.itemsPreviewWrap}>
              <Text style={styles.itemsPreviewLabel}>Album contents ({items.length})</Text>
              <View style={styles.itemsGrid}>
                {items.map((item, idx) => (
                  <View key={idx} style={styles.itemThumb}>
                    {item.type === 'image' ? (
                      <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.videoThumbFill]}>
                        <FilmStrip size={18} color={T.TEXT_2} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {!!error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.publishBtn} onPress={handlePublish} activeOpacity={0.85}>
            <LinearGradient colors={AppGradients.brand} locations={AppGradients.brandLocs} style={StyleSheet.absoluteFill} />
            <Star size={16} color={T.ACCENT_FG} weight="fill" />
            <Text style={styles.publishBtnLabel}>Publish Album</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  // ─── Content selection step ───────────────────────────────────────────────

  if (step === 'content') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setStep('cover')}>
            <ArrowLeft size={20} color={T.TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Content</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.stepHint}>
            <Text style={styles.stepTitle}>Album Content</Text>
            <Text style={styles.stepSubtitle}>
              Add images and videos to your album. You can add up to 20 items.
            </Text>
          </View>

          {/* Add item button */}
          <View style={styles.addItemRow}>
            <TouchableOpacity
              style={styles.addItemBtn}
              onPress={() => { setPickerTarget('item'); setPickerVisible(true); }}
              activeOpacity={0.8}
            >
              <Plus size={20} color={T.PRIMARY_LIGHT} weight="bold" />
              <Text style={styles.addItemLabel}>Add Photo or Video</Text>
            </TouchableOpacity>
            <Text style={styles.itemCount}>{items.length}/20</Text>
          </View>

          {/* Items grid */}
          {items.length > 0 && (
            <View style={styles.contentGrid}>
              {items.map((item, idx) => (
                <View key={idx} style={styles.contentThumb}>
                  {item.type === 'image' ? (
                    <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.videoThumbFill]}>
                      <FilmStrip size={22} color={T.TEXT_2} />
                      <Text style={styles.videoLabel}>Video</Text>
                    </View>
                  )}
                  {/* Type badge */}
                  <View style={styles.thumbTypeBadge}>
                    {item.type === 'video' ? (
                      <VideoCamera size={10} color={T.TEXT} />
                    ) : (
                      <ImageIcon size={10} color={T.TEXT} />
                    )}
                  </View>
                  {/* Remove button */}
                  <TouchableOpacity style={styles.removeThumbBtn} onPress={() => removeItem(idx)}>
                    <X size={11} color={T.TEXT} weight="bold" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {items.length === 0 && (
            <View style={styles.emptyItems}>
              <Images size={40} color={T.TEXT_3} />
              <Text style={styles.emptyItemsText}>No items yet</Text>
              <Text style={styles.emptyItemsSubtext}>Tap "Add Photo or Video" above to get started.</Text>
            </View>
          )}

          {/* Continue */}
          <TouchableOpacity
            style={[styles.continueBtn, items.length === 0 && styles.continueBtnDisabled]}
            onPress={() => setStep('preview')}
            activeOpacity={0.85}
            disabled={false}
          >
            <LinearGradient colors={AppGradients.brand} locations={AppGradients.brandLocs} style={StyleSheet.absoluteFill} />
            <Text style={styles.continueBtnLabel}>
              {items.length === 0 ? 'Continue without items' : `Continue with ${items.length} item${items.length !== 1 ? 's' : ''}`}
            </Text>
            <ArrowRight size={18} color={T.ACCENT_FG} weight="bold" />
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Media picker modal */}
        <MediaPickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onPickImage={() => pickMedia('image', pickerTarget)}
          onPickVideo={() => pickMedia('video', pickerTarget)}
          insets={insets}
        />
      </View>
    );
  }

  // ─── Cover selection step ─────────────────────────────────────────────────

  if (step === 'cover') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setStep('details')}>
            <ArrowLeft size={20} color={T.TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Album Cover</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.stepHint}>
            <Text style={styles.stepTitle}>Add a Cover Image</Text>
            <Text style={styles.stepSubtitle}>
              The cover is the first thing members see. Choose something that represents your album.
            </Text>
          </View>

          {/* Cover preview / selector */}
          <TouchableOpacity
            style={styles.coverSelector}
            onPress={() => { setPickerTarget('cover'); setPickerVisible(true); }}
            activeOpacity={0.85}
          >
            {coverUri ? (
              <>
                <Image source={{ uri: coverUri }} style={styles.coverSelectorImg} resizeMode="cover" />
                <View style={styles.coverSelectorOverlay}>
                  <ImageIcon size={22} color="#fff" />
                  <Text style={styles.coverSelectorChangeLabel}>Change Cover</Text>
                </View>
              </>
            ) : (
              <View style={styles.coverSelectorEmpty}>
                <ImageIcon size={40} color={T.TEXT_3} />
                <Text style={styles.coverSelectorEmptyTitle}>Select cover image</Text>
                <Text style={styles.coverSelectorEmptySubtitle}>Tap to choose a photo from your library</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Continue */}
          <TouchableOpacity
            style={[styles.continueBtn, !coverUri && styles.continueBtnDisabled]}
            onPress={() => {
              if (!coverUri) {
                dialogs.alert({ title: 'Cover required', message: 'Please select a cover image for your album.' });
                return;
              }
              setStep('content');
            }}
            activeOpacity={0.85}
          >
            <LinearGradient colors={AppGradients.brand} locations={AppGradients.brandLocs} style={StyleSheet.absoluteFill} />
            <Text style={styles.continueBtnLabel}>Continue</Text>
            <ArrowRight size={18} color={T.ACCENT_FG} weight="bold" />
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Media picker modal */}
        <MediaPickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onPickImage={() => pickMedia('image', 'cover')}
          onPickVideo={() => pickMedia('image', 'cover')} // cover is always image
          insets={insets}
        />
      </View>
    );
  }

  // ─── Details step (default) ───────────────────────────────────────────────

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={T.TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Album</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.introWrap}>
          <Text style={styles.introTitle}>What's this album about?</Text>
          <Text style={styles.introSubtitle}>
            Albums are curated collections of your photos and videos — perfect for themed drops, exclusive sets, and premium bundles.
          </Text>
        </View>

        {/* ── Title ─────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Album Title</Text>
          <View style={styles.inputWrap}>
            <TextInput
              placeholder="e.g. Golden Hour, Studio Sessions…"
              placeholderTextColor={T.TEXT_3}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              style={styles.inputField}
              selectionColor={T.ACCENT}
            />
            <Text style={styles.inputCount}>{title.length}/80</Text>
          </View>
        </View>

        {/* ── Description ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.captionWrap}>
            <TextInput
              placeholder="Describe what's in this album…"
              placeholderTextColor={T.TEXT_3}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              maxLength={500}
              style={styles.captionInput}
              textAlignVertical="top"
              selectionColor={T.ACCENT}
            />
            <Text style={styles.captionCount}>{description.length}/500</Text>
          </View>
        </View>

        {/* ── Price (purchase-only) ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Price (Naira ₦)</Text>
            <View style={styles.priceInput}>
              <TextInput
                value={price}
                onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={styles.priceField}
                placeholderTextColor={T.TEXT_3}
                selectionColor={T.ACCENT}
              />
            </View>
          </View>
          <View style={styles.accessNote}>
            <Star size={12} color={T.GOLD} weight="fill" />
            <Text style={styles.accessNoteText}>
              Albums are purchase-only — members pay from their wallet to unlock this album. Set the price they'll pay to access it.
            </Text>
          </View>
        </View>

        {/* ── Categories ────────────────────────────────────────────────── */}
        {categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Categories <Text style={styles.optional}>(optional)</Text></Text>
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
                    {active && <BrandGradientFill />}
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Continue button ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.continueBtn, !title.trim() && styles.continueBtnDisabled]}
          onPress={() => {
            if (!title.trim()) {
              setError('Please enter a title for your album.');
              return;
            }
            const nextPrice = parseInt(price, 10) || 0;
            if (nextPrice < 1) {
              setError('Set an album price — albums are purchase-only.');
              return;
            }
            setError('');
            setStep('cover');
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnLabel}>Continue</Text>
          <ArrowRight size={18} color={T.BG} weight="bold" />
        </TouchableOpacity>

        {!!error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

// ─── Media Picker Modal ───────────────────────────────────────────────────────

function MediaPickerModal({
  visible,
  onClose,
  onPickImage,
  onPickVideo,
  insets,
}: {
  visible: boolean;
  onClose: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
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
          <Text style={styles.modalSubtitle}>Choose what to add</Text>

          <TouchableOpacity style={styles.mediaOption} onPress={onPickImage} activeOpacity={0.8}>
            <View style={styles.mediaOptionIcon}>
              <ImageIcon size={24} color={T.PRIMARY_LIGHT} />
            </View>
            <View style={styles.mediaOptionText}>
              <Text style={styles.mediaOptionLabel}>Photo</Text>
              <Text style={styles.mediaOptionDesc}>Select an image from your library</Text>
            </View>
            <ArrowRight size={16} color={T.TEXT_3} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.mediaOption} onPress={onPickVideo} activeOpacity={0.8}>
            <View style={styles.mediaOptionIcon}>
              <VideoCamera size={24} color={T.PRIMARY_LIGHT} />
            </View>
            <View style={styles.mediaOptionText}>
              <Text style={styles.mediaOptionLabel}>Video</Text>
              <Text style={styles.mediaOptionDesc}>Select a video (up to 5 minutes)</Text>
            </View>
            <ArrowRight size={16} color={T.TEXT_3} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },

  gateWrap: {
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  gateIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  gateTitle: { fontSize: 20, fontFamily: T.FONT.bold, color: T.TEXT, textAlign: 'center' },
  gateBody: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2, textAlign: 'center', lineHeight: 20 },
  gateCta: {
    width: '100%',
    height: 50,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  gateCtaLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.BG },
  gateBack: { marginTop: 6, padding: 8 },
  gateBackLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_3 },

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

  stepHint: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  stepTitle: {
    fontSize: 22,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 20,
  },

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
  optional: {
    fontFamily: T.FONT.regular,
    textTransform: 'none',
    fontSize: 10,
    color: T.TEXT_3,
  },

  // Input
  inputWrap: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    padding: 14,
  },
  inputField: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    // Vertically centre the title inside the input wrap on Android.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  inputCount: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'right',
    marginTop: 4,
  },

  // Caption / description
  captionWrap: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    padding: 14,
    minHeight: 110,
  },
  captionInput: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    minHeight: 70,
  },
  captionCount: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'right',
    marginTop: 6,
  },

  // Price
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    padding: 14,
  },
  priceLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT },
  priceInput: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceField: {
    width: 70, height: 36,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.sm,
    paddingHorizontal: 10,
    fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT,
    textAlign: 'center',
    // Vertically centre the digits inside the 36px price chip on Android.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },

  // Access note
  accessNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    padding: 12,
  },
  accessNoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 18,
  },

  // Chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
  },
  chipActive: { overflow: 'hidden' },
  chipLabel: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  chipLabelActive: { color: '#FFFFFF', fontFamily: T.FONT.bold },

  // Cover selector
  coverSelector: {
    marginHorizontal: 20,
    marginTop: 20,
    height: 280,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: T.SURFACE,
  },
  coverSelectorImg: { width: '100%', height: '100%' },
  coverSelectorOverlay: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coverSelectorChangeLabel: {
    color: T.ACCENT_FG,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
  },
  coverSelectorEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  coverSelectorEmptyTitle: {
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
  },
  coverSelectorEmptySubtitle: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },

  // Content grid
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 20,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: T.RADIUS.full,
  },
  addItemLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.PRIMARY_LIGHT,
  },
  itemCount: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
  contentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  contentThumb: {
    width: 100,
    height: 100,
    borderRadius: T.RADIUS.md,
    overflow: 'hidden',
    backgroundColor: T.SURFACE,
  },
  videoThumbFill: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: T.SURFACE_2,
  },
  videoLabel: {
    fontSize: 10,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
  thumbTypeBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 3,
  },
  removeThumbBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyItems: {
    alignItems: 'center',
    padding: 40,
    gap: 8,
  },
  emptyItemsText: {
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
    marginTop: 4,
  },
  emptyItemsSubtext: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Continue button
  continueBtn: {
    marginHorizontal: 20,
    marginTop: 28,
    height: 50,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.ACCENT,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  continueBtnDisabled: {
    backgroundColor: T.SURFACE_2,
  },
  continueBtnLabel: { fontFamily: T.FONT.semibold, fontSize: 15, color: T.ACCENT_FG },

  // Publish button
  publishBtn: {
    marginHorizontal: 20,
    marginTop: 28,
    height: 50,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.ACCENT,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...T.SHADOWS.medium,
  },
  publishBtnLabel: { fontFamily: T.FONT.semibold, fontSize: 15, color: T.ACCENT_FG },

  // Preview step
  coverPreviewWrap: {
    margin: 20,
    height: 300,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  coverPreviewImg: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: T.RADIUS.full,
  },
  coverBadgeText: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 12 },
  previewInfo: {
    paddingHorizontal: 20,
    gap: 6,
  },
  previewTitle: {
    fontSize: 24,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.5,
  },
  previewDesc: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 20,
  },
  paidBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 12,
    padding: 12,
    overflow: 'hidden', borderRadius: T.RADIUS.md,
  },
  paidBadgeText: { fontSize: 13, fontFamily: T.FONT.bold, color: '#FFFFFF' },

  // Items preview
  itemsPreviewWrap: { paddingHorizontal: 20, marginTop: 16 },
  itemsPreviewLabel: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemThumb: {
    width: 76,
    height: 76,
    borderRadius: T.RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: T.SURFACE,
  },

  // Error
  errorBanner: {
    marginHorizontal: 20, marginTop: 16,
    padding: 12, borderRadius: T.RADIUS.md,
    backgroundColor: alpha(T.ERROR, 0.12),
  },
  errorText: { fontSize: 13, fontFamily: T.FONT.regular, color: T.ERROR, textAlign: 'center' },

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
});
