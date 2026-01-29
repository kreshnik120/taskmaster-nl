import { useState, useRef, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { useTaskListFilters } from './hooks/useTaskListFilters';
import { useTaskListData } from './hooks/useTaskListData';
import { useTaskListSelection } from './hooks/useTaskListSelection';
import { useTaskListKeyboard } from './hooks/useTaskListKeyboard';
import { TaskListToolbar } from './TaskListToolbar';
import { TaskListFilterPills } from './TaskListFilterPills';
import { TaskListTable } from './TaskListTable';
import { TaskListCards } from './TaskListCards';
import { TaskListEmptyState } from './TaskListEmptyState';
import { TaskListSidePanel } from './TaskListSidePanel';
import { TaskListBulkActions } from './TaskListBulkActions';
import { TaskListErrorBoundary } from './TaskListErrorBoundary';
import { announceToScreenReader, TASK_LIST_ID } from './utils/accessibility';
import type { TaskListViewProps, TaskListTask } from './types';

/**
 * Loading skeleton with 5-column layout matching table
 */
function LoadingSkeleton() {
  return (
    <div 
      className="space-y-3"
      aria-busy="true"
      aria-label="Taken worden geladen"
      role="status"
    >
      {/* Toolbar skeleton */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>
      
      {/* Table skeleton with 5 columns */}
      <div className="rounded-md border">
        {/* Header row */}
        <div className="flex items-center gap-4 p-4 border-b bg-muted/30">
          <Skeleton className="h-4 w-4 rounded" /> {/* Checkbox */}
          <Skeleton className="h-4 flex-[2]" /> {/* Task */}
          <Skeleton className="h-4 flex-1" /> {/* Owner */}
          <Skeleton className="h-4 w-16" /> {/* Priority */}
          <Skeleton className="h-4 w-20" /> {/* Deadline */}
        </div>
        
        {/* Data rows */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
            <Skeleton className="h-4 w-4 rounded" />
            <div className="flex-[2] space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="flex-1 flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Error state component
 */
function ErrorState({ message }: { message: string }) {
  return (
    <div 
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-1">{message}</h3>
      <p className="text-sm text-muted-foreground">
        Probeer de pagina te vernieuwen
      </p>
    </div>
  );
}

/**
 * Skip link for keyboard navigation
 */
function SkipLink() {
  return (
    <a
      href={`#${TASK_LIST_ID}`}
      className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-2 focus:border focus:rounded-md focus:shadow-lg"
    >
      Spring naar takenlijst
    </a>
  );
}

/**
 * Inner content component wrapped by error boundary
 */
function TaskListViewContent({
  userId,
  showToolbar = true,
  limit,
  onTaskSelect: externalOnTaskSelect,
  className
}: TaskListViewProps) {
  const isMobile = useIsMobile();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Filters and data
  const { 
    filters, 
    setFilters, 
    toggleQuickFilter, 
    clearQuickFilters,
    hasActiveQuickFilters 
  } = useTaskListFilters();
  
  const { tasks, totalCount, isLoading, error } = useTaskListData({
    userId,
    filters,
    limit
  });

  // Selection state
  const {
    selectedIds,
    toggleSelection,
    toggleAll,
    clearSelection,
    isAllSelected,
    isPartiallySelected,
  } = useTaskListSelection();

  // Panel and navigation state
  const [panelTask, setPanelTask] = useState<TaskListTask | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Task IDs for bulk selection
  const taskIds = tasks.map(t => t.id);

  // Announce filter results to screen readers
  useEffect(() => {
    if (!isLoading && tasks.length >= 0) {
      const message = tasks.length === 1 
        ? '1 taak gevonden' 
        : `${tasks.length} taken gevonden`;
      announceToScreenReader(message);
    }
  }, [tasks.length, isLoading]);

  // Keyboard navigation
  useTaskListKeyboard({
    tasks,
    selectedIndex,
    onSelectedIndexChange: setSelectedIndex,
    onOpenPanel: (task) => {
      setPanelTask(task);
      externalOnTaskSelect?.(task);
    },
    onClosePanel: () => setPanelTask(null),
    searchInputRef,
    isPanelOpen: !!panelTask,
    enabled: !isMobile, // Disable keyboard nav on mobile
  });

  // Handle task selection (opens side panel)
  const handleTaskSelect = (task: TaskListTask) => {
    setPanelTask(task);
    externalOnTaskSelect?.(task);
  };

  // Handle bulk actions (placeholder implementations)
  const handleBulkStatusChange = (status: string) => {
    console.log('Bulk status change:', status, Array.from(selectedIds));
    announceToScreenReader(`${selectedIds.size} taken bijgewerkt`);
    clearSelection();
  };

  const handleBulkPriorityChange = (priority: string) => {
    console.log('Bulk priority change:', priority, Array.from(selectedIds));
    announceToScreenReader(`${selectedIds.size} taken bijgewerkt`);
    clearSelection();
  };

  const handleBulkDelete = () => {
    console.log('Bulk delete:', Array.from(selectedIds));
    // TODO: Show delete confirmation
    clearSelection();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={className}>
        <div className="text-sm text-muted-foreground mb-4">Taken worden geladen...</div>
        <LoadingSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={className}>
        <ErrorState message="Fout bij laden van taken" />
      </div>
    );
  }

  // Determine if filters are active for empty state
  const hasFilters = !!filters.searchQuery || hasActiveQuickFilters;

  return (
    <div className={className}>
      {/* Skip link for accessibility */}
      <SkipLink />

      {/* Screen reader live region for announcements */}
      <div 
        className="sr-only" 
        aria-live="polite" 
        aria-atomic="true"
        id="task-list-announcements"
      />

      {/* Filter Pills */}
      {showToolbar && (
        <TaskListFilterPills
          filters={filters}
          onToggleFilter={toggleQuickFilter}
          onClearAll={clearQuickFilters}
          className="mb-3"
        />
      )}

      {/* Toolbar with search and sort */}
      {showToolbar && (
        <TaskListToolbar
          filters={filters}
          onChange={setFilters}
          taskCount={tasks.length}
          totalCount={totalCount}
          searchInputRef={searchInputRef}
        />
      )}

      {/* Task list */}
      <div id={TASK_LIST_ID}>
        {tasks.length === 0 ? (
          <TaskListEmptyState filtered={hasFilters} />
        ) : isMobile ? (
          <TaskListCards tasks={tasks} onTaskSelect={handleTaskSelect} />
        ) : (
          <TaskListTable
            tasks={tasks}
            selectedIds={selectedIds}
            selectedIndex={selectedIndex}
            onTaskSelect={handleTaskSelect}
            onToggleSelection={toggleSelection}
            onToggleAll={() => toggleAll(taskIds)}
            isAllSelected={isAllSelected(taskIds)}
            isPartiallySelected={isPartiallySelected(taskIds)}
          />
        )}
      </div>

      {/* Side Panel */}
      <TaskListSidePanel
        task={panelTask}
        onClose={() => setPanelTask(null)}
        onEdit={(task) => {
          console.log('Edit task:', task.id);
          // TODO: Open edit modal
        }}
        onDelete={(task) => {
          console.log('Delete task:', task.id);
          // TODO: Show delete confirmation
        }}
      />

      {/* Bulk Actions Bar */}
      {!isMobile && (
        <TaskListBulkActions
          selectedCount={selectedIds.size}
          onStatusChange={handleBulkStatusChange}
          onPriorityChange={handleBulkPriorityChange}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      )}
    </div>
  );
}

/**
 * Main TaskListView component
 * Displays tasks in a responsive format (table on desktop, cards on mobile)
 * With filter pills, side panel, keyboard navigation, and bulk actions
 * Wrapped in error boundary for crash protection
 */
export function TaskListView(props: TaskListViewProps) {
  return (
    <TaskListErrorBoundary>
      <TaskListViewContent {...props} />
    </TaskListErrorBoundary>
  );
}
