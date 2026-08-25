/**
 * MeetSweet design tokens — the six-colour brand palette.
 *
 * Reference palette (all six colours are mixed throughout the product):
 *   LINEN   #FCF1EA  → warm light background / warm white text on dark
 *   TAN     #F7AB8D  → warm mid-tone (tints, chips, glows)
 *   CORAL   #FB8850  → warm accent — premium, money, attention, highlights
 *   CRIMSON #DA2475  → secondary — likes, hearts, social, unread, creator
 *   PURPLE  #AD078E  → primary — CTAs, active states, brand identity
 *   BLACK   #16063A  → deep purple-black foundation / dark text on light
 *
 * Colour relationship:
 *   PURPLE  → primary actions, active navigation, brand elements
 *   CRIMSON → social interaction (likes, hearts), unread indicators, badges
 *   CORAL   → premium moments, purchase/locked content, money CTAs, highlights
 *   TAN     → warm chips, tinted icon containers, soft accents
 *   LINEN   → light-mode background, warm text on dark surfaces
 *   #16063A → dark-mode background, primary text on light surfaces
 *
 * Fill rules (verified WCAG contrast):
 *   purple fills  → linen text (5.9:1)   crimson fills → linen text (4.2:1)
 *   coral fills   → deep-purple-black text (7.8:1)
 *   tan fills     → deep-purple-black text (10:1)
 *
 * The application is dark-first (Uniwind + app.json force dark), so `T` below
 * IS the dark palette and remains the static token consumed everywhere. A full
 * light palette with the same semantic keys ships alongside it (`LightT`) and
 * is served to consumers that resolve the active scheme at runtime
 * (hooks/useColors, colors.ts).
 */

export interface Palette {
  // ── Brand ─────────────────────────────────────────────────────────────────
  PRIMARY: string;        // purple — the brand primary
  PRIMARY_LIGHT: string;  // lighter purple — tints, glows, bright accents
  PRIMARY_DARK: string;   // deeper purple — pressed states
  SECONDARY: string;      // crimson — social/interaction (likes, active states)
  SECONDARY_LIGHT: string;
  SECONDARY_DARK: string;
  ORANGE: string;         // coral — warm accent emphasis
  ON_AMBER: string;       // text/icon colour ON coral/tan fills → deep purple-black
  // ── Surfaces ───────────────────────────────────────────────────────────────
  BG: string;             // app background (deep purple-black in dark, linen in light)
  SURFACE: string;        // cards / sheets / inputs
  SURFACE_2: string;      // nested / secondary surfaces
  SURFACE_3: string;      // hover / selected / raised
  // ── Borders ────────────────────────────────────────────────────────────────
  BORDER: string;
  BORDER_2: string;
  // ── Text ───────────────────────────────────────────────────────────────────
  TEXT: string;           // primary (linen on dark / deep purple-black on light)
  TEXT_2: string;         // secondary (soft lavender/grey)
  TEXT_3: string;         // muted / hints / dates
  // ── Interactive accent (purple — the workhorse key: buttons, active states) ─
  ACCENT: string;
  ACCENT_LIGHT: string;   // purple tinted chip / icon container bg
  ACCENT_DARK: string;    // pressed state
  ACCENT_FG: string;      // linen — text/icon on purple & crimson fills
  // ── Warm accent family (coral + tan) ───────────────────────────────────────
  PEACH: string;          // tan — warm mid-tone
  CORAL: string;          // coral — premium / attention
  GOLD: string;           // premium / subscriber+ (coral)
  PURPLE: string;         // light purple accents
  // ── Status (usability only — never brand) ─────────────────────────────────
  SUCCESS: string;
  WARNING: string;
  ERROR: string;
  INFO: string;
  // ── Creator economy ────────────────────────────────────────────────────────
  PREMIUM: string;        // coral — premium language
  CREATOR: string;        // crimson — creator identity
  SUBSCRIPTION: string;   // purple — subscriber tier language
  // ── Private inbox identity ─────────────────────────────────────────────────
  INBOX: string;          // crimson — inbox accent / unread indicators
  INBOX_LIGHT: string;
  // ── Ambient / shadows ──────────────────────────────────────────────────────
  AMBIENT: string;        // top coral-tinted glow wash
  SHADOW: string;
}

