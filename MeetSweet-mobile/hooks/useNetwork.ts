/**
 * useNetwork — connectivity state hook.
 *
 * Tracks a single shared source of truth across the app with four states:
 *   online       — reachable, normal latency
 *   slow         — reachable but degraded (high probe latency)
 *   reconnecting — healthy probe received after a sustained outage
 *   offline      — genuinely disconnected for ~10 minutes (not a momentary blip)
 *
 * Behaviour rules (grounded in real probe results, not arbitrary timers):
 *   • A single failed probe/request is tolerated — it does NOT flip to offline.
 *   • "offline" only appears after ~10 minutes of continuous failure.
 *   • "slow" requires TWO consecutive high-latency probes — one slow sample
 *     alone is treated as a blip, so the banner doesn't flicker.
 *   • High-latency-but-successful probes report "slow" only once sustained.
 *   • Returning from offline passes through a brief "reconnecting" state.
 *
 * Usage:
 *   const { isOnline, isSlow, isOffline, isReconnecting, status } = useNetwork();
 *   reportNetworkError();    // call from API error handlers (network-level)
 *   reportNetworkSuccess();  // call after a successful API call
 *
 * Works without @react-native-community/netinfo using lightweight probes.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

export type NetworkStatus = 'online' | 'slow' | 'reconnecting' | 'offline';

export interface NetworkState {
  /** Reachable (online, slow, or reconnecting). False only when offline. */
  isOnline: boolean;
  isSlow: boolean;
  isOffline: boolean;
  isReconnecting: boolean;
  status: NetworkStatus;
}

type Listener = (s: NetworkState) => void;

// ─── Thresholds ──────────────────────────────────────────────────────────────

/** Probe latency at/above this is treated as "slow internet". */
const SLOW_LATENCY_MS = 2500;
/**
 * Consecutive slow probes required before reporting "slow". With 30s probe
 * intervals, this requires approximately 5 minutes of sustained high latency
 * before the "Slow connection" banner appears.
 */
const SLOW_STREAK_REQUIRED = 10;
/**
 * Sustained failure window before the app reports "offline" (~10 minutes).
 * A brief interruption is tolerated; only a prolonged outage triggers the
 * offline state.
 */
const OFFLINE_GRACE_MS = 600_000;

const PROBE_INTERVALS: Record<NetworkStatus, number> = {
  online: 30_000,
  slow: 15_000,
  reconnecting: 4_000,
  offline: 5_000,
};

// ─── Singleton state (one source of truth for every consumer) ────────────────

let _status: NetworkStatus = 'online';
let _lastFailureAt = 0; // epoch ms of the first consecutive failure (0 = healthy)
let _slowStreak = 0;    // consecutive slow probes (0 = last probe was fast)

const _listeners = new Set<Listener>();

function currentState(): NetworkState {
  return {
    isOnline: _status !== 'offline',
    isSlow: _status === 'slow',
    isOffline: _status === 'offline',
    isReconnecting: _status === 'reconnecting',
    status: _status,
  };
}

function emit() {
  const s = currentState();
  _listeners.forEach((fn) => fn(s));
}

/** Feed one probe/request result into the shared state machine. */
function applyProbeResult(online: boolean, latencyMs = 0) {
  const now = Date.now();
  if (online) {
    _lastFailureAt = 0;
    if (latencyMs >= SLOW_LATENCY_MS) {
      // Only report "slow" after the quality has genuinely degraded — a single
      // slow sample is a blip, not a state change.
      _slowStreak += 1;
      if (_slowStreak >= SLOW_STREAK_REQUIRED && _status !== 'offline') {
        _status = 'slow';
      }
    } else {
      _slowStreak = 0;
      if (_status === 'offline') {
        // First healthy probe after an outage → transitional state.
        _status = 'reconnecting';
      } else if (_status === 'reconnecting' || _status === 'slow') {
        _status = 'online';
      }
    }
  } else if (now - (_lastFailureAt || now) >= OFFLINE_GRACE_MS) {
    // A momentary interruption is tolerated; only a sustained outage flips us
    // to offline (~2 minutes of continuous failure).
    _status = 'offline';
  } else if (_lastFailureAt === 0) {
    _lastFailureAt = now;
  }
  emit();
}

/**
 * Subscribe to the shared connectivity state (non-React consumers, e.g. the
 * SweetSocket transport). The listener receives the current state immediately.
 */
export function subscribeNetwork(listener: Listener): () => void {
  _listeners.add(listener);
  listener(currentState());
  return () => _listeners.delete(listener);
}

/** Call after a successful API response to mark the network as available. */
export function reportNetworkSuccess() {
  applyProbeResult(true, 0);
}

/** Call when a network-level error occurs (e.g. "Network request failed"). */
export function reportNetworkError() {
  applyProbeResult(false, 0);
}

// ─── Probe ────────────────────────────────────────────────────────────────────

async function probeConnectivity(): Promise<{ online: boolean; latency: number }> {
  if (Platform.OS === 'web') return { online: true, latency: 0 }; // browser handles this
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    await fetch('https://meetsweet.space/api/health', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    return { online: true, latency: Date.now() - started };
  } catch {
    // Fall back to a more reliable, purpose-agnostic probe.
    try {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 4000);
      await fetch('https://1.1.1.1', {
        method: 'HEAD',
        signal: controller2.signal,
        mode: 'no-cors',
        cache: 'no-store',
      });
      clearTimeout(timeout2);
      return { online: true, latency: Date.now() - started };
    } catch {
      return { online: false, latency: 0 };
    }
  }
}

// ─── Probe manager ────────────────────────────────────────────────────────────

let _probeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProbe() {
  if (_probeTimer) clearTimeout(_probeTimer);
  const delay = PROBE_INTERVALS[_status];
  _probeTimer = setTimeout(async () => {
    const { online, latency } = await probeConnectivity();
    applyProbeResult(online, latency);
    scheduleProbe();
  }, delay);
}

// Start probing when the module loads.
if (Platform.OS !== 'web') {
  probeConnectivity().then(({ online, latency }) => {
    applyProbeResult(online, latency);
    scheduleProbe();
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNetwork(): NetworkState {
  const [state, setState] = useState<NetworkState>(currentState());

  useEffect(() => {
    const handler: Listener = (s) => setState(s);
    _listeners.add(handler);

    // Re-probe immediately when the app returns to the foreground.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        probeConnectivity().then(({ online, latency }) => {
          applyProbeResult(online, latency);
          scheduleProbe();
        });
      }
    });

    return () => {
      _listeners.delete(handler);
      sub.remove();
    };
  }, []);

  return state;
}
