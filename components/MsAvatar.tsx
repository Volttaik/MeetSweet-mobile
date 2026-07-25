import React, { useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T, AppGradients } from '@/constants/theme';

interface MsAvatarProps {
  size?: number;
  initials?: string;
  imageUri?: string;
  showOnline?: boolean;
  badgeCount?: number;
  /** Wrap avatar in rose-pink gradient ring */
  premium?: boolean;
}

export function MsAvatar({
  size = 40,
  initials = 'U',
  imageUri,
  showOnline = false,
  badgeCount,
  premium = false,
}: MsAvatarProps) {
  const radius = size / 2;
  const dotSize = Math.max(Math.floor(size * 0.26), 10);
  const fontSize = Math.floor(size * 0.36);
  const imgOpacity = useRef(new Animated.Value(0)).current;

  const onLoad = () => {
    Animated.timing(imgOpacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const ring = premium ? 2.5 : 0;
  const innerSize = size - ring * 2 - 2;

  return (
    <View style={{ width: size, height: size }}>
      {premium ? (
        <LinearGradient
          colors={AppGradients.rosePurple}
          style={[styles.premiumRing, { width: size, height: size, borderRadius: radius }]}
        >
          <View
            style={[
              styles.circle,
              { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
            ]}
          >
            <Text style={[styles.initials, { fontSize: Math.floor(innerSize * 0.36) }]}>
              {(initials || 'U').toUpperCase().slice(0, 2)}
            </Text>
            {imageUri ? (
              <Animated.Image
                source={{ uri: imageUri }}
                style={[
                  styles.absoluteImage,
                  { width: innerSize, height: innerSize, borderRadius: innerSize / 2, opacity: imgOpacity },
                ]}
                resizeMode="cover"
                onLoad={onLoad}
              />
            ) : null}
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.circle, { width: size, height: size, borderRadius: radius }]}>
          <Text style={[styles.initials, { fontSize }]}>
            {(initials || 'U').toUpperCase().slice(0, 2)}
          </Text>
          {imageUri ? (
            <Animated.Image
              source={{ uri: imageUri }}
              style={[
                styles.absoluteImage,
                { width: size, height: size, borderRadius: radius, opacity: imgOpacity },
              ]}
              resizeMode="cover"
              onLoad={onLoad}
            />
          ) : null}
        </View>
      )}

      {showOnline && (
        <View
          style={[
            styles.onlineDot,
            { width: dotSize, height: dotSize, borderRadius: dotSize / 2 },
          ]}
        />
      )}

      {badgeCount !== undefined && badgeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {badgeCount > 99 ? '99+' : String(badgeCount)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  premiumRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.BORDER_2,
    overflow: 'hidden',
  },
  initials: {
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
  },
  absoluteImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: T.SUCCESS,
    borderWidth: 2,
    borderColor: T.BG,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ROSE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: T.BG,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
  },
});
