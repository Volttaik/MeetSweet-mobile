/**
 * MeetSweet design tokens — dark rose.
 * Deep night backgrounds, warm rose accent, Poppins type.
 */
export const T = {
  // Backgrounds
  BG:        '#120B10',
  SURFACE:   '#21151D',
  SURFACE_2: '#2B1A25',

  // Borders
  BORDER:   'rgba(255,255,255,0.035)',
  BORDER_2: 'rgba(255,255,255,0.07)',

  // Text
  TEXT:   '#FFFFFF',
  TEXT_2: 'rgba(255,255,255,0.55)',
  TEXT_3: 'rgba(255,255,255,0.28)',

  // Accent — hot rose (primary)
  ACCENT:       '#D96A82',
  ACCENT_LIGHT: 'rgba(217,106,130,0.16)',
  ACCENT_DARK:  '#B9536B',

  // Status
  SUCCESS: '#4CAF82',
  ERROR:   '#EF4444',

  // Aliases
  DANGER: '#EF4444',
  PURPLE: '#9B6ECA',
  ROSE:   '#D96A82',

  // Ambient glow colours. Keep the rose in the background, not on every card.
  AMBIENT: 'rgba(217,106,130,0.13)',
  SHADOW: 'rgba(0,0,0,0.28)',

  // Typography (Poppins loaded in root layout)
  FONT: {
    regular:  'Poppins_400Regular'  as const,
    medium:   'Poppins_500Medium'   as const,
    semibold: 'Poppins_600SemiBold' as const,
    bold:     'Poppins_700Bold'     as const,
  },

  // Border radius scale — use RADIUS.pill for interactive elements (buttons, chips, search bars)
  RADIUS: {
    xs:   4,
    sm:   8,
    md:   12,
    lg:   16,
    xl:   20,
    full: 999,
    // Pill shape — the primary interactive radius for buttons, chips, search bars
    pill: 50,
  },
} as const;

/** Gradient colour stops used by premium / locked-content components. */
export const AppGradients = {
  premium:    ['#D96A82', '#B9536B'] as const,
  rose:       ['rgba(217,106,130,0.18)', '#D96A82'] as const,
  rosePurple: ['#D96A82', '#9B6ECA'] as const,
} as const;
