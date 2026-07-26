/**
 * MsModal — shared modal/sheet shell.
 *
 * Keeps transient interactions in one place and gives every sheet the same
 * warm, borderless surface treatment on native and web.
 */
import React, { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { X } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/constants/theme';

export interface MsModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  presentation?: 'sheet' | 'center';
  style?: ViewStyle;
}

export function MsModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  presentation = 'sheet',
  style,
}: MsModalProps) {
  const insets = useSafeAreaInsets();
  const isSheet = presentation === 'sheet';

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isSheet ? 'slide' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.surface,
            isSheet ? styles.sheet : styles.center,
            isSheet && { paddingBottom: Math.max(insets.bottom + 8, 20) },
            style,
          ]}
        >
          {isSheet && <View style={styles.handle} />}
          {(title || subtitle) && (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                {title && <Text style={styles.title}>{title}</Text>}
                {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.close}>
                <X size={18} color={T.TEXT_2} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.body}>{children}</View>
          {footer && <View style={styles.footer}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,5,8,0.72)',
    justifyContent: 'flex-end',
  },
  surface: {
    backgroundColor: T.SURFACE,
    shadowColor: T.SHADOW,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 18,
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  center: {
    alignSelf: 'center',
    width: '86%',
    borderRadius: 24,
    padding: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  headerCopy: { flex: 1 },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: 12 },
  footer: { marginTop: 18 },
});