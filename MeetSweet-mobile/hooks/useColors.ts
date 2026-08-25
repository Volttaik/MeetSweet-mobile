import { useColorScheme } from 'react-native';
import { dark, light } from '@/constants/theme';

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all semantic colour tokens for the active
 * palette (dark is the MeetSweet default) plus scheme-independent values like
 * `radius`. Both palettes expose identical keys, so components consume
 * semantic roles — never raw colour values.
 */
export function useColors() {
  const scheme = useColorScheme();
  return scheme === 'dark' ? { ...dark, radius: 16 } : { ...light, radius: 16 };
}
