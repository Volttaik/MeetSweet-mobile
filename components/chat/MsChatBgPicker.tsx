/**
 * MsChatBgPicker — bottom sheet for selecting a chat background.
 * Options: Default | 8 solid colours | 6 gradients | Custom image upload
 */
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Image as ImageIcon } from 'phosphor-react-native';
import { T } from '@/constants/theme';

export type ChatBackground =
  | { type: 'default' }
  | { type: 'color'; value: string }
  | { type: 'gradient'; value: [string, string] }
  | { type: 'image'; uri: string };

const SOLID_COLORS = [
  '#0C0C0F', '#111827', '#1a1025', '#0d1b2a',
  '#1a0a0a', '#0a1a10', '#1a1400', '#16101c',
];

const GRADIENTS: [string, string][] = [
  ['#0C0C0F', '#1a0a1a'],
  ['#0d1b2a', '#0a1224'],
  ['#111827', '#1f2a1a'],
  ['#1a0a0a', '#0d0a1a'],
  ['#0a1a10', '#0a0d1a'],
  ['#16101c', '#0a100a'],
];

interface Props {
  visible:   boolean;
  current:   ChatBackground;
  onSelect:  (bg: ChatBackground) => void;
  onClose:   () => void;
}

export function MsChatBgPicker({ visible, current, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [previewing, setPreviewing] = useState<ChatBackground>(current);

  const apply = (bg: ChatBackground) => {
    setPreviewing(bg);
    onSelect(bg);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to set a custom background.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      apply({ type: 'image', uri: result.assets[0].uri });
    }
  };

  const isActive = (bg: ChatBackground): boolean => {
    if (bg.type !== previewing.type) return false;
    if (bg.type === 'color' && previewing.type === 'color') return bg.value === previewing.value;
    if (bg.type === 'gradient' && previewing.type === 'gradient') return bg.value[0] === previewing.value[0];
    if (bg.type === 'image' && previewing.type === 'image') return bg.uri === previewing.uri;
    return bg.type === previewing.type;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: Math.max(insets.bottom + 8, 24) }]} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Chat Background</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={s.doneLabel}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Default */}
            <Text style={s.sectionLabel}>Default</Text>
            <View style={s.row}>
              <TouchableOpacity
                style={[s.swatch, s.defaultSwatch]}
                onPress={() => apply({ type: 'default' })}
                activeOpacity={0.8}
              >
                {isActive({ type: 'default' }) && <Check size={16} color={T.TEXT} weight="bold" />}
              </TouchableOpacity>
            </View>

            {/* Solid colours */}
            <Text style={s.sectionLabel}>Solid Colours</Text>
            <View style={s.grid}>
              {SOLID_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.swatch, { backgroundColor: c }]}
                  onPress={() => apply({ type: 'color', value: c })}
                  activeOpacity={0.8}
                >
                  {isActive({ type: 'color', value: c }) && (
                    <Check size={16} color="#fff" weight="bold" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Gradients */}
            <Text style={s.sectionLabel}>Gradients</Text>
            <View style={s.grid}>
              {GRADIENTS.map((g, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.swatch, { overflow: 'hidden' }]}
                  onPress={() => apply({ type: 'gradient', value: g })}
                  activeOpacity={0.8}
                >
                  {/* Simulate gradient with two half-views */}
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: g[0], flex: 1 }]} />
                  <View style={[s.gradientBottom, { backgroundColor: g[1] }]} />
                  {isActive({ type: 'gradient', value: g }) && (
                    <View style={s.checkWrap}>
                      <Check size={14} color="#fff" weight="bold" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom image */}
            <Text style={s.sectionLabel}>Custom Image</Text>
            <View style={s.row}>
              <TouchableOpacity style={[s.swatch, s.customSwatch]} onPress={pickImage} activeOpacity={0.8}>
                {previewing.type === 'image' ? (
                  <Image source={{ uri: previewing.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <ImageIcon size={24} color={T.TEXT_3} />
                )}
                {previewing.type === 'image' && (
                  <View style={s.checkWrap}>
                    <Check size={14} color="#fff" weight="bold" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const SWATCH = 64;

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '75%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
  },
  doneLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.ACCENT,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  defaultSwatch: {
    backgroundColor: T.BG,
    borderWidth: 1,
    borderColor: T.BORDER_2,
  },
  customSwatch: {
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER_2,
  },
  gradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SWATCH / 2,
  },
  checkWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
