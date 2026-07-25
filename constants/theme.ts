/**
 * MeetSweet design tokens — soft rose, warm ivory, charcoal.
 * Premium minimalism. Warm, elegant, calm.
 */
export const T = {
  // Backgrounds — warm off-white / light stone
  BG: '#FAF8F6',
  SURFACE: '#F2EEE9',
  SURFACE_2: '#EAE3DA',

  // Borders — soft warm grey
  BORDER: 'rgba(60,45,35,0.09)',
  BORDER_2: 'rgba(60,45,35,0.15)',

  // Text — charcoal family
  TEXT: '#2C2420',
  TEXT_2: 'rgba(44,36,32,0.5)',
  TEXT_3: 'rgba(44,36,32,0.28)',

  // Accent — soft dusty rose (primary)
  ACCENT: '#C9847A',
  ACCENT_LIGHT: '#F0E0DC',
  ACCENT_DARK: '#A8635A',

  // Status
  SUCCESS: '#5B8F6A',
  ERROR: '#C0504A',

  // Aliases kept for component compatibility
  DANGER: '#C0504A',
  PURPLE: '#9B6ECA',
  ROSE: '#C9847A',

  // Typography (Poppins loaded in root layout)
  FONT: {
    regular: 'Poppins_400Regular' as const,
    medium: 'Poppins_500Medium' as const,
    semibold: 'Poppins_600SemiBold' as const,
    bold: 'Poppins_700Bold' as const,
  },

  // Border radius scale
  RADIUS: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    full: 999,
  },
} as const;

/** Gradient colour stops used by premium / locked-content components. */
export const AppGradients = {
  premium:    ['#C9847A', '#A8635A'] as const,
  rose:       ['#F0E0DC', '#C9847A'] as const,
  rosePurple: ['#C9847A', '#9B6ECA'] as const,
} as const;
