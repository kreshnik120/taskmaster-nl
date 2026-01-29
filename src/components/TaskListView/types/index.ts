/**
 * Type definitions for TaskListView component
 */

// Re-export Task from useTasksQuery for type compatibility
import type { Task } from '@/hooks/useTasksQuery';

export type TaskListTask = Task;

export interface TaskListFilters {
  searchQuery: string;
  sortBy: 'due_at' | 'priority' | 'created_at';
  sortDirection: 'asc' | 'desc';
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
