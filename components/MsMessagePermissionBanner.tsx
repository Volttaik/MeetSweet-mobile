/**
 * MsMessagePermissionBanner — shown on creator/user profiles to indicate
 * their messaging permission level.
 *
 * Button states:
 *  active         → "Message" (primary fill)
 *  subscribe_msg  → "Subscribe to Message" (secondary)
 *  pay_msg        → "Pay $X to Message" (accent outline)
 *  blocked        → "Blocked" (disabled with lock)
 *  no_permission  → "Cannot Message" (disabled)
 */
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChatCircle, LockSimple, UserMinus, Users } from 'phosphor-react-native';
import { T } from '@/constants/theme';

export type MessagePermission =
  | 'everyone'
  | 'subscribers_only'
  | 'no_one'
  | 'blocked';

export type MessageBtnState =
  | { type: 'active' }
  | { type: 'subscribe_to_message' }
  | { type: 'pay_to_message'; price: number; currency?: string }
  | { type: 'blocked' }
  | { type: 'no_permission' };

interface Props {
  permission:    MessagePermission;
  btnState:      MessageBtnState;
  onMessage:     () => void;
  onSubscribe?:  () => void;
  onPay?:        () => void;
}

export function MsMessagePermissionBanner({
  permission,
  btnState,
  onMessage,
  onSubscribe,
  onPay,
}: Props) {

  // ── Banner text ──────────────────────────────────────────────────────────────
  const bannerText =
    permission === 'everyone'          ? 'Accepts messages from everyone' :
    permission === 'subscribers_only'  ? 'Subscribers only' :
    permission === 'no_one'            ? 'Does not accept messages' :
    permission === 'blocked'           ? 'You have blocked this user' : '';

  const bannerIcon =
    permission === 'everyone'         ? <ChatCircle size={13} color={T.TEXT_3} /> :
    permission === 'subscribers_only' ? <Users size={13} color={T.TEXT_3} /> :
    permission === 'no_one'           ? <LockSimple size={13} color={T.TEXT_3} /> :
    permission === 'blocked'          ? <UserMinus size={13} color={T.DANGER} /> : null;

  // ── Button ───────────────────────────────────────────────────────────────────
  const renderBtn = () => {
    switch (btnState.type) {
      case 'active':
        return (
          <TouchableOpacity style={s.btnFill} onPress={onMessage} activeOpacity={0.8}>
            <ChatCircle size={16} color="#fff" weight="fill" />
            <Text style={s.btnFillLabel}>Message</Text>
          </TouchableOpacity>
        );

      case 'subscribe_to_message':
        return (
          <TouchableOpacity style={s.btnOutline} onPress={onSubscribe} activeOpacity={0.8}>
            <Users size={16} color={T.ACCENT} />
            <Text style={s.btnOutlineLabel}>Subscribe to Message</Text>
          </TouchableOpacity>
        );

      case 'pay_to_message':
        return (
          <TouchableOpacity style={s.btnOutline} onPress={onPay} activeOpacity={0.8}>
            <LockSimple size={16} color={T.ACCENT} />
            <Text style={s.btnOutlineLabel}>
              Pay {btnState.currency ?? '$'}{btnState.price.toFixed(2)} to Message
            </Text>
          </TouchableOpacity>
        );

      case 'blocked':
        return (
          <View style={[s.btnDisabled, { borderColor: T.DANGER + '40' }]}>
            <LockSimple size={16} color={T.DANGER} />
            <Text style={[s.btnDisabledLabel, { color: T.DANGER }]}>Blocked</Text>
          </View>
        );

      case 'no_permission':
        return (
          <View style={s.btnDisabled}>
            <LockSimple size={16} color={T.TEXT_3} />
            <Text style={s.btnDisabledLabel}>Cannot Message</Text>
          </View>
        );
    }
  };

  return (
    <View style={s.wrap}>
      {/* Permission banner */}
      {bannerText ? (
        <View style={s.banner}>
          {bannerIcon}
          <Text style={[s.bannerText, permission === 'blocked' && { color: T.DANGER }]}>
            {bannerText}
          </Text>
        </View>
      ) : null}

      {/* Message button */}
      {renderBtn()}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    gap: 8,
    alignItems: 'stretch',
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.full,
    alignSelf: 'center',
  },
  bannerText: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
    letterSpacing: 0.1,
  },

  btnFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
  },
  btnFillLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },

  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: T.RADIUS.full,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: T.ACCENT,
  },
  btnOutlineLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.ACCENT,
  },

  btnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: T.RADIUS.full,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    opacity: 0.6,
  },
  btnDisabledLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
});
