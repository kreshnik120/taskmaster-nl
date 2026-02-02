import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { AlertTriangle, Calendar, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { generateTaskAriaLabel } from './utils/accessibility';
import type { TaskListTask } from './types';

interface TaskListCardsProps {
  tasks: TaskListTask[];
  onTaskSelect?: (task: TaskListTask) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-destructive text-destructive-foreground',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-secondary text-secondary-foreground',
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'Kritiek',
  HIGH: 'Hoog',
  MEDIUM: 'Gemiddeld',
  LOW: 'Laag',
};

function formatDueDate(dateString: string | null): string {
  if (!dateString) return '-';
  try {
    return format(new Date(dateString), 'd MMM', { locale: nl });
  } catch {
    return '-';
  }
}

function isOverdue(dateString: string | null): boolean {
  if (!dateString) return false;
  return new Date(dateString) < new Date();
}

/**
 * Mobile card view for task list
 * Uses role="list" for accessibility
 */
export function TaskListCards({ tasks, onTaskSelect }: TaskListCardsProps) {
  return (
    <div className="flex flex-col gap-3" role="list" aria-label="Takenlijst">
      {tasks.map((task) => {
        const overdue = isOverdue(task.due_at);

        return (
          <Card
            key={task.id}
            role="listitem"
            aria-label={generateTaskAriaLabel(task)}
            className={cn(
              "cursor-pointer transition-all duration-200",
              "bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm",
              "border-white/40 dark:border-white/12",
              "shadow-[0_2px_6px_hsla(215,25%,48%,0.06)]",
              "hover:bg-white/90 dark:hover:bg-slate-800/90",
              "hover:shadow-[0_4px_12px_hsla(215,25%,48%,0.12)]",
              overdue && "border-destructive/50"
            )}
            onClick={() => onTaskSelect?.(task)}
          >
            <CardContent className="p-4">
              {/* Title and priority */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-medium line-clamp-2 flex-1">{task.title}</h3>
                <Badge
                  className={`shrink-0 ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM}`}
                >
                  {PRIORITY_LABELS[task.priority] || task.priority}
                </Badge>
              </div>

              {/* Description */}
              {task.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {task.description}
                </p>
              )}

              {/* Meta info */}
              <div className="flex items-center justify-between text-sm">
                {/* Owner */}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span>{task.profiles?.name || 'Niet toegewezen'}</span>
                </div>

                {/* Deadline */}
                <div className={`flex items-center gap-1.5 ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {overdue && <AlertTriangle className="h-3.5 w-3.5" />}
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatDueDate(task.due_at)}</span>
                </div>
              </div>

              {/* Subtasks */}
              {task.subtask_count && task.subtask_count > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {task.completed_subtask_count || 0}/{task.subtask_count} subtaken voltooid
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
