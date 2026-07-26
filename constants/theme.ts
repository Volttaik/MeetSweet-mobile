/**
 * MeetSweet design tokens — dark rose.
 * Deep night backgrounds, hot rose accent (#FF4473), Poppins type.
 */
export const T = {
  // Backgrounds
  BG:        '#0D0B1A',
  SURFACE:   '#1A1628',
  SURFACE_2: '#251F40',

  // Borders
  BORDER:   'rgba(255,255,255,0.06)',
  BORDER_2: '#2E2850',

  // Text
  TEXT:   '#FFFFFF',
  TEXT_2: 'rgba(255,255,255,0.55)',
  TEXT_3: 'rgba(255,255,255,0.28)',

  // Accent — hot rose (primary)
  ACCENT:       '#FF4473',
  ACCENT_LIGHT: 'rgba(255,68,115,0.15)',
  ACCENT_DARK:  '#E03362',

  // Status
  SUCCESS: '#4CAF82',
  ERROR:   '#EF4444',

  // Aliases
  DANGER: '#EF4444',
  PURPLE: '#9B6ECA',
  ROSE:   '#FF4473',

  // Typography (Poppins loaded in root layout)
  FONT: {
    regular:  'Poppins_400Regular'  as const,
    medium:   'Poppins_500Medium'   as const,
    semibold: 'Poppins_600SemiBold' as const,
    bold:     'Poppins_700Bold'     as const,
  },

  // Border radius scale
  RADIUS: {
    xs:   6,
    sm:   10,
    md:   14,
    lg:   18,
    xl:   24,
    full: 999,
  },
} as const;

/** Gradient colour stops used by premium / locked-content components. */
export const AppGradients = {
  premium:    ['#FF4473', '#E03362'] as const,
  rose:       ['rgba(255,68,115,0.15)', '#FF4473'] as const,
  rosePurple: ['#FF4473', '#9B6ECA'] as const,
} as const;
