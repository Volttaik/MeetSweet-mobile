/**
 * MsUserProfileSheet — compact profile bottom sheet shown when a user
 * taps the avatar, name, or username inside a DM chat room header.
 *
 * Shows a polished profile summary with a "View Full Profile" CTA.
 * Swipe-to-dismiss enabled.
 */

import React, { useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, SealCheck, X } from 'phosphor-react-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsGlassSheet } from '@/components/MsGlassSheet';

export interface ProfileSheetUser {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  bio?: string | null;
  isVerified?: boolean;
  isCreator?: boolean;
  subscriberCount?: number;
}

interface Props {
  visible: boolean;
  user: ProfileSheetUser | null;
  onClose: () => void;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function fmtCount(n: number | undefined): string {
  if (n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function MsUserProfileSheet({
  visible,
  user,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

  if (!user) return null;

  const handleViewProfile = () => {
    onClose();
    const target = user.username || user.id;
    setTimeout(() => router.push(`/creator/${target}` as any), 200);
  };

  return (
    <MsGlassSheet
      visible={visible}
      onClose={onClose}
      extraBottomPad={8}
      surfaceStyle={{ paddingHorizontal: 20, paddingTop: 0 }}
    >
      {/* Close button */}
      <MsPressable style={s.closeBtn} onPress={onClose}>
        <X size={16} color={T.TEXT_2} />
      </MsPressable>

      {/* Avatar + name */}
      <View style={s.profileSection}>
        <MsAvatar
          size={72}
          initials={initials(user.name)}
          imageUri={user.avatarUrl ?? undefined}
        />
        <View style={s.nameRow}>
          <Text style={s.displayName}>{user.name}</Text>
          {user.isVerified && (
            <SealCheck size={16} color={T.TEXT} weight="fill" />
          )}
        </View>
        <Text style={s.usernameText}>@{user.username}</Text>
      </View>

      {/* Subscriber count */}
      {user.subscriberCount !== undefined && (
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{fmtCount(user.subscriberCount)}</Text>
            <Text style={s.statLabel}>Subscribers</Text>
          </View>
        </View>
      )}

      {/* Bio */}
      {user.bio ? (
        <Text style={s.bio} numberOfLines={3}>{user.bio}</Text>
      ) : null}

      {/* Action buttons */}
      <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <MsPressable style={s.viewProfileBtn} onPress={handleViewProfile}>
          <Text style={s.viewProfileText}>View Full Profile</Text>
          <ArrowRight size={16} color={T.TEXT} />
        </MsPressable>
      </View>
    </MsGlassSheet>
  );
}

const s = StyleSheet.create({
  closeBtn: {
    position: 'absolute',
    top: 16, right: 16,
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileSection: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  displayName: {
    fontSize: 20,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
  },
  usernameText: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.lg,
    paddingVertical: 14,
    marginBottom: 16,
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT },
  statLabel: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: T.BORDER_2 },

  bio: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },

  actions: {
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: T.RADIUS.pill,
  },
  actionBtnFill: {
    backgroundColor: T.ACCENT,
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  actionBtnOutline: {
    backgroundColor: T.SURFACE_2,
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },
  actionBtnTextOutline: {
    color: T.TEXT_2,
  },
  viewProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
  },
  viewProfileText: {
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
});