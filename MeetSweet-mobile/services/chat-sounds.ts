import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system';

const ENABLED_KEY = '@ms_chat_sounds_enabled';
const MIN_PLAY_GAP_MS = 180;
const RECEIVE_BATCH_GAP_MS = 450;
let enabled: boolean | null = null;
let lastPlayedAt = 0;
let lastReceiveAt = 0;
let sentPlayer: AudioPlayer | null = null;
let receivedPlayer: AudioPlayer | null = null;

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63]
      + (i + 1 < bytes.length ? alphabet[(n >> 6) & 63] : '=')
      + (i + 2 < bytes.length ? alphabet[n & 63] : '=');
  }
  return out;
}

function toneBase64(frequency: number, durationMs: number): string {
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * durationMs / 1000);
  const dataSize = samples * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string) => value.split('').forEach((char, i) => bytes[offset + i] = char.charCodeAt(0));
  write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples; i += 1) {
    const attack = Math.min(1, i / (sampleRate * 0.008));
    const release = Math.min(1, (samples - i) / (sampleRate * 0.018));
    const envelope = Math.min(attack, release) * 0.16;
    const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * envelope;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  return encodeBase64(bytes);
}

async function isEnabled(): Promise<boolean> {
  if (enabled !== null) return enabled;
  const stored = await AsyncStorage.getItem(ENABLED_KEY).catch(() => null);
  enabled = stored !== '0';
  return enabled;
}

async function playerFor(kind: 'sent' | 'received'): Promise<AudioPlayer | null> {
  const existing = kind === 'sent' ? sentPlayer : receivedPlayer;
  if (existing) return existing;
  try {
    const fs = FileSystem as typeof FileSystem & { File?: any; Paths?: any };
    if (!fs.File || !fs.Paths) return null;
    const file = new fs.File(fs.Paths.cache, `meetsweet-message-${kind}.wav`);
    if (!file.exists) file.create({ intermediates: true, idempotent: true });
    file.write(toneBase64(kind === 'sent' ? 660 : 520, kind === 'sent' ? 62 : 78), { encoding: 'base64' });
    // Chat sounds mix with any other audio (voice notes, videos) — never grab
    // the audio focus. expo-audio mode keys are shared across the app.
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
    const player = createAudioPlayer({ uri: file.uri });
    player.volume = 0.12;
    if (kind === 'sent') sentPlayer = player;
    else receivedPlayer = player;
    return player;
  } catch {
    return null;
  }
}

async function play(kind: 'sent' | 'received'): Promise<void> {
  if (!(await isEnabled())) return;
  const now = Date.now();
  if (now - lastPlayedAt < MIN_PLAY_GAP_MS) return;
  if (kind === 'received' && now - lastReceiveAt < RECEIVE_BATCH_GAP_MS) return;
  lastPlayedAt = now;
  if (kind === 'received') lastReceiveAt = now;
  const player = await playerFor(kind);
  if (!player) return;
  try {
    await player.seekTo(0);
    player.play();
  } catch {
    // Sound is non-critical and must never affect message state.
  }
}

export function playMessageSent(): void { void play('sent'); }
export function playMessageReceived(): void { void play('received'); }

export async function setChatSoundsEnabled(value: boolean): Promise<void> {
  enabled = value;
  await AsyncStorage.setItem(ENABLED_KEY, value ? '1' : '0');
}

export async function unloadChatSounds(): Promise<void> {
  sentPlayer?.remove();
  receivedPlayer?.remove();
  sentPlayer = null;
  receivedPlayer = null;
}
