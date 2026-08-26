/**
 * ChatBackground — MeetSweet's private-message wallpaper.
 *
 * The bundled chat-wallpaper asset (assets/images/chat-wallpaper.png) is the
 * primary visual surface of the conversation: a dark, brand-themed wallpaper
 * rendered in COVER mode across the entire viewport, exactly like a messaging
 * app's chat background. It is intentionally a single continuous surface — no
 * borders, no boxes — so the message list, media cards, empty/loading states
 * and the floating composer all sit directly on it.
 *
 * A soft top fade (black → transparent) sits behind the header and status bar
 * so the name/avatar row and system clock always read cleanly over the
 * brighter regions of the wallpaper, without ever dimming the conversation
 * below.
 *
 * Purely decorative: pointerEvents="none", drawn once, fully static.
 */
import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function ChatBackground() {
  return (
    <View
      style={styles.fill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <ImageBackground
        source={require('@/assets/images/chat-wallpaper.png')}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      >
        {/* Soft top fade — keeps the header + status bar legible over the
            wallpaper's warm glow; fades out well above the first message. */}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
          locations={[0, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.topFade}
          pointerEvents="none"
        />
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
});
