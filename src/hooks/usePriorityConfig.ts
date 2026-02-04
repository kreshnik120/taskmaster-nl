import { ArrowDown, Minus, ArrowUp, AlertCircle, LucideIcon } from 'lucide-react';

export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PriorityStyle {
  label: string;
  icon: LucideIcon;
  // Subtle badge (modals, detail views)
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  badgeDark: string;
  // Text-only variant
  textColor: string;
  textWeight: string;
  // Solid badge (tables, lists)
  solidBg: string;
  solidText: string;
}

export const PRIORITY_CONFIG: Record<PriorityLevel, PriorityStyle> = {
  LOW: {
    label: "Laag",
    icon: ArrowDown,
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-700",
    badgeBorder: "border-emerald-400/30",
    badgeDark: "dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/20",
    textColor: "text-emerald-600 dark:text-emerald-400",
    textWeight: "font-normal",
    solidBg: "bg-emerald-500",
    solidText: "text-white"
  },
  MEDIUM: {
    label: "Gemiddeld",
    icon: Minus,
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-700",
    badgeBorder: "border-blue-400/30",
    badgeDark: "dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/20",
    textColor: "text-blue-600 dark:text-blue-400",
    textWeight: "font-medium",
    solidBg: "bg-blue-500",
    solidText: "text-white"
  },
  HIGH: {
    label: "Hoog",
    icon: ArrowUp,
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-700",
    badgeBorder: "border-amber-400/30",
    badgeDark: "dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/20",
    textColor: "text-amber-600 dark:text-amber-400",
    textWeight: "font-semibold",
    solidBg: "bg-amber-500",
    solidText: "text-white"
  },
  CRITICAL: {
    label: "Kritiek",
    icon: AlertCircle,
    badgeBg: "bg-red-500/15",
    badgeText: "text-red-700",
    badgeBorder: "border-red-400/30",
    badgeDark: "dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/20",
    textColor: "text-red-600 dark:text-red-400",
    textWeight: "font-bold",
    solidBg: "bg-red-500",
    solidText: "text-white"
  }
};

/**
 * Get the full priority configuration for a given priority level
 */
export function getPriorityConfig(priority: string | null | undefined): PriorityStyle {
  const normalized = (priority?.toUpperCase() || 'MEDIUM') as PriorityLevel;
  return PRIORITY_CONFIG[normalized] || PRIORITY_CONFIG.MEDIUM;
}

/**
 * Get subtle badge classes (for modals, detail views)
 * Example: "bg-emerald-500/15 text-emerald-700 border-emerald-400/30 dark:..."
 */
export function getPriorityBadgeClass(priority: string | null | undefined): string {
  const config = getPriorityConfig(priority);
  return `${config.badgeBg} ${config.badgeText} ${config.badgeBorder} backdrop-blur-sm ${config.badgeDark}`;
}

/**
 * Get solid badge classes (for tables, lists)
 * Example: "bg-emerald-500 text-white"
 */
export function getPrioritySolidClass(priority: string | null | undefined): string {
  const config = getPriorityConfig(priority);
  return `${config.solidBg} ${config.solidText}`;
}

/**
 * Get text-only classes (for inline priority indicators)
 * Example: "text-emerald-600 dark:text-emerald-400 font-normal"
 */
export function getPriorityTextClass(priority: string | null | undefined): string {
  const config = getPriorityConfig(priority);
  return `${config.textColor} ${config.textWeight}`;
}

/**
 * Get priority label in Dutch
 */
export function getPriorityLabel(priority: string | null | undefined): string {
  return getPriorityConfig(priority).label;
}

/**
 * Get all priority levels for dropdowns/selects
 */
export function getPriorityOptions(): Array<{ value: PriorityLevel; label: string; icon: LucideIcon }> {
  return (Object.keys(PRIORITY_CONFIG) as PriorityLevel[]).map(key => ({
    value: key,
    label: PRIORITY_CONFIG[key].label,
    icon: PRIORITY_CONFIG[key].icon
  }));
}
