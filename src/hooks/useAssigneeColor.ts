/**
 * Hook for consistent assignee-based colors in the calendar and other components.
 * Uses a hash algorithm to ensure the same assignee always gets the same color.
 */

// 9-color palette with light/dark mode support
export const ASSIGNEE_COLORS = [
  {
    name: 'red',
    bg: 'bg-red-50/40 dark:bg-red-900/20',
    border: 'border-l-red-500/70',
    dot: 'bg-red-500/80',
    avatarBg: 'bg-red-100 dark:bg-red-900/30',
    avatarText: 'text-red-700 dark:text-red-300',
  },
  {
    name: 'orange',
    bg: 'bg-orange-50/40 dark:bg-orange-900/20',
    border: 'border-l-orange-500/70',
    dot: 'bg-orange-500/80',
    avatarBg: 'bg-orange-100 dark:bg-orange-900/30',
    avatarText: 'text-orange-700 dark:text-orange-300',
  },
  {
    name: 'amber',
    bg: 'bg-amber-50/40 dark:bg-amber-900/20',
    border: 'border-l-amber-500/70',
    dot: 'bg-amber-500/80',
    avatarBg: 'bg-amber-100 dark:bg-amber-900/30',
    avatarText: 'text-amber-700 dark:text-amber-300',
  },
  {
    name: 'green',
    bg: 'bg-green-50/40 dark:bg-green-900/20',
    border: 'border-l-green-500/70',
    dot: 'bg-green-500/80',
    avatarBg: 'bg-green-100 dark:bg-green-900/30',
    avatarText: 'text-green-700 dark:text-green-300',
  },
  {
    name: 'teal',
    bg: 'bg-teal-50/40 dark:bg-teal-900/20',
    border: 'border-l-teal-500/70',
    dot: 'bg-teal-500/80',
    avatarBg: 'bg-teal-100 dark:bg-teal-900/30',
    avatarText: 'text-teal-700 dark:text-teal-300',
  },
  {
    name: 'blue',
    bg: 'bg-blue-50/40 dark:bg-blue-900/20',
    border: 'border-l-blue-500/70',
    dot: 'bg-blue-500/80',
    avatarBg: 'bg-blue-100 dark:bg-blue-900/30',
    avatarText: 'text-blue-700 dark:text-blue-300',
  },
  {
    name: 'indigo',
    bg: 'bg-indigo-50/40 dark:bg-indigo-900/20',
    border: 'border-l-indigo-500/70',
    dot: 'bg-indigo-500/80',
    avatarBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    avatarText: 'text-indigo-700 dark:text-indigo-300',
  },
  {
    name: 'purple',
    bg: 'bg-purple-50/40 dark:bg-purple-900/20',
    border: 'border-l-purple-500/70',
    dot: 'bg-purple-500/80',
    avatarBg: 'bg-purple-100 dark:bg-purple-900/30',
    avatarText: 'text-purple-700 dark:text-purple-300',
  },
  {
    name: 'pink',
    bg: 'bg-pink-50/40 dark:bg-pink-900/20',
    border: 'border-l-pink-500/70',
    dot: 'bg-pink-500/80',
    avatarBg: 'bg-pink-100 dark:bg-pink-900/30',
    avatarText: 'text-pink-700 dark:text-pink-300',
  },
] as const;

// Default color for unassigned tasks
export const UNASSIGNED_COLOR = {
  name: 'gray',
  bg: 'bg-secondary/50',
  border: 'border-l-secondary',
  dot: 'bg-muted-foreground/50',
  avatarBg: 'bg-muted',
  avatarText: 'text-muted-foreground',
};

// Priority indicator dots (small, for secondary display)
export const PRIORITY_INDICATOR_DOTS: Record<string, string> = {
  low: 'bg-emerald-500',
  medium: 'bg-blue-500',
  high: 'bg-amber-500',
  critical: 'bg-red-500',
};

/**
 * Hash a string to a consistent number
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/**
 * Get a consistent color for an assignee based on their ID or name
 */
export function getAssigneeColor(assigneeId: string | null | undefined): typeof ASSIGNEE_COLORS[number] | typeof UNASSIGNED_COLOR {
  if (!assigneeId) {
    return UNASSIGNED_COLOR;
  }
  
  const hash = hashString(assigneeId);
  const colorIndex = hash % ASSIGNEE_COLORS.length;
  return ASSIGNEE_COLORS[colorIndex];
}

/**
 * Hook for using assignee colors in components
 */
export function useAssigneeColor(assigneeId: string | null | undefined) {
  return getAssigneeColor(assigneeId);
}
