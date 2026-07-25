import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Users } from 'phosphor-react-native';
import { T, AppGradients } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';

const CREATORS = [
  { name: 'Alex Rivera',  handle: '@alex.r',     bio: 'Visual storyteller & photographer',  category: 'Photography',  subscribers: '12.4K', price: 450 },
  { name: 'Sarah Moon',   handle: '@sarah_m',    bio: 'Lifestyle content creator',            category: 'Lifestyle',    subscribers: '8.1K',  price: 350 },
  { name: 'Dev Studio',   handle: '@devstudio',  bio: 'Tech educator & developer',            category: 'Technology',   subscribers: '21.0K', price: 200 },
  { name: 'Creative X',   handle: '@creativex',  bio: 'Art director & designer',              category: 'Art',          subscribers: '5.6K',  price: 500 },
  { name: 'Luna Kim',     handle: '@luna.k',     bio: 'Fitness & wellness coach',             category: 'Fitness',      subscribers: '33.2K', price: 300 },
  { name: 'Jay Torres',   handle: '@jay.t',      bio: 'Music producer & DJ',                  category: 'Music',        subscribers: '17.8K', price: 400 },
  { name: 'Mia Chen',     handle: '@mia.c',      bio: 'Travel & adventure creator',           category: 'Travel',       subscribers: '9.3K',  price: 250 },
];

interface MsCreatorCardProps {
  id: number;
  variant?: 'compact' | 'featured';
  onPress?: () => void;
  onSubscribe?: () => void;
}

export function MsCreatorCard({ id, variant = 'compact', onPress, onSubscribe }: MsCreatorCardProps) {
  const idx = (id - 1) % CREATORS.length;
  const creator = CREATORS[idx];
  const initials = creator.name.split(' ').map((n) => n[0]).join('').slice(0, 2);
  const online = id % 3 === 0;

  if (variant === 'compact') {
    return (
      <TouchableOpacity style={styles.compact} activeOpacity={0.75} onPress={onPress}>
        <MsAvatar size={60} initials={initials} showOnline={online} />
        <Text style={styles.compactName} numberOfLines={1}>
          {creator.name.split(' ')[0]}
        </Text>
        <Text style={styles.compactHandle} numberOfLines={1}>{creator.handle}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.featured} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.featuredTop}>
        <MsAvatar size={50} initials={initials} showOnline={online} />
        {online && (
          <View style={styles.onlinePill}>
            <Text style={styles.onlineLabel}>● Live</Text>
          </View>
        )}
      </View>

      <View style={styles.categoryTag}>
        <Text style={styles.categoryTagText}>{creator.category.toUpperCase()}</Text>
      </View>

      <Text style={styles.featuredName} numberOfLines={1}>{creator.name}</Text>
      <Text style={styles.featuredHandle} numberOfLines={1}>{creator.handle}</Text>
      <Text style={styles.featuredBio} numberOfLines={2}>{creator.bio}</Text>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Users size={11} color={T.TEXT_3} />
          <Text style={styles.metricText}>{creator.subscribers}</Text>
        </View>
        <Text style={styles.priceText}>{creator.price} cr/mo</Text>
      </View>

      <TouchableOpacity
        style={styles.subscribeBtnWrap}
        activeOpacity={0.85}
        onPress={onSubscribe ?? onPress}
      >
        <LinearGradient
          colors={AppGradients.rose}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.subscribeBtn}
        >
          <Text style={styles.subscribeBtnLabel}>Subscribe</Text>
        </LinearGradient>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  compact: {
    width: 76,
    alignItems: 'center',
    gap: 5,
  },
  compactName: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    textAlign: 'center',
  },
  compactHandle: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
  },

  featured: {
    width: 158,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER,
    padding: 14,
    gap: 4,
  },
  featuredTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  onlinePill: {
    backgroundColor: 'rgba(52,201,123,0.12)',
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(52,201,123,0.25)',
  },
  onlineLabel: {
    fontSize: 9,
    fontFamily: T.FONT.semibold,
    color: T.SUCCESS,
    letterSpacing: 0.2,
  },
  categoryTag: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(232,68,122,0.1)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: T.RADIUS.xs,
    borderWidth: 1,
    borderColor: 'rgba(232,68,122,0.2)',
  },
  categoryTagText: {
    fontSize: 8,
    fontFamily: T.FONT.semibold,
    color: T.ROSE,
    letterSpacing: 0.8,
  },
  featuredName: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    marginTop: 4,
  },
  featuredHandle: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },
  featuredBio: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    lineHeight: 16,
    marginTop: 2,
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
  },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricText: { fontSize: 10, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  priceText:  { fontSize: 9,  fontFamily: T.FONT.semibold, color: T.ROSE_GOLD },
  subscribeBtnWrap: { marginTop: 8 },
  subscribeBtn: {
    height: 32,
    borderRadius: T.RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeBtnLabel: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
});
