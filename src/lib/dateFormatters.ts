import { format } from "date-fns";
import { nl } from "date-fns/locale";

export type UrgencyStatus = 'none' | 'overdue' | 'today' | 'tomorrow' | 'normal';

export interface DateUrgency {
  status: UrgencyStatus;
  className: string;
  badge: string | null;
}

/**
 * Format a date period with smart condensation for enterprise display
 * - Same day: "21 jan."
 * - Same month: "21 – 22 jan."
 * - Different months: "21 jan. – 5 feb."
 */
export function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  
  if (start && end) {
    const startD = new Date(start);
    const endD = new Date(end);
    
    // Same day → show single date
    if (startD.toDateString() === endD.toDateString()) {
      return format(startD, "d MMM", { locale: nl });
    }
    
    // Same month → compact display: "21 – 22 jan."
    if (startD.getMonth() === endD.getMonth() && 
        startD.getFullYear() === endD.getFullYear()) {
      return `${format(startD, "d")} – ${format(endD, "d MMM", { locale: nl })}`;
    }
    
    // Different months → full display
    return `${format(startD, "d MMM", { locale: nl })} – ${format(endD, "d MMM", { locale: nl })}`;
  }
  
  if (start) return `Vanaf ${format(new Date(start), "d MMM", { locale: nl })}`;
  if (end) return `Tot ${format(new Date(end), "d MMM", { locale: nl })}`;
  return "—";
}

/**
 * Format a single date with smart display
 */
export function formatDate(date: string | null): string {
  if (!date) return "—";
  return format(new Date(date), "d MMM", { locale: nl });
}

/**
 * Format a date with full display including year
 */
export function formatDateFull(date: string | null): string {
  if (!date) return "—";
  return format(new Date(date), "d MMM yyyy", { locale: nl });
}

/**
 * Format a date with time
 */
export function formatDateTime(date: string | null): string {
  if (!date) return "—";
  return format(new Date(date), "d MMM yyyy 'om' HH:mm", { locale: nl });
}

/**
 * Get urgency status and styling for a due date
 * Uses end-of-day (23:59:59) for accurate day calculations
 */
export function getDateUrgency(dueAt: string | null): DateUrgency {
  if (!dueAt) return { status: 'none', className: '', badge: null };
  
  const due = new Date(dueAt);
  due.setHours(23, 59, 59, 999); // End of day
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { 
      status: 'overdue', 
      className: 'text-destructive font-medium', 
      badge: 'Verlopen' 
    };
  }
  if (diffDays === 0) {
    return { 
      status: 'today', 
      className: 'text-orange-600 dark:text-orange-400 font-medium', 
      badge: 'Vandaag' 
    };
  }
  if (diffDays === 1) {
    return { 
      status: 'tomorrow', 
      className: 'text-amber-600 dark:text-amber-400', 
      badge: 'Morgen' 
    };
  }
  return { status: 'normal', className: 'text-muted-foreground', badge: null };
}

/**
 * Get urgency badge styling classes for enterprise-level display
 */
export function getUrgencyBadgeClasses(status: UrgencyStatus): {
  container: string;
  dot: string;
} {
  switch (status) {
    case 'overdue':
      return {
        container: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400',
        dot: 'bg-red-500'
      };
    case 'today':
      return {
        container: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
        dot: 'bg-orange-500'
      };
    case 'tomorrow':
      return {
        container: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
        dot: 'bg-amber-500'
      };
    default:
      return {
        container: '',
        dot: ''
      };
  }
}
