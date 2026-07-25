/**
 * MeetSweet Design System
 * Visual identity: Premium · Private · Romantic · Elegant · Modern · Native
 */

// ─── Colour Palette ──────────────────────────────────────────────────────────
export const AppColors = {
  // Backgrounds
  bg:        '#0E0B12',   // deep charcoal
  bg2:       '#13101A',   // slightly elevated
  surface:   '#1A1524',   // cards / surface
  surface2:  '#211C2E',   // elevated surface
  surface3:  '#2A2440',   // hover / pressed

  // Accents
  rose:      '#E8447A',   // primary rose pink
  roseDark:  '#C03160',   // pressed rose
  roseLight: '#F06A93',   // highlight rose
  purple:    '#9B6ECA',   // secondary soft purple
  purpleLight:'#B893E0',  // highlight purple
  roseGold:  '#C9956C',   // premium accent

  // Borders
  border:    'rgba(255,255,255,0.06)',
  border2:   'rgba(255,255,255,0.11)',
  borderFocus:'rgba(232,68,122,0.55)', // rose focus ring

  // Text
  text:      '#FFFFFF',
  text2:     'rgba(255,255,255,0.55)',
  text3:     'rgba(255,255,255,0.30)',
  textMuted: 'rgba(255,255,255,0.18)',

  // Status
  success:   '#34C97B',
  warning:   '#F59E0B',
  danger:    '#EF4444',
  info:      '#60A5FA',
} as const;

// ─── Gradients ────────────────────────────────────────────────────────────────
export const AppGradients = {
  rose:        ['#E8447A', '#C03160'] as const,
  rosePurple:  ['#E8447A', '#9B6ECA'] as const,
  roseGold:    ['#E8447A', '#C9956C'] as const,
  surface:     ['#1A1524', '#13101A'] as const,
  card:        ['#1E192A', '#181320'] as const,
  premium:     ['#C9956C', '#9B6ECA'] as const,
  dark:        ['rgba(14,11,18,0)', 'rgba(14,11,18,0.95)'] as const,
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
export const AppTypography = {
  font: {
    regular:  'Poppins_400Regular' as const,
    medium:   'Poppins_500Medium' as const,
    semibold: 'Poppins_600SemiBold' as const,
    bold:     'Poppins_700Bold' as const,
  },
  size: {
    xs:   10,
    sm:   12,
    base: 14,
    md:   15,
    lg:   17,
    xl:   20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 34,
  },
  lineHeight: {
    tight:  1.2,
    normal: 1.5,
    loose:  1.8,
  },
} as const;

// ─── Spacing ──────────────────────────────────────────────────────────────────
export const AppSpacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
} as const;

// ─── Radius ───────────────────────────────────────────────────────────────────
export const AppRadius = {
  xs:   6,
  sm:   10,
  md:   14,
  lg:   18,
  xl:   24,
  '2xl': 32,
  full: 999,
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────
export const AppShadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 12,
  },
  rose: {
    shadowColor: '#E8447A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
} as const;

// ─── Animation presets ────────────────────────────────────────────────────────
export const AppAnimations = {
  duration: {
    fast:   120,
    normal: 220,
    slow:   380,
  },
  spring: {
    damping: 18,
    stiffness: 200,
    mass: 0.8,
  },
} as const;

// ─── Consolidated T token (backwards-compat + new fields) ────────────────────
export const T = {
  // Backgrounds
  BG:       AppColors.bg,
  BG2:      AppColors.bg2,
  SURFACE:  AppColors.surface,
  SURFACE_2: AppColors.surface2,
  SURFACE_3: AppColors.surface3,

  // Accent
  ROSE:     AppColors.rose,
  ROSE_DARK: AppColors.roseDark,
  ROSE_LIGHT: AppColors.roseLight,
  PURPLE:   AppColors.purple,
  ROSE_GOLD: AppColors.roseGold,

  // Borders
  BORDER:   AppColors.border,
  BORDER_2: AppColors.border2,
  BORDER_FOCUS: AppColors.borderFocus,

  // Text
  TEXT:     AppColors.text,
  TEXT_2:   AppColors.text2,
  TEXT_3:   AppColors.text3,
  TEXT_MUTED: AppColors.textMuted,

  // Status
  SUCCESS:  AppColors.success,
  WARNING:  AppColors.warning,
  ERROR:    AppColors.danger,
  DANGER:   AppColors.danger,

  // Typography
  FONT:     AppTypography.font,

  // Radius
  RADIUS:   AppRadius,

  // Spacing
  SPACE:    AppSpacing,
} as const;
