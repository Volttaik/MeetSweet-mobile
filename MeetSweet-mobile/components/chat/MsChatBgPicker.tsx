/**
 * MsChatBgPicker — modern chat background selection bottom sheet.
 *
 * Options: Default | solid colours | gradients | custom image (from the photo
 * library). The selected background is applied to the conversation IMMEDIATELY
 * on tap (onSelect) while the sheet stays open for previewing, and persists via
 * the chat-background service (per user + room).
 *
 * Custom images are copied into the app's persistent document directory
 * (expo-file-system) so the background survives app restarts — photo-library
 * cache URIs do not.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image as RnImage,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Image as ImageIcon } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { dialogs } from '@/components/MsGlobalDialogs';
import {
  SOLID_COLORS,
  GRADIENTS,
  type ChatBackground,
} from '@/services/chat-background';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_MAX_H = SCREEN_H * 0.78;
const SWATCH = 64;

interface Props {
  visible:   boolean;
  current:   ChatBackground;
  onSelect:  (bg: ChatBackground) => void;
  onClose:   () => void;
}

/**
 * Copy a picked photo-library image into the persistent document directory so
 * the background survives app restarts. Returns the persistent URI, or the
 * original URI on web/failure (best-effort).
 */
async function persistBackgroundImage(sourceUri: string): Promise<string> {
  try {
    const fs = await import('expo-file-system');
    const dir = new fs.Directory(fs.Paths.document, 'chat-backgrounds');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const name = `bg-${Date.now()}.jpg`;
    const dest = new fs.File(dir, name);
    const src = new fs.File(sourceUri);
    if (!src.exists) return sourceUri;
    src.copy(dest);
    return dest.uri;
  } catch {
    return sourceUri;
  }
}

/** Best-effort delete of a previously persisted custom background image. */
async function removeBackgroundImage(uri?: string): Promise<void> {
  if (!uri) return;
  try {
    const fs = await import('expo-file-system');
    const f = new fs.File(uri);
    if (f.exists && uri.includes('/chat-backgrounds/')) f.delete();
  } catch {
    // non-fatal
  }
}

export function MsChatBgPicker({ visible, current, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<ChatBackground>(current);
  const slideAnim = useRef(new Animated.Value(SHEET_MAX_H)).current;
  const prevCustomRef = useRef<string | null>(
    current.type === 'image' ? current.uri : null,
  );

  useEffect(() => {
    if (visible) {
      setPreview(current);
      prevCustomRef.current = current.type === 'image' ? current.uri : null;
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 230,
        mass: 0.9,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_MAX_H,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, current, slideAnim]);

  const apply = useCallback((bg: ChatBackground) => {
    setPreview(bg);
    // Apply + persist immediately; the sheet stays open for further previews.
    onSelect(bg);
  }, [onSelect]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      dialogs.alert({ title: 'Permission required', message: 'Allow photo access to set a custom background.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const sourceUri = result.assets[0].uri;
    const persistentUri = await persistBackgroundImage(sourceUri);
    // Free the previous custom image file when it is replaced.
    if (prevCustomRef.current && prevCustomRef.current !== persistentUri) {
      removeBackgroundImage(prevCustomRef.current).catch(() => {});
    }
    prevCustomRef.current = persistentUri;
    apply({ type: 'image', uri: persistentUri });
  };

  const isActive = (bg: ChatBackground): boolean => {
    if (bg.type !== preview.type) return false;
    if (bg.type === 'color' && preview.type === 'color') return bg.value === preview.value;
    if (bg.type === 'gradient' && preview.type === 'gradient') return bg.value[0] === preview.value[0];
    if (bg.type === 'image' && preview.type === 'image') return bg.uri === preview.uri;
    return bg.type === preview.type;
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose} />

      <Animated.View
        style={[
          s.sheet,
          {
            maxHeight: SHEET_MAX_H,
            paddingBottom: Math.max(insets.bottom + 10, 26),
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={s.handle} />

        <View style={s.header}>
          <Text style={s.title}>Chat Background</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={s.doneLabel}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Live preview of the currently selected background */}
        <View style={s.previewWrap}>
          {preview.type === 'default' && (
            <View style={[s.previewInner, s.previewDefault]}>
              <Text style={s.previewDefaultText}>Default wallpaper</Text>
            </View>
          )}
          {preview.type === 'color' && (
            <View style={[s.previewInner, { backgroundColor: preview.value }]} />
          )}
          {preview.type === 'gradient' && (
            <LinearGradient
              colors={preview.value}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={s.previewInner}
            />
          )}
          {preview.type === 'image' && (
            <RnImage source={{ uri: preview.uri }} style={s.previewInner} resizeMode="cover" />
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
          {/* Default */}
          <Text style={s.sectionLabel}>Default</Text>
          <View style={s.row}>
            <Pressable
              style={[s.swatch, s.defaultSwatch, isActive({ type: 'default' }) && s.swatchActive]}
              onPress={() => apply({ type: 'default' })}
              android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
            >
              {isActive({ type: 'default' }) && <Check size={16} color={T.TEXT} weight="bold" />}
            </Pressable>
          </View>

          {/* Solid colours */}
          <Text style={s.sectionLabel}>Solid Colours</Text>
          <View style={s.grid}>
            {SOLID_COLORS.map((c) => {
              const active = isActive({ type: 'color', value: c });
              return (
                <Pressable
                  key={c}
                  style={[s.swatch, { backgroundColor: c }, active && s.swatchActive]}
                  onPress={() => apply({ type: 'color', value: c })}
                  android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
                >
                  {active && <Check size={16} color="#fff" weight="bold" />}
                </Pressable>
              );
            })}
          </View>

          {/* Gradients */}
          <Text style={s.sectionLabel}>Gradients</Text>
          <View style={s.grid}>
            {GRADIENTS.map((g, i) => {
              const active = isActive({ type: 'gradient', value: g });
              return (
                <Pressable
                  key={i}
                  style={[s.swatch, active && s.swatchActive]}
                  onPress={() => apply({ type: 'gradient', value: g })}
                  android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
                >
                  <LinearGradient
                    colors={g}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.7, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {active && (
                    <View style={s.checkWrap}>
                      <Check size={14} color="#fff" weight="bold" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Custom image */}
          <Text style={s.sectionLabel}>Custom Image</Text>
          <View style={s.row}>
            <Pressable
              style={[s.swatch, s.customSwatch, isActive({ type: 'image', uri: preview.type === 'image' ? preview.uri : '' }) && s.swatchActive]}
              onPress={pickImage}
              android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
            >
              {preview.type === 'image' ? (
                <RnImage source={{ uri: preview.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <ImageIcon size={24} color={T.TEXT_3} />
              )}
              {preview.type === 'image' && (
                <View style={s.checkWrap}>
                  <Check size={14} color="#fff" weight="bold" />
                </View>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
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
    marginBottom: 14,
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

  // Live preview of the current selection
  previewWrap: {
    height: 110,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  previewInner: {
    flex: 1,
  },
  previewDefault: {
    backgroundColor: '#0C0C0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDefaultText: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },

  scrollContent: {
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 14,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: T.ACCENT,
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
  checkWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
