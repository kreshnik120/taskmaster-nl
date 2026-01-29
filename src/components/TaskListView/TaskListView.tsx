import { useState, useRef } from 'react';
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
import type { TaskListViewProps, TaskListTask } from './types';

/**
 * Loading skeleton for task list
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/**
 * Error state component
 */
function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-1">{message}</h3>
      <p className="text-sm text-muted-foreground">
        Probeer de pagina te vernieuwen
      </p>
    </div>
  );
}

/**
 * Main TaskListView component
 * Displays tasks in a responsive format (table on desktop, cards on mobile)
 * With filter pills, side panel, keyboard navigation, and bulk actions
 */
export function TaskListView({
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
    isSelected,
    isAllSelected,
    isPartiallySelected,
  } = useTaskListSelection();

  // Panel and navigation state
  const [panelTask, setPanelTask] = useState<TaskListTask | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Task IDs for bulk selection
  const taskIds = tasks.map(t => t.id);

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
    // TODO: Implement actual status change
    clearSelection();
  };

  const handleBulkPriorityChange = (priority: string) => {
    console.log('Bulk priority change:', priority, Array.from(selectedIds));
    // TODO: Implement actual priority change
    clearSelection();
  };

  const handleBulkDelete = () => {
    console.log('Bulk delete:', Array.from(selectedIds));
    // TODO: Implement actual delete with confirmation
    clearSelection();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={className}>
        <div className="text-sm text-muted-foreground mb-4">Taken laden...</div>
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
