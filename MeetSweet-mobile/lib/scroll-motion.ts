import { makeMutable } from 'react-native-reanimated';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Shared scroll-velocity signal for the reactive card fades.
 *
 * ScrollViews / FlatLists report their scroll velocity here (via the
 * `useScrollMotion()` handlers); `GradientBorder` reads the signal on the UI
 * thread and drifts its ambient fade a few pixels with the scroll direction,
 * so the fade feels subtly alive while the user is moving through the
 * interface. When scrolling stops the velocity settles to zero and the fade
 * springs back to rest.
 *
 * Extremely restrained by design: no pulsing, no flashing, no continuous
 * animation — only a gentle shift while actively scrolling.
 */
export const scrollVelocity = makeMutable({ x: 0, y: 0 });

let lastOffsetX = 0;
let lastOffsetY = 0;
let lastTs = 0;

/**
 * Plain JS scroll handler — spread onto any ScrollView / FlatList as
 * `onScroll`. iOS reports `velocity` natively; Android does not, so we fall
 * back to estimating it from the content-offset delta between events.
 */
export function reportScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
  const { contentOffset, velocity } = e.nativeEvent;
  let vx = velocity?.x ?? 0;
  let vy = velocity?.y ?? 0;
  if (vx === 0 && vy === 0) {
    const now = Date.now();
    const dt = Math.max(now - lastTs, 16);
    vx = ((contentOffset.x - lastOffsetX) / dt) * 1000;
    vy = ((contentOffset.y - lastOffsetY) / dt) * 1000;
    lastOffsetX = contentOffset.x;
    lastOffsetY = contentOffset.y;
    lastTs = now;
  }
  scrollVelocity.value = { x: vx, y: vy };
}

/** Zero the signal when scrolling ends so the fade settles back to rest. */
export function settleScroll() {
  scrollVelocity.value = { x: 0, y: 0 };
}

/**
 * Hook returning the props to spread onto a ScrollView / FlatList:
 *   <FlatList {...useScrollMotion()} ... />
 */
export function useScrollMotion() {
  return {
    onScroll: reportScroll,
    onScrollEndDrag: settleScroll,
    onMomentumScrollEnd: settleScroll,
    scrollEventThrottle: 16,
  };
}
