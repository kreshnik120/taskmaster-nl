import { ClipboardList, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskListEmptyStateProps {
  filtered?: boolean;
}

/**
 * Empty state component for TaskListView
 * Shows different messages based on whether filters are active
 */
export function TaskListEmptyState({ filtered = false }: TaskListEmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-8 text-center",
      "rounded-xl",
      "bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm",
      "border border-white/30 dark:border-white/12",
      "shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
    )}>
      {filtered ? (
        <>
          <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
            <Search className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            Geen taken gevonden voor deze zoekopdracht
          </h3>
          <p className="text-sm text-muted-foreground">
            Probeer andere zoektermen of verwijder filters
          </p>
        </>
      ) : (
        <>
          <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
            <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            Geen taken gevonden
          </h3>
          <p className="text-sm text-muted-foreground">
            Er zijn momenteel geen actieve taken
          </p>
        </>
      )}
    </div>
  );
}
