/**
 * MsConfirmDialog — reusable confirmation modal.
 * Use for all destructive / irreversible actions instead of Alert.alert.
 */
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { T } from '@/constants/theme';

export interface MsConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders confirm button in red */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MsConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: MsConfirmDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                destructive && styles.confirmBtnDestructive,
              ]}
              onPress={() => {
                onCancel();
                setTimeout(onConfirm, 80);
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.confirmLabel,
                  destructive && styles.confirmLabelDestructive,
                ]}
              >
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    shadowColor: T.SHADOW,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 26,
    elevation: 14,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 2,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDestructive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  confirmLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
  confirmLabelDestructive: {
    color: '#EF4444',
  },
});
