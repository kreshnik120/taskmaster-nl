import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { AlertTriangle, Calendar, User } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { TaskListTask } from './types';

interface TaskListTableProps {
  tasks: TaskListTask[];
  selectedIds: Set<string>;
  selectedIndex: number;
  onTaskSelect?: (task: TaskListTask) => void;
  onToggleSelection: (id: string) => void;
  onToggleAll: () => void;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
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

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDueDate(dateString: string | null): string {
  if (!dateString) return '-';
  try {
    return format(new Date(dateString), 'd MMM yyyy', { locale: nl });
  } catch {
    return '-';
  }
}

function isOverdue(dateString: string | null): boolean {
  if (!dateString) return false;
  return new Date(dateString) < new Date();
}

/**
 * Desktop table view for task list with checkboxes
 * 5-column layout: Checkbox, Task, Owner, Priority, Deadline
 */
export function TaskListTable({
  tasks,
  selectedIds,
  selectedIndex,
  onTaskSelect,
  onToggleSelection,
  onToggleAll,
  isAllSelected,
  isPartiallySelected,
}: TaskListTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={isAllSelected}
                ref={(el) => {
                  if (el) {
                    (el as unknown as HTMLInputElement).indeterminate = isPartiallySelected;
                  }
                }}
                onCheckedChange={onToggleAll}
                aria-label="Selecteer alle taken"
              />
            </TableHead>
            <TableHead className="w-[40%]">Taak</TableHead>
            <TableHead>Eigenaar</TableHead>
            <TableHead className="w-[80px]">Prioriteit</TableHead>
            <TableHead className="w-[100px]">Deadline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task, index) => {
            const overdue = isOverdue(task.due_at);
            const isSelected = selectedIds.has(task.id);
            const isFocused = index === selectedIndex;

            return (
              <TableRow
                key={task.id}
                data-index={index}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected && 'bg-accent/50',
                  isFocused && 'ring-2 ring-primary ring-inset',
                  !isSelected && !isFocused && 'hover:bg-muted/50'
                )}
                aria-selected={isSelected}
                onClick={() => onTaskSelect?.(task)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelection(task.id)}
                    aria-label={`Selecteer ${task.title}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium line-clamp-1">{task.title}</span>
                    {task.description && (
                      <span className="text-sm text-muted-foreground line-clamp-1">
                        {task.description}
                      </span>
                    )}
                    {task.subtask_count && task.subtask_count > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {task.completed_subtask_count || 0}/{task.subtask_count} subtaken
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {getInitials(task.profiles?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate max-w-[120px]">
                      {task.profiles?.name || 'Niet toegewezen'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      'text-xs whitespace-nowrap',
                      PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM
                    )}
                  >
                    {PRIORITY_LABELS[task.priority] || task.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div
                    className={cn(
                      'flex items-center gap-1.5 text-sm',
                      overdue && 'text-destructive font-medium'
                    )}
                  >
                    {overdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{formatDueDate(task.due_at)}</span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
