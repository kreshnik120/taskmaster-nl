import { useState, useEffect, useCallback } from 'react';
import type { TaskListFilters, QuickFilter } from '../types';

const STORAGE_KEY_SORT_BY = 'tasklist-sort-by';
const STORAGE_KEY_SORT_DIR = 'tasklist-sort-dir';

/**
 * Hook for managing task list filter and sort state
 * Persists sort preferences to localStorage
 */
export function useTaskListFilters() {
  const [filters, setFiltersState] = useState<TaskListFilters>(() => {
    const savedSortBy = localStorage.getItem(STORAGE_KEY_SORT_BY);
    const savedSortDir = localStorage.getItem(STORAGE_KEY_SORT_DIR);
    
    return {
      searchQuery: '',
      sortBy: (savedSortBy as TaskListFilters['sortBy']) || 'due_at',
      sortDirection: (savedSortDir as TaskListFilters['sortDirection']) || 'asc',
      quickFilters: [],
    };
  });

  // Persist sort preferences to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SORT_BY, filters.sortBy);
    localStorage.setItem(STORAGE_KEY_SORT_DIR, filters.sortDirection);
  }, [filters.sortBy, filters.sortDirection]);

  const setFilters = useCallback((
    updater: TaskListFilters | ((prev: TaskListFilters) => TaskListFilters)
  ) => {
    setFiltersState(updater);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setFiltersState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const setSortBy = useCallback((sortBy: TaskListFilters['sortBy']) => {
    setFiltersState(prev => ({ ...prev, sortBy }));
  }, []);

  const toggleSortDirection = useCallback(() => {
    setFiltersState(prev => ({
      ...prev,
      sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const toggleQuickFilter = useCallback((filter: QuickFilter) => {
    setFiltersState(prev => {
      const hasFilter = prev.quickFilters.includes(filter);
      return {
        ...prev,
        quickFilters: hasFilter
          ? prev.quickFilters.filter(f => f !== filter)
          : [...prev.quickFilters, filter],
      };
    });
  }, []);

  const clearQuickFilters = useCallback(() => {
    setFiltersState(prev => ({ ...prev, quickFilters: [] }));
  }, []);

  const hasActiveQuickFilters = filters.quickFilters.length > 0;

  return {
    filters,
    setFilters,
    setSearchQuery,
    setSortBy,
    toggleSortDirection,
    toggleQuickFilter,
    clearQuickFilters,
    hasActiveQuickFilters,
  };
}
