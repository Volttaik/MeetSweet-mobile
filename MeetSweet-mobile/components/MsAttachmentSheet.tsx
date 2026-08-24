/**
 * MsAttachmentSheet — media-selection action sheet, 4-column grid.
 *
 * GIFs use the official native GIPHY SDK and return a binary media
 * attachment; it never uses the device emoji keyboard or the photo picker.
 *
 * Deep-black, high-contrast bottom sheet. Solid surface (no glass / no blur /
 * no translucent backdrop effects). Smooth spring slide-up and timing slide-
 * down. Safe-area aware and stable across keyboard open/close and light/dark
 * system settings. Only the presentation is custom — every picker action is
 * unchanged.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
} from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsPressable } from '@/components/MsPressable';
import { dialogs } from '@/components/MsGlobalDialogs';

const { height: SCREEN_H } = Dimensions.get('window');

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
  type: 'image' | 'video' | 'audio' | 'document' | 'gif';
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

  // GIFs are not offered as a dedicated action — the Giphy picker is not
  // supported. Animated GIFs can still be sent as images from the photo
  // library (the mime/extension is preserved through the image path).
  const OPTIONS = [
    { icon: ImageIcon,     label: 'Photo',    color: '#4CAF82', onPress: pickImage    },
    { icon: Video,         label: 'Video',    color: '#9B6ECA', onPress: pickVideo    },
    { icon: Camera,        label: 'Camera',   color: T.ACCENT,  onPress: launchCamera },
    { icon: Waveform,      label: 'Audio',    color: '#FF9800', onPress: pickAudio    },
    { icon: File,          label: 'Document', color: '#2196F3', onPress: pickDocument },
  ];

  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const bgAnim    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 24,
          stiffness: 220,
          mass: 0.9,
        }),
        Animated.timing(bgAnim, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_H,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, bgAnim]);

  const paddingBottom = Math.max(insets.bottom, 16);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Solid dim backdrop (no blur) */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: bgAnim }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Deep-black sheet */}
      <Animated.View
        style={[s.sheetOuter, { transform: [{ translateY: slideAnim }] }]}
      >
        <View style={[s.surface, { paddingBottom }]}>
          <View style={s.handle} />
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
        </View>
      </Animated.View>

    </Modal>
  );
}

const s = StyleSheet.create({
  sheetOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 24,
  },
  // Solid deep-black surface — no translucency, no blur.
  surface: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginBottom: 22,
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
