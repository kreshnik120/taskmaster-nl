import { useIsMobile } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { useTaskListFilters } from './hooks/useTaskListFilters';
import { useTaskListData } from './hooks/useTaskListData';
import { TaskListToolbar } from './TaskListToolbar';
import { TaskListTable } from './TaskListTable';
import { TaskListCards } from './TaskListCards';
import { TaskListEmptyState } from './TaskListEmptyState';
import type { TaskListViewProps } from './types';

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
 */
export function TaskListView({
  userId,
  showToolbar = true,
  limit,
  onTaskSelect,
  className
}: TaskListViewProps) {
  const isMobile = useIsMobile();
  const { filters, setFilters } = useTaskListFilters();
  const { tasks, totalCount, isLoading, error } = useTaskListData({
    userId,
    filters,
    limit
  });

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

  // Empty state (only show if no tasks and toolbar is hidden or no search active)
  if (tasks.length === 0 && !showToolbar) {
    return (
      <div className={className}>
        <TaskListEmptyState filtered={!!filters.searchQuery} />
      </div>
    );
  }

  return (
    <div className={className}>
      {showToolbar && (
        <TaskListToolbar
          filters={filters}
          onChange={setFilters}
          taskCount={tasks.length}
          totalCount={totalCount}
        />
      )}

      {tasks.length === 0 ? (
        <TaskListEmptyState filtered={!!filters.searchQuery} />
      ) : isMobile ? (
        <TaskListCards tasks={tasks} onTaskSelect={onTaskSelect} />
      ) : (
        <TaskListTable tasks={tasks} onTaskSelect={onTaskSelect} />
      )}
    </div>
  );
}
