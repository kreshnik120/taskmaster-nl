import { useEffect, useCallback } from 'react';
import type { UseTaskListKeyboardOptions } from '../types';

/**
 * Hook for keyboard navigation in task list
 * Supports j/k navigation, Enter to open, Escape to close, / to search, n for new
 */
export function useTaskListKeyboard({
  tasks,
  selectedIndex,
  onSelectedIndexChange,
  onOpenPanel,
  onClosePanel,
  searchInputRef,
  onOpenNewTask,
  isPanelOpen,
  enabled = true,
}: UseTaskListKeyboardOptions) {
  const isInputElement = useCallback((element: EventTarget | null): boolean => {
    if (!element) return false;
    const tagName = (element as HTMLElement).tagName?.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Don't handle if typing in an input (except for Escape)
    const inInput = isInputElement(event.target);

    switch (event.key) {
      case 'j':
        if (!inInput && !isPanelOpen) {
          event.preventDefault();
          const nextIndex = Math.min(selectedIndex + 1, tasks.length - 1);
          onSelectedIndexChange(nextIndex < 0 ? 0 : nextIndex);
        }
        break;

      case 'k':
        if (!inInput && !isPanelOpen) {
          event.preventDefault();
          const prevIndex = Math.max(selectedIndex - 1, 0);
          onSelectedIndexChange(prevIndex);
        }
        break;

      case 'Enter':
        if (!inInput && selectedIndex >= 0 && selectedIndex < tasks.length) {
          event.preventDefault();
          onOpenPanel(tasks[selectedIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        if (isPanelOpen) {
          onClosePanel();
        } else if (inInput) {
          (event.target as HTMLElement).blur();
        } else {
          onSelectedIndexChange(-1);
        }
        break;

      case '/':
        if (!inInput) {
          event.preventDefault();
          searchInputRef.current?.focus();
        }
        break;

      case 'n':
        if (!inInput && !isPanelOpen && onOpenNewTask) {
          event.preventDefault();
          onOpenNewTask();
        }
        break;

      default:
        break;
    }
  }, [
    enabled,
    isInputElement,
    isPanelOpen,
    onClosePanel,
    onOpenNewTask,
    onOpenPanel,
    onSelectedIndexChange,
    searchInputRef,
    selectedIndex,
    tasks,
  ]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}