export const dark: Palette = {
  // ── Brand ────────────────────────────────────────────────────────────────
  PRIMARY:         '#AD078E',
  PRIMARY_LIGHT:   '#E051C9',
  PRIMARY_DARK:    '#7A0363',
  SECONDARY:       '#DA2475',
  SECONDARY_LIGHT: '#F04A93',
  SECONDARY_DARK:  '#B01B5E',
  ORANGE:          '#FB8850',
  ON_AMBER:        '#16063A',

  // Surfaces — pure black foundation, deep plum layers for hierarchy
  BG:        '#000000',
  SURFACE:   '#0D041F',
  SURFACE_2: '#140A2E',
  SURFACE_3: '#1B0F3D',

  BORDER:   'rgba(252,241,234,0.10)',
  BORDER_2: 'rgba(252,241,234,0.20)',

  // Text — warm linen primary, soft lavender below
  TEXT:   '#FCF1EA',
  TEXT_2: '#C9B7D8',
  TEXT_3: '#9A85B0',

  // Brand accent — every coloured element is the mesh gradient; text is
  // pure white, heavy weight, per the brand rule.
  ACCENT:       '#AD078E',
  ACCENT_LIGHT: 'rgba(173,7,142,0.16)',
  ACCENT_DARK:  '#7A0363',
  ACCENT_FG:    '#FFFFFF',

  // Warm accent family — coral & tan (dark text on these fills, ≥ 7.8:1)
  PEACH:  '#F7AB8D',
  CORAL:  '#FB8850',
  GOLD:   '#FB8850',
  PURPLE: '#E051C9',

  // Status — restrained, usability-only
  SUCCESS: '#2FB56B',
  WARNING: '#FB8850',
  ERROR:   '#FF453A',
  INFO:    '#C9B7D8',

  // Creator economy — purple subscription, coral premium, crimson creator
  PREMIUM:      '#FB8850',
  CREATOR:      '#DA2475',
  SUBSCRIPTION: '#AD078E',

  // Private inbox — crimson identity
  INBOX:       '#DA2475',
  INBOX_LIGHT: 'rgba(218,36,117,0.14)',

  // Ambient — none. Pure black backdrop, no glow, no wash.
  AMBIENT: 'rgba(0,0,0,0)',
  SHADOW:  'rgba(0,0,0,0.80)',
};

export const light: Palette = {
  // ── Brand ────────────────────────────────────────────────────────────────
  PRIMARY:         '#AD078E',
  PRIMARY_LIGHT:   '#8A076F',
  PRIMARY_DARK:    '#7A0363',
  SECONDARY:       '#DA2475',
  SECONDARY_LIGHT: '#F04A93',
  SECONDARY_DARK:  '#B01B5E',
  ORANGE:          '#B84E1D',
  ON_AMBER:        '#16063A',

  // Surfaces — warm linen foundation, clean white cards
  BG:        '#FCF1EA',
  SURFACE:   '#FFFFFF',
  SURFACE_2: '#F6EBDF',
  SURFACE_3: '#EFDECB',

  BORDER:   'rgba(22,6,58,0.10)',
  BORDER_2: 'rgba(22,6,58,0.18)',

  // Text — deep purple-black primary, muted purple-greys below
  TEXT:   '#16063A',
  TEXT_2: '#5C4864',
  TEXT_3: '#7A6886',

  // Brand accent — every coloured element is the mesh gradient; text is
  // pure white, heavy weight, per the brand rule.
  ACCENT:       '#AD078E',
  ACCENT_LIGHT: 'rgba(173,7,142,0.12)',
  ACCENT_DARK:  '#7A0363',
  ACCENT_FG:    '#FFFFFF',

  // Warm accent family — deeper coral/tan for text on linen (≥ 4.5:1)
  PEACH:  '#C0562C',
  CORAL:  '#B84E1D',
  GOLD:   '#B84E1D',
  PURPLE: '#8A076F',

  // Status — restrained, usability-only
  SUCCESS: '#128A4B',
  WARNING: '#B84E1D',
  ERROR:   '#D70015',
  INFO:    '#7A6886',

  // Creator economy
  PREMIUM:      '#B84E1D',
  CREATOR:      '#B01B5E',
  SUBSCRIPTION: '#8A076F',

  // Private inbox — crimson identity
  INBOX:       '#B01B5E',
  INBOX_LIGHT: 'rgba(176,27,94,0.12)',

  // Ambient — faint coral wash
  AMBIENT: 'rgba(251,136,80,0.07)',
  SHADOW:  'rgba(22,6,58,0.16)',
};

/**
 * Static token set consumed across the app. The product is dark-first, so `T`
 * is the dark palette. All existing keys (FONT, RADIUS, SHADOWS, …) and the
 * legacy aliases below are preserved so no caller needs to change. The
 * lowercase names (primary / secondary / accent / background / surface / …)
 * mirror the requested semantic hierarchy for new code.
 */
