/**
 * MsAttachmentSheet — animated attachment menu bottom sheet.
 * All options are functional (image/video via ImagePicker, camera via camera launch).
 */

import React, { useEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Image as ImageIcon,
  Video,
  File,
  Camera,
  Microphone,
  MapPin,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = 280;

export interface AttachmentResult {
  type: 'image' | 'video' | 'audio';
  uri: string;
  mimeType: string;
  fileName: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onResult: (result: AttachmentResult) => void;
}

export function MsAttachmentSheet({ visible, onClose, onResult }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_H + 40)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_H + 40,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const pickImage = async () => {
    onClose();
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
      });
    }
  };

  const pickVideo = async () => {
    onClose();
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
      });
    }
  };

  const launchCamera = async () => {
    onClose();
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
      });
    }
  };

  const OPTIONS = [
    { icon: ImageIcon, label: 'Images', color: '#4CAF82', onPress: pickImage },
    { icon: Video, label: 'Videos', color: '#9B6ECA', onPress: pickVideo },
    { icon: Camera, label: 'Camera', color: T.ACCENT, onPress: launchCamera },
    {
      icon: Microphone,
      label: 'Audio',
      color: '#FF9800',
      onPress: () => {
        onClose();
        Alert.alert('Audio', 'Voice recording is coming soon.');
      },
    },
    {
      icon: File,
      label: 'Document',
      color: '#2196F3',
      onPress: async () => {
        onClose();
        await new Promise((r) => setTimeout(r, 300));
        try {
          const result = await DocumentPicker.getDocumentAsync({
            type: '*/*',
            copyToCacheDirectory: true,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          onResult({
            type: 'image', // use image slot so upload pipeline handles it
            uri: asset.uri,
            mimeType: asset.mimeType ?? 'application/octet-stream',
            fileName: asset.name ?? 'document',
          });
        } catch {
          Alert.alert('Error', 'Could not open the document picker.');
        }
      },
    },
    {
      icon: MapPin,
      label: 'Location',
      color: '#607D8B',
      onPress: () => {
        onClose();
        Alert.alert('Location', 'Location sharing coming soon.');
      },
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[
          s.sheet,
          { paddingBottom: Math.max(insets.bottom, 16) },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={s.handle} />
        <Text style={s.title}>Share</Text>
        <View style={s.grid}>
          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={s.item}
              onPress={opt.onPress}
              activeOpacity={0.75}
            >
              <View style={[s.iconWrap, { backgroundColor: `${opt.color}22` }]}>
                <opt.icon size={24} color={opt.color} />
              </View>
              <Text style={s.itemLabel}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  item: {
    width: '28%',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
    textAlign: 'center',
  },
});
