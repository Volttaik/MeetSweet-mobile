import React, { useEffect, useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import type { Short } from '@/services/content';
import { MsMediaLoader } from '@/components/MsMediaLoader';

interface Props {
  item: Short;
  active: boolean;
  onViewProgress?: (seconds: number) => void;
  onError?: () => void;
}

export function MsShortsPlayer({ item, active, onViewProgress, onError }: Props) {
  const ref = useRef<Video>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      ref.current?.pauseAsync().catch(() => {});
      startedAt.current = null;
      return;
    }
    startedAt.current = Date.now();
    ref.current?.playAsync().catch(() => {});
    return () => {
      if (startedAt.current) onViewProgress?.((Date.now() - startedAt.current) / 1000);
      ref.current?.pauseAsync().catch(() => {});
    };
  }, [active, onViewProgress]);

  return (
    <View style={styles.root}>
      {item.thumbnailUrl ? <MsMediaLoader uri={item.thumbnailUrl} style={StyleSheet.absoluteFill} resizeMode="cover" accessibleLabel="Short thumbnail" /> : null}
      {item.videoUrl ? (
        <Video
          ref={ref}
          source={{ uri: item.videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={active}
          isLooping
          useNativeControls={false}
          onError={onError}
        />
      ) : null}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => active && ref.current?.pauseAsync()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: Dimensions.get('window').width, height: Dimensions.get('window').height, backgroundColor: '#050506' },
});