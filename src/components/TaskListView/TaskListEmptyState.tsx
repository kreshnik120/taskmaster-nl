import { ClipboardList, Search } from 'lucide-react';

interface TaskListEmptyStateProps {
  filtered?: boolean;
}

/**
 * Empty state component for TaskListView
 * Shows different messages based on whether filters are active
 */
export function TaskListEmptyState({ filtered = false }: TaskListEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {filtered ? (
        <>
          <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            Geen taken gevonden voor deze zoekopdracht
          </h3>
          <p className="text-sm text-muted-foreground">
            Probeer andere zoektermen of verwijder filters
          </p>
        </>
      ) : (
        <>
          <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
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
