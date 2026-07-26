/**
 * MeetSweet design tokens — dark rose.
 * Deep night backgrounds, warm rose accent, Poppins type.
 */
export const T = {
  // Backgrounds
  BG:        '#120B10',
  SURFACE:   '#1E1218',
  SURFACE_2: '#261620',

  // Borders (used sparingly — prefer depth/shadow over lines)
  BORDER:   'rgba(255,255,255,0.028)',
  BORDER_2: 'rgba(255,255,255,0.058)',

  // Text
  TEXT:   '#FFFFFF',
  TEXT_2: 'rgba(255,255,255,0.55)',
  TEXT_3: 'rgba(255,255,255,0.28)',

  // Accent — warm rose (primary interactive colour)
  ACCENT:       '#C45A72',
  ACCENT_LIGHT: 'rgba(196,90,114,0.16)',
  ACCENT_DARK:  '#A34860',

  // Status
  SUCCESS: '#4CAF82',
  ERROR:   '#EF4444',

  // Aliases
  DANGER: '#EF4444',
  PURPLE: '#9B6ECA',
  ROSE:   '#C45A72',

  // Ambient glow colours — rose sits quietly behind the app
  AMBIENT: 'rgba(196,90,114,0.11)',
  SHADOW: 'rgba(0,0,0,0.36)',

  // Typography (Poppins loaded in root layout)
  FONT: {
    regular:  'Poppins_400Regular'  as const,
    medium:   'Poppins_500Medium'   as const,
    semibold: 'Poppins_600SemiBold' as const,
    bold:     'Poppins_700Bold'     as const,
  },

  // Border radius scale
  RADIUS: {
    xs:   4,
    sm:   8,
    md:   12,
    lg:   16,
    xl:   20,
    full: 999,
    pill: 50,
  },
} as const;

/**
 * The application's background gradient — warm rose, premium, subtle.
 * Used on every screen as the backdrop. NOT an accent colour.
 */
export const RoseGradient = {
  // Very top → warm dark rose → near-black
  colors:    ['#23101A', '#170C13', '#0D0A0C'] as const,
  locations: [0, 0.45, 1] as const,
};

/** Gradient colour stops used by premium / locked-content components. */
export const AppGradients = {
  premium:    ['#C45A72', '#A34860'] as const,
  rose:       ['rgba(196,90,114,0.18)', '#C45A72'] as const,
  rosePurple: ['#C45A72', '#9B6ECA'] as const,
} as const;