export const T = {
  ...dark,

  // ── Semantic hierarchy aliases (canonical names) ─────────────────────────
  black:           '#16063A',
  white:           '#FCF1EA',
  amber:           dark.PRIMARY,
  primary:         dark.PRIMARY,
  primaryLight:    dark.PRIMARY_LIGHT,
  primaryDark:     dark.PRIMARY_DARK,
  secondary:       dark.SECONDARY,
  secondaryLight:  dark.SECONDARY_LIGHT,
  secondaryDark:   dark.SECONDARY_DARK,
  accent:          dark.ACCENT,
  onAmber:         dark.ON_AMBER,
  orange:          dark.ORANGE,
  background:      dark.BG,
  surface:         dark.SURFACE,
  surfaceElevated: dark.SURFACE_3,
  card:            dark.SURFACE,
  textPrimary:     dark.TEXT,
  textSecondary:   dark.TEXT_2,
  textMuted:       dark.TEXT_3,
  border:          dark.BORDER,
  divider:         dark.BORDER,
  success:         dark.SUCCESS,
  warning:         dark.WARNING,
  error:           dark.ERROR,
  overlay:         'rgba(0,0,0,0.72)',

  // ── Legacy aliases (kept for backward compatibility) ────────────────────
  DANGER: dark.ERROR,
  ROSE:   dark.ACCENT,
  SUCCESS: dark.SUCCESS,
  ERROR:   dark.ERROR,

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
    soft:   { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 },  shadowOpacity: 0.35, shadowRadius: 8,  elevation: 3 },
    medium: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 },  shadowOpacity: 0.45, shadowRadius: 12, elevation: 6 },
    hard:   { shadowColor: '#000000', shadowOffset: { width: 0, height: 8 },  shadowOpacity: 0.55, shadowRadius: 16, elevation: 12 },
    deep:   { shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.65, shadowRadius: 24, elevation: 20 },
  },
} as const;

/**
 * Album cover fallback tones — deep plum-black so media placeholders stay
 * inside the black-purple family without any grey/charcoal.
 */
export const ALBUM_TONES: Record<string, string> = {
  violet:  '#0D041F',
  rose:    '#100625',
  amber:   '#140A2E',
  teal:    '#0C031C',
  indigo:  '#0E0422',
  emerald: '#0B0218',
  sky:     '#0C031D',
  fuchsia: '#110727',
};

/**
 * Derive an rgba tint string from a hex token. Screens use this instead of
 * hand-typed rgba values so every tinted chip/border stays tied to the
 * canonical palette — change a token once and all its tints follow.
 * Accepts 3- and 6-digit hex (e.g. alpha(T.ACCENT, 0.12)).
 */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h.slice(0, 6).padEnd(6, '0');
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Content tier display config — aligns with the backend ContentTier enum.
 * Only three tiers exist: free, subscriber, subscriber_plus.
 */
export const TIERS = {
  free: {
    label: 'Free',
    color: T.TEXT_3,
    bg:    alpha(T.TEXT_3, 0.16),
  },
  subscriber: {
    label: 'Subscriber',
    color: T.SUBSCRIPTION,
    bg:    T.ACCENT_LIGHT,
  },
  subscriber_plus: {
    label: 'Subscriber+',
    color: T.GOLD,
    bg:    alpha(T.GOLD, 0.16),
  },
} as const;

/**
 * The application's background gradient — pure black foundation. Used on
 * every screen as the backdrop (auth, onboarding, hero cards).
 */
export const RoseGradient = {
  colors:    ['#000000', '#000000', '#000000'] as const,
  locations: [0, 0.45, 1] as const,
};

/**
 * The MeetSweet brand gradient — a continuous smooth mesh blend:
 *   AMBER/ORANGE  #FF8C00  → top right
 *   HOT MAGENTA   #FF1493  → top left & left side
 *   DEEP VIOLET   #800080  → bottom & bottom right
 * Every coloured UI element (buttons, badges, chips, premium fills, icons)
 * uses this gradient so nothing is ever a flat single-colour fill. The
 * diagonal runs top-left (magenta) → centre (amber) → bottom-right (violet)
 * to approximate the mesh flow across a surface.
 */
export const BrandGradient = {
  colors:    ['#FF1493', '#FF8C00', '#800080'] as const,
  locations: [0, 0.45, 1] as const,
};

/** Brand gradient stops used by premium / locked-content components. */
export const AppGradients = {
  premium:    ['#FF1493', '#B521C4', '#800080'] as const,
  brand:      ['#FF8C00', '#FF1493', '#B521C4', '#8E0E9E', '#800080'] as const,
  brandLocs:  [0, 0.2, 0.45, 0.72, 1] as const,
  brandStart: { x: 1, y: 0 } as const,   // amber → top-right
  brandEnd:   { x: 0, y: 1 } as const,   // deep violet → bottom-left / bottom-right
  rosePurple: ['#FF1493', '#B521C4', '#800080'] as const,
  inbox:      ['#FF1493', '#B521C4', '#800080'] as const,
} as const;

/** Overlay colour for video/Short bottom gradient — deep plum fade. */
export const SCRIM = 'rgba(0,0,0,0.75)' as const;

/** Pure black used for media backgrounds and fullscreen overlays. */
export const MEDIA_BG = '#000000' as const;
