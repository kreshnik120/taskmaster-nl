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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { TaskDetailModal } from '@/components/TaskDetailModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Panel, edit, and delete state
  const [panelTask, setPanelTask] = useState<TaskListTask | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editTask, setEditTask] = useState<TaskListTask | null>(null);
  const [deleteTask, setDeleteTask] = useState<TaskListTask | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

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

  // Handle bulk status change
  const handleBulkStatusChange = async (status: string) => {
    const count = selectedIds.size;
    const { error } = await supabase
      .from('tasks')
      .update({ status } as any)
      .in('id', Array.from(selectedIds));
    if (error) {
      toast({ title: 'Fout', description: 'Kon status niet wijzigen', variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['active-tasks'] });
    toast({ title: `${count} taken bijgewerkt naar ${status}` });
    announceToScreenReader(`${count} taken bijgewerkt`);
    clearSelection();
  };

  // Handle bulk priority change
  const handleBulkPriorityChange = async (priority: string) => {
    const count = selectedIds.size;
    const { error } = await supabase
      .from('tasks')
      .update({ priority } as any)
      .in('id', Array.from(selectedIds));
    if (error) {
      toast({ title: 'Fout', description: 'Kon prioriteit niet wijzigen', variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['active-tasks'] });
    toast({ title: `${count} taken prioriteit gewijzigd` });
    announceToScreenReader(`${count} taken bijgewerkt`);
    clearSelection();
  };

  // Handle bulk delete — opens confirmation dialog
  const handleBulkDelete = () => {
    setBulkDeleteOpen(true);
  };

  // Confirm bulk delete (soft delete)
  const confirmBulkDelete = async () => {
    const deletedIds = Array.from(selectedIds);
    const count = deletedIds.length;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null } as any)
      .in('id', deletedIds);
    setBulkDeleteOpen(false);
    if (error) {
      toast({ title: 'Fout', description: 'Kon taken niet verwijderen', variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['active-tasks'] });
    toast({
      title: `${count} taken verwijderd`,
      action: (
        <button
          className="text-sm font-medium underline"
          onClick={async () => {
            await supabase
              .from('tasks')
              .update({ deleted_at: null, deleted_by: null } as any)
              .in('id', deletedIds);
            queryClient.invalidateQueries({ queryKey: ['active-tasks'] });
          }}
        >
          Ongedaan maken
        </button>
      ),
    });
    clearSelection();
  };

  // Confirm single task delete (soft delete)
  const confirmSingleDelete = async () => {
    if (!deleteTask) return;
    const taskId = deleteTask.id;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null } as any)
      .eq('id', taskId);
    setDeleteTask(null);
    if (error) {
      toast({ title: 'Fout', description: 'Kon taak niet verwijderen', variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['active-tasks'] });
    toast({
      title: 'Taak verwijderd',
      action: (
        <button
          className="text-sm font-medium underline"
          onClick={async () => {
            await supabase
              .from('tasks')
              .update({ deleted_at: null, deleted_by: null } as any)
              .eq('id', taskId);
            queryClient.invalidateQueries({ queryKey: ['active-tasks'] });
          }}
        >
          Ongedaan maken
        </button>
      ),
    });
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
          setEditTask(task);
          setPanelTask(null);
        }}
        onDelete={(task) => {
          setDeleteTask(task);
          setPanelTask(null);
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

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={editTask}
        open={!!editTask}
        onOpenChange={(open) => !open && setEditTask(null)}
        onTaskUpdated={() => {
          setEditTask(null);
          queryClient.invalidateQueries({ queryKey: ['active-tasks'] });
        }}
      />

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Taken verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je {selectedIds.size} taken wilt verwijderen? Je kunt ze later terugvinden bij Verwijderde Taken.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Delete Confirmation */}
      <AlertDialog open={!!deleteTask} onOpenChange={(open) => !open && setDeleteTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Taak verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze taak wilt verwijderen? Je kunt de taak later terugvinden bij Verwijderde Taken.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSingleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
