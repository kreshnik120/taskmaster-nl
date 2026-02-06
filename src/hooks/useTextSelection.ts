import { useState, useEffect, useCallback, RefObject } from 'react';

interface SelectionState {
  text: string;
  rect: DOMRect | null;
  isActive: boolean;
}

/**
 * Hook to detect and track text selection within a container element.
 * Returns the selected text, its bounding rect, and whether a selection is active.
 */
export function useTextSelection(containerRef: RefObject<HTMLElement>): SelectionState {
  const [selection, setSelection] = useState<SelectionState>({
    text: '',
    rect: null,
    isActive: false
  });

  const handleSelectionChange = useCallback(() => {
    const windowSelection = window.getSelection();
    
    if (!windowSelection || windowSelection.isCollapsed || !containerRef.current) {
      setSelection({ text: '', rect: null, isActive: false });
      return;
    }

    const selectedText = windowSelection.toString().trim();
    if (!selectedText) {
      setSelection({ text: '', rect: null, isActive: false });
      return;
    }

    // Check if selection is within the container
    const range = windowSelection.getRangeAt(0);
    const isWithinContainer = containerRef.current.contains(range.commonAncestorContainer);

    if (!isWithinContainer) {
      setSelection({ text: '', rect: null, isActive: false });
      return;
    }

    // Get the bounding rect of the selection
    const rect = range.getBoundingClientRect();
    
    setSelection({
      text: selectedText,
      rect,
      isActive: true
    });
  }, [containerRef]);

  // Handle mouse up to detect selection end
  const handleMouseUp = useCallback(() => {
    // Small delay to ensure selection is complete
    setTimeout(handleSelectionChange, 10);
  }, [handleSelectionChange]);

  // Handle click outside to clear selection
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      // Don't clear if clicking on the selection menu
      const target = e.target as HTMLElement;
      if (target.closest('[data-selection-menu]')) {
        return;
      }
      setSelection({ text: '', rect: null, isActive: false });
    }
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleMouseUp, handleClickOutside, handleSelectionChange]);

  return selection;
}
