/**
 * Apple-Niveau Design Tokens
 * Single source of truth for design system constants
 */

// Score kleuren - Apple-style minimaal (alleen grijs + accent bij hoge scores)
export const SCORE_COLORS = {
  excellent: 'text-foreground',      // 80%+ - gewoon zwart, progress bar toont kwaliteit
  good: 'text-foreground',           // 60-79%
  moderate: 'text-muted-foreground', // 40-59%
  low: 'text-muted-foreground/70',   // <40%
} as const;

export const SCORE_PROGRESS_COLORS = {
  excellent: 'bg-primary',           // 80%+ - primary blue
  good: 'bg-primary/70',             // 60-79%
  moderate: 'bg-muted-foreground/40', // 40-59%
  low: 'bg-muted-foreground/20',     // <40%
} as const;

// Status kleuren - Apple-style dots
export const STATUS_COLORS = {
  beschikbaar: 'bg-green-500',
  bezet: 'bg-amber-500',
  niet_beschikbaar: 'bg-muted-foreground/40',
  geplaatst: 'bg-primary',
} as const;

// Badge kleuren - Vereenvoudigd tot 4 varianten (Apple-style)
export const BADGE_VARIANTS = {
  // Primary items (functie niveau, belangrijke status)
  primary: 'bg-primary/10 text-primary border-0',
  // Secondary items (sector, doelgroep - allemaal zelfde kleur)
  secondary: 'bg-muted text-muted-foreground border-0',
  // Success (geplaatst, goedgekeurd)
  success: 'bg-green-500/10 text-green-700 dark:text-green-400 border-0',
  // Destructive (afgewezen, verwijderd)
  destructive: 'bg-destructive/10 text-destructive border-0',
} as const;

// Spacing - Apple 4px grid
export const SPACING = {
  xs: 'gap-1',    // 4px
  sm: 'gap-2',    // 8px
  md: 'gap-3',    // 12px
  lg: 'gap-4',    // 16px
  xl: 'gap-6',    // 24px
} as const;

// Animation durations - Apple-style smooth
export const TRANSITIONS = {
  fast: 'transition-all duration-100',
  normal: 'transition-all duration-200',
  slow: 'transition-all duration-300',
  colors: 'transition-colors duration-150',
  shadow: 'transition-shadow duration-150',
  transform: 'transition-transform duration-200',
} as const;

// Card hover states - Apple-style subtle
export const CARD_HOVER = {
  subtle: 'hover:shadow-sm',
  none: '',
} as const;

// Progress bar heights - Apple-style thin
export const PROGRESS_HEIGHTS = {
  xs: 'h-0.5',    // 2px
  sm: 'h-1',      // 4px (Apple default)
  md: 'h-1.5',    // 6px
  lg: 'h-2',      // 8px
} as const;

// Helper functions
export function getScoreColor(score: number): string {
  if (score >= 80) return SCORE_COLORS.excellent;
  if (score >= 60) return SCORE_COLORS.good;
  if (score >= 40) return SCORE_COLORS.moderate;
  return SCORE_COLORS.low;
}

export function getScoreProgressColor(score: number): string {
  if (score >= 80) return SCORE_PROGRESS_COLORS.excellent;
  if (score >= 60) return SCORE_PROGRESS_COLORS.good;
  if (score >= 40) return SCORE_PROGRESS_COLORS.moderate;
  return SCORE_PROGRESS_COLORS.low;
}

export function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'beschikbaar':
    case 'actief':
      return STATUS_COLORS.beschikbaar;
    case 'bezet':
    case 'in_behandeling':
      return STATUS_COLORS.bezet;
    case 'geplaatst':
      return STATUS_COLORS.geplaatst;
    default:
      return STATUS_COLORS.niet_beschikbaar;
  }
}
