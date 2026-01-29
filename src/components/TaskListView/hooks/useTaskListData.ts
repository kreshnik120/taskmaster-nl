import { useMemo } from 'react';
import { useTasksQuery } from '@/hooks/useTasksQuery';
import { startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import type { TaskListTask, TaskListDataOptions, TaskListDataResult, TaskListFilters, QuickFilter } from '../types';

// Priority order for sorting
const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
};

/**
 * Check if a task matches a quick filter
 * Note: Task interface doesn't have a 'status' field, so we use:
 * - 'open' = no completed_at
 * - 'in_progress' = has start_at but no completed_at (active work)
 * - 'review' = priority HIGH (as proxy for review tasks)
 * - 'critical' = priority CRITICAL
 * - 'due_today' = due_at is today
 */
function matchesQuickFilter(task: TaskListTask, filter: QuickFilter): boolean {
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  switch (filter) {
    case 'open':
      return !task.completed_at;
    case 'in_progress':
      // Active tasks = have a start date but not completed
      return !task.completed_at && !!task.start_at;
    case 'review':
      // Use HIGH priority as proxy for review tasks
      return task.priority === 'HIGH';
    case 'critical':
      return task.priority === 'CRITICAL';
    case 'due_today':
      if (!task.due_at) return false;
      const dueDate = new Date(task.due_at);
      return isWithinInterval(dueDate, { start: todayStart, end: todayEnd });
    default:
      return true;
  }
}

/**
 * Sort tasks based on filter settings
 */
function sortTasks(tasks: TaskListTask[], filters: TaskListFilters): TaskListTask[] {
  const sorted = [...tasks];
  const { sortBy, sortDirection } = filters;
  const multiplier = sortDirection === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'priority': {
        const priorityA = PRIORITY_ORDER[a.priority] ?? 4;
        const priorityB = PRIORITY_ORDER[b.priority] ?? 4;
        return (priorityA - priorityB) * multiplier;
      }
      case 'created_at': {
        // Use start_at as fallback since created_at is not in Task interface
        const dateA = a.start_at ? new Date(a.start_at).getTime() : 0;
        const dateB = b.start_at ? new Date(b.start_at).getTime() : 0;
        return (dateA - dateB) * multiplier;
      }
      case 'due_at':
      default: {
        // Tasks without due_at go to the end
        if (!a.due_at && !b.due_at) return 0;
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        const dateA = new Date(a.due_at).getTime();
        const dateB = new Date(b.due_at).getTime();
        return (dateA - dateB) * multiplier;
      }
    }
  });

  return sorted;
}

/**
 * Hook for fetching and filtering task list data
 * Wraps useTasksQuery and adds client-side filtering
 */
export function useTaskListData(options: TaskListDataOptions): TaskListDataResult {
  const query = useTasksQuery();

  const filteredData = useMemo(() => {
    let tasks = (query.data || []) as TaskListTask[];

    // Filter by userId if provided
    if (options.userId) {
      tasks = tasks.filter(t => t.assignee_id === options.userId);
    }

    // Apply quick filters (AND logic - task must match ALL active filters)
    if (options.filters.quickFilters.length > 0) {
      tasks = tasks.filter(task =>
        options.filters.quickFilters.every(filter => matchesQuickFilter(task, filter))
      );
    }

    // Search filter
    if (options.filters.searchQuery) {
      const q = options.filters.searchQuery.toLowerCase();
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.profiles?.name?.toLowerCase().includes(q)
      );
    }

    // Sort
    tasks = sortTasks(tasks, options.filters);

    // Limit
    if (options.limit && options.limit > 0) {
      tasks = tasks.slice(0, options.limit);
    }

    return tasks;
  }, [query.data, options.userId, options.filters, options.limit]);

  return {
    tasks: filteredData,
    totalCount: query.data?.length || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}
