/**
 * Runtime-resolved design tokens.
 *
 * The canonical palette lives in constants/theme.ts (dark + light semantic
 * tokens). This module re-exports them under the legacy `colors` shape used
 * by hooks/useColors — the application is dark-first, so `colors.light`
 * carries the light palette and `colors.dark` the dark palette.
 */
import { light, dark } from '@/constants/theme';

const colors = {
  light: { ...light, radius: 16 },
  dark: { ...dark, radius: 16 },
  radius: 16,
};

export default colors;
