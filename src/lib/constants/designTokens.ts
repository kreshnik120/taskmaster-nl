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

// Subtask indicator styling - Enterprise-niveau consistentie
export const SUBTASK_TOKENS = {
  progress: {
    height: 'h-1',
    background: 'bg-muted',
    fill: 'bg-primary/60',
    fillComplete: 'bg-green-500/60',
  },
  counter: {
    wrapper: 'text-[10px] text-muted-foreground/60 flex items-center gap-0.5',
    icon: 'h-2.5 w-2.5',
  },
  activeIndicator: {
    dot: 'h-1.5 w-1.5 rounded-full bg-primary animate-pulse',
    text: 'text-[10px] text-primary/80',
    wrapper: 'flex items-center gap-1',
  },
  inlinePreview: {
    text: 'text-xs text-muted-foreground',
    activeText: 'text-primary font-medium',
    icon: 'h-3 w-3',
    activeIcon: 'h-2 w-2 rounded-full bg-primary animate-pulse',
  },
} as const;

// Next Action styling - Consistente weergave
export const ACTION_TOKENS = {
  inline: {
    icon: 'h-2.5 w-2.5 text-primary/60 shrink-0',
    text: 'text-[10px] text-primary/70',
    wrapper: 'flex items-center gap-1.5',
  },
  compact: {
    icon: 'h-3 w-3 text-primary/60 shrink-0',
    text: 'text-xs text-muted-foreground/80',
    wrapper: 'flex items-center gap-1.5 mt-1 group/action',
  },
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

// ============================================
// TAB CONTEXT COLORS - Enterprise Premium
// ============================================

export const TAB_CONTEXT_COLORS = {
  'mijn-werk': {
    name: 'Mijn Werk',
    accent: 'text-tab-mijn-werk-700 dark:text-tab-mijn-werk-300',
    background: 'bg-tab-mijn-werk-100 dark:bg-tab-mijn-werk-900/50',
    indicator: 'bg-tab-mijn-werk-500',
    iconBg: 'bg-tab-mijn-werk-100/80 dark:bg-tab-mijn-werk-900/40',
    shadow: 'shadow-tab-mijn-werk',
    border: 'border-tab-mijn-werk-200 dark:border-tab-mijn-werk-800',
    hoverBorder: 'hover:border-tab-mijn-werk-300',
  },
  'kalender': {
    name: 'Kalender',
    accent: 'text-tab-kalender-700 dark:text-tab-kalender-300',
    background: 'bg-tab-kalender-100 dark:bg-tab-kalender-900/50',
    indicator: 'bg-tab-kalender-500',
    iconBg: 'bg-tab-kalender-100/80 dark:bg-tab-kalender-900/40',
    shadow: 'shadow-tab-kalender',
    border: 'border-tab-kalender-200 dark:border-tab-kalender-800',
    hoverBorder: 'hover:border-tab-kalender-300',
  },
  'lijst': {
    name: 'Lijst',
    accent: 'text-tab-lijst-700 dark:text-tab-lijst-300',
    background: 'bg-tab-lijst-100 dark:bg-tab-lijst-900/50',
    indicator: 'bg-tab-lijst-500',
    iconBg: 'bg-tab-lijst-100/80 dark:bg-tab-lijst-900/40',
    shadow: 'shadow-tab-lijst',
    border: 'border-tab-lijst-200 dark:border-tab-lijst-800',
    hoverBorder: 'hover:border-tab-lijst-300',
  },
  'opvolging': {
    name: 'Opvolging',
    accent: 'text-tab-opvolging-700 dark:text-tab-opvolging-300',
    background: 'bg-tab-opvolging-100 dark:bg-tab-opvolging-900/50',
    indicator: 'bg-tab-opvolging-500',
    iconBg: 'bg-tab-opvolging-100/80 dark:bg-tab-opvolging-900/40',
    shadow: 'shadow-tab-opvolging',
    border: 'border-tab-opvolging-200 dark:border-tab-opvolging-800',
    hoverBorder: 'hover:border-tab-opvolging-300',
  },
  'team': {
    name: 'Team',
    accent: 'text-tab-team-700 dark:text-tab-team-300',
    background: 'bg-tab-team-100 dark:bg-tab-team-900/50',
    indicator: 'bg-tab-team-500',
    iconBg: 'bg-tab-team-100/80 dark:bg-tab-team-900/40',
    shadow: 'shadow-tab-team',
    border: 'border-tab-team-200 dark:border-tab-team-800',
    hoverBorder: 'hover:border-tab-team-300',
  },
  'recruitment': {
    name: 'Recruitment',
    accent: 'text-tab-recruitment-700 dark:text-tab-recruitment-300',
    background: 'bg-tab-recruitment-100 dark:bg-tab-recruitment-900/50',
    indicator: 'bg-tab-recruitment-500',
    iconBg: 'bg-tab-recruitment-100/80 dark:bg-tab-recruitment-900/40',
    shadow: 'shadow-tab-recruitment',
    border: 'border-tab-recruitment-200 dark:border-tab-recruitment-800',
    hoverBorder: 'hover:border-tab-recruitment-300',
  },
} as const;

export type TabContextKey = keyof typeof TAB_CONTEXT_COLORS;

export function getTabColors(tabId: string) {
  return TAB_CONTEXT_COLORS[tabId as TabContextKey] 
    || TAB_CONTEXT_COLORS['mijn-werk'];
}

// ============================================
// GLASSMORPHISM TOKENS - Apple visionOS Style
// ============================================

export const GLASS_TOKENS = {
  layer1: {
    class: 'glass-layer-1',
    lightBleed: 'glass-light-bleed',
    description: 'Lightest glass for containers',
  },
  layer2: {
    class: 'glass-layer-2',
    lightBleed: 'glass-light-bleed',
    description: 'Medium glass for cards',
  },
  indigo: {
    class: 'glass-card-indigo',
    lightBleed: 'glass-light-bleed-indigo',
    description: 'Indigo-tinted glass for Mijn Werk',
  },
  kanban: {
    class: 'glass-kanban-column',
    description: 'Subtle glass for kanban columns',
  },
  taskCard: {
    class: 'glass-task-card',
    description: 'Hover glass effect for task cards',
  },
} as const;
