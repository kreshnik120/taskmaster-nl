import { useState, useCallback } from 'react';
import type { TaskListSelectionState } from '../types';

/**
 * Hook for managing task selection state
 * Supports single and bulk selection with toggle behavior
 */
export function useTaskListSelection(): TaskListSelectionState {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback((allIds: string[]) => {
    setSelectedIds(prev => {
      const allSelected = allIds.every(id => prev.has(id));
      if (allSelected) {
        return new Set();
      } else {
        return new Set(allIds);
      }
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  const isAllSelected = useCallback((allIds: string[]) => {
    if (allIds.length === 0) return false;
    return allIds.every(id => selectedIds.has(id));
  }, [selectedIds]);

  const isPartiallySelected = useCallback((allIds: string[]) => {
    if (allIds.length === 0) return false;
    const selectedCount = allIds.filter(id => selectedIds.has(id)).length;
    return selectedCount > 0 && selectedCount < allIds.length;
  }, [selectedIds]);

  return {
    selectedIds,
    toggleSelection,
    toggleAll,
    clearSelection,
    isSelected,
    isAllSelected,
    isPartiallySelected,
  };
}
