/**
 * MeetSweet design tokens — ash shadow grey.
 * Deep neutral-grey backgrounds, warm rose accent, Poppins type.
 */
export const T = {
  // Backgrounds — ash shadow grey (neutral dark, no rose tint)
  BG:        '#0C0C0F',
  SURFACE:   '#161619',
  SURFACE_2: '#1E1E24',

  // Borders (used sparingly — prefer depth/shadow over lines)
  BORDER:   'rgba(255,255,255,0.028)',
  BORDER_2: 'rgba(255,255,255,0.058)',

  // Text
  TEXT:   '#FFFFFF',
  TEXT_2: 'rgba(255,255,255,0.55)',
  TEXT_3: 'rgba(255,255,255,0.28)',

  // Accent — warm rose (primary interactive colour, kept as accent only)
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

  // Ambient glow — subtle neutral grey, replaces rose glow
  AMBIENT: 'rgba(180,185,210,0.06)',
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
  // Shadow presets — use elevation+shadow* together for cross-platform depth
  SHADOWS: {
    /** Level 1 — subtle: inputs, small buttons */
    soft: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.10,
      shadowRadius: 8,
      elevation: 3,
    },
    /** Level 2 — medium: cards, list items, thumbnails */
    medium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    /** Level 3 — hard: modals, bottom sheets, menus */
    hard: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 12,
    },
    /** Level 4 — deep: floating buttons, fullscreen overlays */
    deep: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.35,
      shadowRadius: 24,
      elevation: 20,
    },
  },
} as const;

/**
 * Content tier display config — aligns with the backend ContentTier enum.
 * Only three tiers exist: free, subscriber, subscriber_plus.
 */
export const TIERS = {
  free: {
    label: 'Free',
    color: '#888888',
    bg:    'rgba(136,136,136,0.16)',
  },
  subscriber: {
    label: 'Subscriber',
    color: '#C45A72',
    bg:    'rgba(196,90,114,0.15)',
  },
  subscriber_plus: {
    label: 'Subscriber+',
    color: '#E8A020',
    bg:    'rgba(232,160,32,0.15)',
  },
} as const;

/**
 * The application's background gradient — ash shadow grey, premium, subtle.
 * Used on every screen as the backdrop. NOT an accent colour.
 */
export const RoseGradient = {
  // Very top → deep ash grey → near-black
  colors:    ['#131318', '#0F0F13', '#09090C'] as const,
  locations: [0, 0.45, 1] as const,
};

/** Gradient colour stops used by premium / locked-content components. */
export const AppGradients = {
  premium:    ['#C45A72', '#A34860'] as const,
  rose:       ['rgba(196,90,114,0.18)', '#C45A72'] as const,
  rosePurple: ['#C45A72', '#9B6ECA'] as const,
} as const;
