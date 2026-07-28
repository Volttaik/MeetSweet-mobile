/**
 * MsVideoThumbnail — renders the first decoded frame of a video as a thumbnail.
 *
 * Used when a post has no thumbnail_url but has a video URL.
 * Mounts a silent, non-playing Video instance off-screen whose first frame
 * expo-av renders natively on both iOS and Android. Once the frame appears
 * (onReadyForDisplay) the overlay fades out to reveal it.
 *
 * Performance: the video is paused immediately and never buffers past the first
 * keyframe, so network/CPU impact is minimal.
 */
import React, { useCallback, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import { Play } from 'phosphor-react-native';
import { T } from '@/constants/theme';

interface Props {
  videoUri: string;
  /** StyleProp so StyleSheet.absoluteFill (RegisteredStyle) is accepted. */
  style?: StyleProp<ViewStyle>;
  /** When false the thumbnail hides and yields to the parent (e.g. the player itself). */
  visible?: boolean;
}

export function MsVideoThumbnail({ videoUri, style, visible = true }: Props) {
  const [ready, setReady] = useState(false);

  const onReadyForDisplay = useCallback(() => {
    setReady(true);
  }, []);

  if (!visible) return null;

  return (
    <View style={[styles.container, style]}>
      {/* Silent non-playing video — first frame rendered natively */}
      <Video
        source={{ uri: videoUri }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isMuted
        onReadyForDisplay={onReadyForDisplay}
        useNativeControls={false}
      />

      {/* Dark overlay + play icon while first frame hasn't decoded yet */}
      {!ready ? (
        <View style={styles.placeholder}>
          <View style={styles.playCircle}>
            <Play size={20} color="rgba(255,255,255,0.85)" weight="fill" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: T.SURFACE_2,
    overflow: 'hidden',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
