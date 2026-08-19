/**
 * MsVideoThumbnail — renders the first decoded frame of a video as a thumbnail.
 *
 * Used when a post has no thumbnail_url but has a video URL.
 * Mounts a silent, paused react-native-video instance whose first frame the
 * native player renders once it is ready. Once the frame appears
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
import Video from 'react-native-video';
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
      {/* Silent, paused video — first frame rendered natively */}
      <Video
        source={{ uri: videoUri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        paused
        muted
        onReadyForDisplay={onReadyForDisplay}
      />

      {/* Dark overlay while first frame hasn't decoded yet */}
      {!ready ? (
        <View style={styles.placeholder} />
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
  },
});
