import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TaskListBulkActionsProps {
  selectedCount: number;
  onStatusChange?: (status: string) => void;
  onPriorityChange?: (priority: string) => void;
  onDelete?: () => void;
  onClear: () => void;
  className?: string;
}

const STATUS_OPTIONS = [
  { value: 'BACKLOG', label: 'Backlog' },
  { value: 'READY', label: 'Ready' },
  { value: 'DOING', label: 'In uitvoering' },
  { value: 'BLOCKED', label: 'Geblokkeerd' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'DONE', label: 'Afgerond' },
];

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Laag' },
  { value: 'MEDIUM', label: 'Gemiddeld' },
  { value: 'HIGH', label: 'Hoog' },
  { value: 'CRITICAL', label: 'Kritiek' },
];

/**
 * Floating bulk action bar for selected tasks
 * Appears at bottom center when tasks are selected
 */
export function TaskListBulkActions({
  selectedCount,
  onStatusChange,
  onPriorityChange,
  onDelete,
  onClear,
  className,
}: TaskListBulkActionsProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          role="toolbar"
          aria-label="Bulk acties"
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
            'bg-background border rounded-lg shadow-lg',
            'flex items-center gap-2 px-4 py-3',
            className
          )}
        >
          {/* Selection count */}
          <div className="flex items-center gap-2 pr-3 border-r">
            <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
              {selectedCount}
            </span>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {selectedCount === 1 ? 'taak geselecteerd' : 'taken geselecteerd'}
            </span>
          </div>

          {/* Status change dropdown */}
          {onStatusChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-sm">
                  Status wijzigen
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="bg-popover">
                {STATUS_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => onStatusChange(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Priority change dropdown */}
          {onPriorityChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-sm">
                  Prioriteit wijzigen
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="bg-popover">
                {PRIORITY_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => onPriorityChange(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Delete button */}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

          {/* Clear selection */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            className="ml-1"
            aria-label="Deselecteren"
          >
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
