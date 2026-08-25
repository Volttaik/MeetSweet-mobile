/**
 * SoundService — the app's single, centralized UI-sound layer.
 *
 * Rules that keep the sound language subtle and intentional:
 *   • Sounds are preloaded once at app start and replayed from position 0 —
 *     playback is instant and never blocks rendering (messages render first;
 *     sound is supplemental).
 *   • Every play can be keyed by a stable id (message id / client id). A key
 *     that was already played is skipped, so WebSocket replays, reconciliations
 *     and duplicate events can never re-trigger a sound for the same message.
 *   • A persisted "sound effects" preference (default on) gates all playback.
 *     We never bypass it.
 *   • iOS respects the device silent switch (playsInSilentModeIOS: false).
 *
 * Sounds live in assets/sounds — see README.md there for source + license.
 */
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUNDS_ENABLED_KEY = 'ms_sounds_enabled_v1';
/** Keep the dedup window bounded — old ids age out so a busy chat never
 *  silently grows an unbounded set. */
const PLAYED_CAP = 400;

type SoundName = 'success';

const SOUND_SOURCES: Record<SoundName, number> = {
  success: require('@/assets/sounds/success.mp3'),
};

class SoundService {
  private sounds = new Map<SoundName, Audio.Sound>();
  private enabled = true;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private playedIds = new Set<string>();

  constructor() {
    // Load the persisted preference (default: enabled). Never blocks.
    AsyncStorage.getItem(SOUNDS_ENABLED_KEY)
      .then((value) => { this.enabled = value !== 'false'; })
      .catch(() => {});
  }

  /** Preload all UI sounds. Idle + non-blocking; safe to call once at start. */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        // Respect the iOS silent switch; duck over other audio on Android.
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        await Promise.all(
          (Object.keys(SOUND_SOURCES) as SoundName[]).map(async (name) => {
            const { sound } = await Audio.Sound.createAsync(SOUND_SOURCES[name], { shouldPlay: false });
            this.sounds.set(name, sound);
          }),
        );
        this.ready = true;
      } catch {
        this.ready = false;
      }
    })();
    return this.initPromise;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    await AsyncStorage.setItem(SOUNDS_ENABLED_KEY, String(enabled)).catch(() => {});
  }

  /** Outgoing message confirmation. `key` = client message id (one play per send). */
  playMessageSent(key?: string): void {
    void this.play('success', key);
  }

  /** Incoming message. `key` = client message id ?? server message id, so a
   *  provisional + persisted copy of the SAME message can never play twice. */
  playMessageReceived(key?: string): void {
    void this.play('success', key);
  }

  /** Occasional confirmation for an important completed action. */
  playSuccess(key?: string): void {
    void this.play('success', key);
  }

  private async play(name: SoundName, key?: string): Promise<void> {
    if (!this.enabled || !this.ready) return;
    if (key) {
      if (this.playedIds.has(key)) return;
      this.playedIds.add(key);
      if (this.playedIds.size > PLAYED_CAP) {
        const oldest = this.playedIds.values().next().value;
        if (oldest) this.playedIds.delete(oldest);
      }
    }
    const sound = this.sounds.get(name);
    if (!sound) return;
    try {
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch {
      // Playback is supplemental — never let it throw into the caller.
    }
  }
}

/** Singleton — exactly one sound layer per app session. */
export const soundService = new SoundService();
