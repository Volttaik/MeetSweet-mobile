/**
 * MsAttachmentSheet — glassmorphic attachment menu bottom sheet.
 * Premium glass design: blur, soft border, spring animation.
 */

import React from 'react';
import {
  Alert,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import {
  Image as ImageIcon,
  Video,
  File,
  Camera,
  Waveform,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsGlassSheet } from '@/components/MsGlassSheet';
import { MsPressable } from '@/components/MsPressable';

export interface AttachmentResult {
  type: 'image' | 'video' | 'audio' | 'document';
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
      Alert.alert('Permission required', 'Please allow access to your photo library.');
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
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? 'photo.jpg',
        fileSize: asset.fileSize,
      });
    }
  };

  const pickVideo = async () => {
    onClose();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
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
      Alert.alert('Permission required', 'Please allow access to your camera.');
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
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? 'photo.jpg',
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
      Alert.alert('Error', 'Could not open the audio picker.');
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
      Alert.alert('Error', 'Could not open the document picker.');
    }
  };

  const OPTIONS = [
    { icon: ImageIcon,  label: 'Photo',    color: '#4CAF82', onPress: pickImage    },
    { icon: Video,      label: 'Video',    color: '#9B6ECA', onPress: pickVideo    },
    { icon: Camera,     label: 'Camera',   color: T.ACCENT,  onPress: launchCamera },
    { icon: Waveform,   label: 'Audio',    color: '#FF9800', onPress: pickAudio    },
    { icon: File,       label: 'Document', color: '#2196F3', onPress: pickDocument },
  ];

  return (
    <MsGlassSheet visible={visible} onClose={onClose}>
      <Text style={s.title}>Share</Text>
      <View style={s.grid}>
        {OPTIONS.map((opt) => (
          <MsPressable
            key={opt.label}
            style={s.item}
            onPress={opt.onPress}
            scale={0.88}
          >
            <View style={[s.iconWrap, { backgroundColor: `${opt.color}22` }]}>
              <opt.icon size={26} color={opt.color} weight="duotone" />
            </View>
            <Text style={s.itemLabel}>{opt.label}</Text>
          </MsPressable>
        ))}
      </View>
    </MsGlassSheet>
  );
}

const s = StyleSheet.create({
  title: {
    fontSize: 17,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    marginBottom: 24,
    letterSpacing: 0.2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 8,
  },
  item: {
    width: '28%',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  itemLabel: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
    textAlign: 'center',
  },
});
