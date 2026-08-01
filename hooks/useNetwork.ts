/**
 * useNetwork — lightweight network connectivity hook.
 *
 * Works without @react-native-community/netinfo by using periodic
 * lightweight fetch probes and tracking API error patterns.
 *
 * Usage:
 *   const { isOnline } = useNetwork();
 *   reportNetworkError();   // call from API error handlers
 *   reportNetworkSuccess(); // call after a successful API call
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

// ─── Singleton state so all hooks share one source of truth ──────────────────

type Listener = (online: boolean) => void;
let _isOnline = true;
const _listeners = new Set<Listener>();

function setOnlineState(online: boolean) {
  if (online === _isOnline) return;
  _isOnline = online;
  _listeners.forEach((fn) => fn(online));
}

/** Call after a successful API response to mark network as available. */
export function reportNetworkSuccess() {
  setOnlineState(true);
}

/** Call when a network-level error occurs (TypeError: Network request failed). */
export function reportNetworkError() {
  setOnlineState(false);
}

// ─── Probe URL — small static endpoint ───────────────────────────────────────

const PROBE_INTERVAL_ONLINE  = 30_000; // 30 s when online
const PROBE_INTERVAL_OFFLINE =  5_000; //  5 s when offline (faster recovery)

async function probeConnectivity(): Promise<boolean> {
  if (Platform.OS === 'web') return true; // browser handles this
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    await fetch('https://meetsweet-server.quizmi.space/api/health', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    return true;
  } catch {
    // Try a more reliable probe as fallback
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
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Probe manager ────────────────────────────────────────────────────────────

let _probeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProbe() {
  if (_probeTimer) clearTimeout(_probeTimer);
  const delay = _isOnline ? PROBE_INTERVAL_ONLINE : PROBE_INTERVAL_OFFLINE;
  _probeTimer = setTimeout(async () => {
    const online = await probeConnectivity();
    setOnlineState(online);
    scheduleProbe();
  }, delay);
}

// Start probing immediately when module loads
if (Platform.OS !== 'web') {
  probeConnectivity().then((online) => {
    setOnlineState(online);
    scheduleProbe();
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNetwork(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(_isOnline);
  const savedHandler = useRef<Listener | undefined>(undefined);

  useEffect(() => {
    const handler: Listener = (online) => setIsOnline(online);
    savedHandler.current = handler;
    _listeners.add(handler);

    // Re-probe when app comes to foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        probeConnectivity().then((online) => {
          setOnlineState(online);
          scheduleProbe();
        });
      }
    });

    return () => {
      _listeners.delete(handler);
      sub.remove();
    };
  }, []);

  return { isOnline };
}
