import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { ArrowsOut, Pause, Play, ArrowCounterClockwise } from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '@/constants/theme';
import { MsMediaLoader } from '@/components/MsMediaLoader';

interface Props {
  videoId: string;
  uri: string | null;
  posterUri?: string | null;
  autoPlay?: boolean;
}

const progressKey = (id: string) => `@ms_video_progress:${id}`;

export function MsLongFormPlayer({ videoId, uri, posterUri, autoPlay = false }: Props) {
  const ref = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isBuffering, setIsBuffering] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(progressKey(videoId)).then((value) => {
      if (active && value) setPosition(Number(value));
    }).catch(() => {});
    return () => { active = false; };
  }, [videoId]);

  const onStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsBuffering(true);
      return;
    }
    setIsBuffering(status.isBuffering);
    setIsPlaying(status.isPlaying);
    setPosition(status.positionMillis);
    setDuration(status.durationMillis ?? 0);
    if (status.positionMillis > 0 && Math.floor(status.positionMillis / 5000) !== Math.floor((position || 0) / 5000)) {
      AsyncStorage.setItem(progressKey(videoId), String(status.positionMillis)).catch(() => {});
    }
    if (status.didJustFinish) setIsPlaying(false);
  }, [position, videoId]);

  const toggle = async () => {
    if (!ref.current) return;
    setShowControls(true);
    if (isPlaying) await ref.current.pauseAsync();
    else await ref.current.playAsync();
  };

  const seek = async (next: number) => {
    const value = Math.max(0, Math.min(duration, next));
    setPosition(value);
    await ref.current?.setPositionAsync(value);
  };

  const Player = ({ modal = false }: { modal?: boolean }) => (
    <View style={[styles.player, modal && styles.modalPlayer]}>
      {posterUri ? <MsMediaLoader uri={posterUri} style={StyleSheet.absoluteFill} resizeMode="cover" accessibleLabel="Video thumbnail" /> : null}
      {uri && !error ? (
        <Video
          ref={ref}
          source={{ uri }}
          style={[StyleSheet.absoluteFill, styles.video]}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={autoPlay}
          positionMillis={position}
          onPlaybackStatusUpdate={onStatus}
          onError={() => { setError(true); setIsPlaying(false); }}
          useNativeControls={false}
        />
      ) : null}
      {!uri || error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>{error ? 'Video could not load' : 'Video unavailable'}</Text>
          {error ? <Pressable onPress={() => { setError(false); setIsBuffering(true); }}><Text style={styles.retry}>Try again</Text></Pressable> : null}
        </View>
      ) : null}
      {isBuffering && uri && !error ? <ActivityIndicator color="#fff" size="large" style={styles.spinner} /> : null}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowControls((value) => !value)} />
      {showControls && uri && !error ? (
        <View style={styles.controls}>
          <Pressable onPress={toggle} style={styles.playButton} accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}>
            {isPlaying ? <Pause size={22} color="#fff" weight="fill" /> : <Play size={22} color="#fff" weight="fill" />}
          </Pressable>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${duration ? (position / duration) * 100 : 0}%` }]} />
          </View>
          <Text style={styles.time}>{formatTime(position)} / {formatTime(duration)}</Text>
          {!modal ? <Pressable onPress={() => setFullscreen(true)} style={styles.expand} accessibilityLabel="Open fullscreen player"><ArrowsOut size={18} color="#fff" /></Pressable> : null}
          <Pressable onPress={() => seek(position >= duration ? 0 : position + 10)} style={styles.skip} accessibilityLabel="Skip forward"><ArrowCounterClockwise size={16} color="#fff" /></Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Player />
      <Modal visible={fullscreen} animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fullscreen}><Player modal /><Pressable style={styles.closeFullscreen} onPress={() => setFullscreen(false)}><Text style={styles.closeText}>Done</Text></Pressable></View>
      </Modal>
    </>
  );
}

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  player: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#050506', overflow: 'hidden', position: 'relative' },
  modalPlayer: { aspectRatio: undefined, flex: 1 },
  video: { zIndex: 1 },
  spinner: { ...StyleSheet.absoluteFillObject, zIndex: 3 },
  errorState: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 4 },
  errorTitle: { color: '#fff', fontFamily: T.FONT.medium, fontSize: 13 },
  retry: { color: T.ACCENT, fontFamily: T.FONT.semibold, fontSize: 13 },
  controls: { position: 'absolute', left: 12, right: 12, bottom: 10, zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },
  playButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center' },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: T.ACCENT },
  time: { color: '#fff', fontFamily: T.FONT.medium, fontSize: 10, minWidth: 66 },
  expand: { padding: 6 },
  skip: { padding: 6 },
  fullscreen: { flex: 1, backgroundColor: '#000' },
  closeFullscreen: { position: 'absolute', top: 48, right: 18, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)' },
  closeText: { color: '#fff', fontFamily: T.FONT.semibold, fontSize: 12 },
});