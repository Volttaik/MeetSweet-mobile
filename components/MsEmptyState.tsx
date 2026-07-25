import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkle } from 'phosphor-react-native';
import { T, AppGradients } from '@/constants/theme';

interface MsEmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function MsEmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon,
}: MsEmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        {icon ?? <Sparkle size={22} color={T.ROSE} />}
      </View>
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.85} style={styles.btnWrap}>
          <LinearGradient
            colors={AppGradients.rose}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.btn}
          >
            <Text style={styles.btnLabel}>{actionLabel}</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 72,
    paddingHorizontal: 40,
    gap: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(232,68,122,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  message: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 22,
  },
  btnWrap: { marginTop: 8 },
  btn: {
    paddingHorizontal: 28,
    height: 42,
    borderRadius: T.RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    letterSpacing: 0.1,
  },
});
