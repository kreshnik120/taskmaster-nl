import { useState, useCallback, useContext, createContext, ReactNode } from 'react';

/**
 * Drag Context for AI-aware task flow management
 * Tracks drag state and enables AI suggestions during drag operations
 */

export interface DragContextData {
  isDragging: boolean;
  draggedTaskId: string | null;
  sourceColumn: string | null;
  potentialTargets: string[];
  aiSuggestion: string | null;
}

export interface DragContextActions {
  startDrag: (taskId: string, columnId: string) => void;
  endDrag: () => void;
  setAISuggestion: (suggestion: string | null) => void;
  setPotentialTargets: (targets: string[]) => void;
}

type DragContextValue = DragContextData & DragContextActions;

const DragContext = createContext<DragContextValue | null>(null);

const initialState: DragContextData = {
  isDragging: false,
  draggedTaskId: null,
  sourceColumn: null,
  potentialTargets: [],
  aiSuggestion: null,
};

export function useDragContext(): DragContextValue {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error('useDragContext must be used within DragContextProvider');
  }
  return context;
}

/**
 * Optional hook that returns null if not within provider
 * Useful for components that may or may not have drag context
 */
export function useDragContextOptional(): DragContextValue | null {
  return useContext(DragContext);
}

interface DragContextProviderProps {
  children: ReactNode;
}

export function DragContextProvider({ children }: DragContextProviderProps) {
  const [state, setState] = useState<DragContextData>(initialState);

  const startDrag = useCallback((taskId: string, columnId: string) => {
    setState({
      isDragging: true,
      draggedTaskId: taskId,
      sourceColumn: columnId,
      potentialTargets: [],
      aiSuggestion: null,
    });
  }, []);

  const endDrag = useCallback(() => {
    setState(initialState);
  }, []);

  const setAISuggestion = useCallback((suggestion: string | null) => {
    setState(prev => ({ ...prev, aiSuggestion: suggestion }));
  }, []);

  const setPotentialTargets = useCallback((targets: string[]) => {
    setState(prev => ({ ...prev, potentialTargets: targets }));
  }, []);

  const value: DragContextValue = {
    ...state,
    startDrag,
    endDrag,
    setAISuggestion,
    setPotentialTargets,
  };

  return (
    <DragContext.Provider value={value}>
      {children}
    </DragContext.Provider>
  );
}

export default DragContextProvider;
