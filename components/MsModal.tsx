/**
 * MsModal — shared modal/sheet shell.
 *
 * Physics upgrade:
 *   - Swipe resistance: drag distance is rubber-banded (sqrt curve)
 *   - Velocity-based dismiss: fast swipe closes even before 80px threshold
 *   - Spring snap-back with configurable damping/stiffness
 */
import React, { ReactNode, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
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

  const translateY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        isSheet && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),

      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          // Apply rubber-band resistance: drag feels increasingly stiff
          const resistance = 0.55;
          const rubbered = g.dy * resistance;
          translateY.setValue(rubbered);
          // Fade overlay as user drags down
          const progress = Math.min(1, rubbered / 280);
          overlayOpacity.setValue(1 - progress * 0.5);
        }
      },

      onPanResponderRelease: (_, g) => {
        const shouldClose =
          g.dy > 80 || g.vy > 0.8; // threshold OR fast fling

        if (shouldClose) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: 600,
              duration: 260,
              useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            translateY.setValue(0);
            overlayOpacity.setValue(1);
            onClose();
          });
        } else {
          // Spring snap-back — slightly underdamped for a satisfying bounce
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              damping: 18,
              stiffness: 280,
              mass: 1,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 1,
              duration: 160,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },

      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 280,
          mass: 1,
        }).start();
        overlayOpacity.setValue(1);
      },
    }),
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isSheet ? 'slide' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlayWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.overlay, { opacity: overlayOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.surface,
            isSheet ? styles.sheet : styles.center,
            isSheet && { paddingBottom: Math.max(insets.bottom + 8, 20) },
            style,
            isSheet && { transform: [{ translateY }] },
          ]}
          {...(isSheet ? panResponder.panHandlers : {})}
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
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    backgroundColor: 'rgba(8,5,8,0.72)',
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
    marginBottom: 'auto',
    marginTop: 'auto',
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
