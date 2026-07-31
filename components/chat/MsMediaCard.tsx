/**
 * MsMediaCard — ~5px radius media message card.
 * Used for image, video, and thumbnail previews.
 * Premium card appearance with elegant shadows.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Play } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = SCREEN_W * 0.62;
const CARD_H = CARD_W * 0.75;

interface Props {
  message: MsMessage;
  position: 'left' | 'right';
  onPress?: () => void;
  /** For paid locked content */
  isLocked?: boolean;
}

export function MsMediaCard({ message, position, onPress, isLocked }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const isOwn = position === 'right';
  const isVideo = message.msMediaType === 'video' || !!message.video;
  const uri = message.image || message.video || message.audio || '';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, isOwn ? styles.containerRight : styles.containerLeft]}
    >
      <View style={[styles.card, isLocked && styles.cardLocked]}>
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>Failed to load</Text>
          </View>
        ) : (
          <>
            <Image
              source={{ uri }}
              style={[styles.image, isLocked && styles.imageLocked]}
              onLoadStart={() => setLoading(true)}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              resizeMode="cover"
            />
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color={T.TEXT_3} />
              </View>
            )}
            {isVideo && !loading && (
              <View style={styles.playOverlay}>
                <View style={styles.playButton}>
                  <Play size={22} color="#fff" weight="fill" />
                </View>
              </View>
            )}
          </>
        )}

        {/* Caption */}
        {message.msCaption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.caption} numberOfLines={2}>
              {message.msCaption}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
  },
  containerLeft: {
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  containerRight: {
    alignSelf: 'flex-end',
    marginRight: 8,
  },

  card: {
    width: CARD_W,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
    ...T.SHADOWS.medium,
  },
  cardLocked: {
    opacity: 0.6,
  },

  image: {
    width: CARD_W,
    height: CARD_H,
  },
  imageLocked: {
    opacity: 0.3,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.SURFACE_2,
  },

  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },

  captionWrap: {
    padding: 10,
    backgroundColor: T.SURFACE_2,
  },
  caption: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },

  errorWrap: {
    width: CARD_W,
    height: CARD_H * 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 13,
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
  },
});
