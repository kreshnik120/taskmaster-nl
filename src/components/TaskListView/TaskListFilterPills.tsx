import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { QuickFilter, TaskListFilters } from './types';
import { QUICK_FILTER_LABELS } from './types';

interface TaskListFilterPillsProps {
  filters: TaskListFilters;
  onToggleFilter: (filter: QuickFilter) => void;
  onClearAll: () => void;
  className?: string;
}

const FILTER_OPTIONS: QuickFilter[] = [
  'open',
  'in_progress',
  'review',
  'critical',
  'due_today',
];

/**
 * Filter pills for quick task filtering
 * Horizontally scrollable on mobile
 */
export function TaskListFilterPills({
  filters,
  onToggleFilter,
  onClearAll,
  className,
}: TaskListFilterPillsProps) {
  const hasActiveFilters = filters.quickFilters.length > 0;

  return (
    <div className={cn('flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide', className)}>
      {/* "Alle" button - resets filters */}
      <Button
        variant={hasActiveFilters ? 'outline' : 'default'}
        size="sm"
        onClick={onClearAll}
        className={cn(
          'shrink-0 rounded-full text-xs font-medium transition-colors',
          !hasActiveFilters && 'bg-primary text-primary-foreground'
        )}
      >
        Alle
      </Button>

      {/* Filter pills */}
      {FILTER_OPTIONS.map((filter) => {
        const isActive = filters.quickFilters.includes(filter);
        return (
          <Button
            key={filter}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onToggleFilter(filter)}
            className={cn(
              'shrink-0 rounded-full text-xs font-medium transition-colors',
              isActive && 'bg-primary text-primary-foreground',
              filter === 'critical' && isActive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              filter === 'due_today' && isActive && 'bg-orange-500 text-white hover:bg-orange-600'
            )}
          >
            {QUICK_FILTER_LABELS[filter]}
          </Button>
        );
      })}
    </div>
  );
}
