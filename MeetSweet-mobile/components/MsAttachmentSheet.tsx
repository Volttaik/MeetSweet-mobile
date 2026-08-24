/**
 * MsAttachmentSheet — media-selection action sheet, 4-column grid.
 *
 * Presentation is a native bottom sheet (@gorhom/bottom-sheet) driven by
 * Reanimated worklets on the UI thread — no JS-thread Modal animation, no
 * web-style transitions. The GIF/sticker picker it launches is the official
 * native GIPHY iOS/Android SDK.
 *
 * Solid deep-black surface (no glass / no blur / no translucent backdrop).
 * Safe-area aware and stable across keyboard open/close. Only the
 * presentation is custom — every picker action is unchanged.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Image as ImageIcon,
  Video,
  File,
  Camera,
  Waveform,
  Gif as GifIcon,
  Sticker as StickerIcon,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsPressable } from '@/components/MsPressable';
import { dialogs } from '@/components/MsGlobalDialogs';
import { MsGifPicker, type GiphyPickResult } from '@/components/chat/MsGifPicker';

/**
 * Resolve a reliable MIME type for a picked image asset. expo-image-picker
 * reports mimeType on Android but often leaves it null on iOS, where the file
 * extension is the only hint (e.g. .gif must be image/gif, not image/jpeg).
 */
function mimeFromAsset(asset: {
  mimeType?: string | null;
  fileName?: string | null;
  type?: string | null;
}): string {
  const explicit = asset.mimeType;
  if (explicit && explicit !== 'image/jpeg') return explicit;
  const name = (asset.fileName ?? '').toLowerCase();
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.heic')) return 'image/heic';
  return asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
}

export interface AttachmentResult {
  type: 'image' | 'video' | 'audio' | 'document' | 'gif' | 'sticker';
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
  duration?: number; // seconds
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onResult: (result: AttachmentResult) => void;
}

export function MsAttachmentSheet({ visible, onClose, onResult }: Props) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifPickerKind, setGifPickerKind] = useState<'gif' | 'sticker'>('gif');

  // Present/dismiss natively when the parent toggles `visible`. Dismissals
  // initiated inside the sheet (backdrop tap / swipe down) report back
  // through onDismiss.
  useEffect(() => {
    if (visible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [visible]);

  const renderBackdrop = useMemo(
    () => (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
        pressBehavior="close"
      />
    ),
    [],
  );

  const pickImage = async () => {
    onClose();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      dialogs.alert({ title: 'Permission required', message: 'Please allow access to your photo library.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      onResult({
        type: 'image',
        uri: asset.uri,
        mimeType: mimeFromAsset(asset),
        fileName: asset.fileName ?? (mimeFromAsset(asset) === 'image/gif' ? 'photo.gif' : 'photo.jpg'),
        fileSize: asset.fileSize,
      });
    }
  };

  const pickVideo = async () => {
    onClose();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      dialogs.alert({ title: 'Permission required', message: 'Please allow access to your photo library.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 0.85,
      videoMaxDuration: 300,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      onResult({
        type: 'video',
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'video/mp4',
        fileName: asset.fileName ?? 'video.mp4',
        fileSize: asset.fileSize,
        duration: asset.duration ? Math.round(asset.duration / 1000) : undefined,
      });
    }
  };

  const launchCamera = async () => {
    onClose();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      dialogs.alert({ title: 'Permission required', message: 'Please allow access to your camera.' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      onResult({
        type: 'image',
        uri: asset.uri,
        mimeType: mimeFromAsset(asset),
        fileName: asset.fileName ?? (mimeFromAsset(asset) === 'image/gif' ? 'photo.gif' : 'photo.jpg'),
        fileSize: asset.fileSize,
      });
    }
  };

  const pickAudio = async () => {
    onClose();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await new Promise((r) => setTimeout(r, 300));
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      onResult({
        type: 'audio',
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'audio/mpeg',
        fileName: asset.name ?? 'audio',
        fileSize: asset.size,
      });
    } catch {
      dialogs.alert({ variant: 'error', title: 'Could not open the audio picker' });
    }
  };

  const pickGif = async () => {
    onClose();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGifPickerKind('gif');
    setShowGifPicker(true);
  };

  const pickSticker = async () => {
    onClose();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGifPickerKind('sticker');
    setShowGifPicker(true);
  };

  const handleGifPick = (picked: GiphyPickResult) => {
    setShowGifPicker(false);
    onResult({
      type: picked.kind,
      uri: picked.uri,
      mimeType: picked.mimeType,
      fileName: picked.fileName,
      fileSize: picked.fileSize,
    });
  };

  const pickDocument = async () => {
    onClose();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await new Promise((r) => setTimeout(r, 300));
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      onResult({
        type: 'document',
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        fileName: asset.name ?? 'document',
        fileSize: asset.size,
      });
    } catch {
      dialogs.alert({ variant: 'error', title: 'Could not open the document picker' });
    }
  };

  const OPTIONS = [
    { icon: ImageIcon,     label: 'Photo',    color: '#4CAF82', onPress: pickImage    },
    { icon: GifIcon,       label: 'GIF',      color: '#FF4D8D', onPress: pickGif      },
    { icon: StickerIcon,   label: 'Sticker',  color: '#FFB74D', onPress: pickSticker  },
    { icon: Video,         label: 'Video',    color: '#9B6ECA', onPress: pickVideo    },
    { icon: Camera,        label: 'Camera',   color: T.ACCENT,  onPress: launchCamera },
    { icon: Waveform,      label: 'Audio',    color: '#FF9800', onPress: pickAudio    },
    { icon: File,          label: 'Document', color: '#2196F3', onPress: pickDocument },
  ];

  const paddingBottom = Math.max(insets.bottom, 16);

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        index={0}
        snapPoints={['auto']}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={s.surface}
        handleIndicatorStyle={s.handle}
        onDismiss={onClose}
      >
        <BottomSheetView style={[s.content, { paddingBottom }]}>
          <Text style={s.title}>Share</Text>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.grid}
            style={s.gridScroll}
          >
            {OPTIONS.map((opt) => (
              <MsPressable
                key={opt.label}
                style={s.item}
                onPress={opt.onPress}
                scale={0.9}
              >
                <View style={[s.iconWrap, { backgroundColor: `${opt.color}1F` }]}>
                  <opt.icon size={26} color={opt.color} weight="duotone" />
                </View>
                <Text style={s.itemLabel}>{opt.label}</Text>
              </MsPressable>
            ))}
          </ScrollView>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Official native GIPHY dialog (GIFs + animated stickers). */}
      <MsGifPicker
        visible={showGifPicker}
        kind={gifPickerKind}
        onClose={() => setShowGifPicker(false)}
        onPick={handleGifPick}
      />
    </>
  );
}

const s = StyleSheet.create({
  // Solid deep-black surface — no translucency, no blur.
  surface: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  content: {
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 17,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    marginBottom: 26,
    letterSpacing: 0.2,
  },
  gridScroll: {
    maxHeight: 260,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 8,
  },
  // Exactly 4 columns: each cell is 25% of the sheet width with consistent
  // icon sizing, spacing and touch targets. Rows wrap; the sheet scrolls if
  // there are ever more actions than fit on screen.
  item: {
    width: '25%',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  // High-contrast icon tiles that pop against the black surface. Solid-ish tint
  // background + bright duotone icon keeps each action clearly legible.
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  itemLabel: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
  },
});
