/**
 * MsVideoThumbnailPicker — compact UI for selecting/uploading video thumbnails.
 * Options: Auto-extract (first frame), Upload custom image.
 * Used in create-post.tsx for video/shorts types.
 */
import React, { useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Images, X, Check } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsShimmer } from '@/components/MsShimmer';

interface MsVideoThumbnailPickerProps {
  videoUri?: string | null;
  thumbnailUri?: string | null;
  onThumbnailSelected: (uri: string, mime: string, name: string) => void;
  onClear?: () => void;
}

export function MsVideoThumbnailPicker({
  thumbnailUri,
  onThumbnailSelected,
  onClear,
}: MsVideoThumbnailPickerProps) {
  const [loading, setLoading] = useState(false);

  const pickCustomThumbnail = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,  // no forced crop — use full native image
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      onThumbnailSelected(
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
        asset.fileName ?? `thumb-${Date.now()}.jpg`,
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Thumbnail</Text>
        <MsShimmer width="100%" height={80} borderRadius={T.RADIUS.sm} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Thumbnail</Text>

      {thumbnailUri ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: thumbnailUri }} style={styles.preview} resizeMode="cover" />
          <View style={styles.previewBadge}>
            <Check size={10} color="#fff" weight="bold" />
            <Text style={styles.previewBadgeText}>Custom</Text>
          </View>
          {onClear && (
            <TouchableOpacity style={styles.clearBtn} onPress={onClear} activeOpacity={0.8}>
              <X size={12} color="#fff" weight="bold" />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={pickCustomThumbnail} activeOpacity={0.8}>
            <Images size={14} color={T.ACCENT} />
            <Text style={styles.actionLabel}>Upload thumbnail</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
    letterSpacing: 0.3,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    flex: 1,
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  previewWrap: {
    borderRadius: T.RADIUS.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  preview: {
    width: '100%',
    height: 80,
    borderRadius: T.RADIUS.sm,
  },
  previewBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.RADIUS.pill,
  },
  previewBadgeText: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },
  clearBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
