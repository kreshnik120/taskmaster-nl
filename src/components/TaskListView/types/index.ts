/**
 * Type definitions for TaskListView component
 */

// Re-export Task from useTasksQuery for type compatibility
import type { Task } from '@/hooks/useTasksQuery';

export type TaskListTask = Task;

// Quick filter options
export type QuickFilter = 'open' | 'in_progress' | 'review' | 'critical' | 'due_today';

export interface TaskListFilters {
  searchQuery: string;
  sortBy: 'due_at' | 'priority' | 'created_at';
  sortDirection: 'asc' | 'desc';
  quickFilters: QuickFilter[];
}

export interface TaskListViewProps {
  userId?: string;
  showToolbar?: boolean;
  limit?: number;
  onTaskSelect?: (task: TaskListTask) => void;
  className?: string;
}

export interface TaskListDataOptions {
  userId?: string;
  filters: TaskListFilters;
  limit?: number;
}

export interface TaskListDataResult {
  tasks: TaskListTask[];
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Selection state interface
export interface TaskListSelectionState {
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  toggleAll: (allIds: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  isAllSelected: (allIds: string[]) => boolean;
  isPartiallySelected: (allIds: string[]) => boolean;
}

// Keyboard navigation options
export interface UseTaskListKeyboardOptions {
  tasks: TaskListTask[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onOpenPanel: (task: TaskListTask) => void;
  onClosePanel: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onOpenNewTask?: () => void;
  isPanelOpen: boolean;
  enabled?: boolean;
}

// Filter pills labels
export const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  open: 'Open',
  in_progress: 'In uitvoering',
  review: 'Review',
  critical: 'Kritiek',
  due_today: 'Vandaag due',
};
