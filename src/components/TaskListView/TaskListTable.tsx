import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { AlertTriangle, Calendar } from 'lucide-react';
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
import { getAssigneeColor } from '@/hooks/useAssigneeColor';
import { generateTaskAriaLabel } from './utils/accessibility';
import { TaskListVirtualized } from './TaskListVirtualized';
import type { TaskListTask } from './types';

const VIRTUALIZATION_THRESHOLD = 50;

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
 * Automatically switches to virtualized mode for >50 tasks
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
  // Use virtualized table for large lists
  if (tasks.length > VIRTUALIZATION_THRESHOLD) {
    return (
      <TaskListVirtualized
        tasks={tasks}
        selectedIds={selectedIds}
        selectedIndex={selectedIndex}
        onTaskSelect={onTaskSelect}
        onToggleSelection={onToggleSelection}
        onToggleAll={onToggleAll}
        isAllSelected={isAllSelected}
        isPartiallySelected={isPartiallySelected}
      />
    );
  }

  return (
    <div className="rounded-xl border border-white/40 dark:border-white/12 overflow-hidden bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
      <Table role="grid" aria-rowcount={tasks.length + 1} aria-colcount={5}>
        <TableHeader>
          <TableRow role="row">
            <TableHead className="w-[40px]" role="columnheader">
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
            <TableHead className="w-[40%]" role="columnheader">Taak</TableHead>
            <TableHead role="columnheader">Eigenaar</TableHead>
            <TableHead className="w-[80px]" role="columnheader">Prioriteit</TableHead>
            <TableHead className="w-[100px]" role="columnheader">Deadline</TableHead>
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
                role="row"
                aria-rowindex={index + 2}
                aria-selected={isSelected}
                aria-label={generateTaskAriaLabel(task)}
                className={cn(
                  'cursor-pointer transition-all duration-150',
                  isSelected && 'bg-accent/50',
                  isFocused && 'ring-2 ring-primary ring-inset',
                  !isSelected && !isFocused && 'hover:bg-white/60 dark:hover:bg-slate-800/60'
                )}
                onClick={() => onTaskSelect?.(task)}
              >
                <TableCell role="gridcell" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelection(task.id)}
                    aria-label={`Selecteer ${task.title}`}
                  />
                </TableCell>
                <TableCell role="gridcell">
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
                <TableCell role="gridcell">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className={cn(
                        "text-xs",
                        getAssigneeColor(task.assignee_id).avatarBg,
                        getAssigneeColor(task.assignee_id).avatarText
                      )}>
                        {getInitials(task.profiles?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate max-w-[120px]">
                      {task.profiles?.name || 'Niet toegewezen'}
                    </span>
                  </div>
                </TableCell>
                <TableCell role="gridcell">
                  <Badge
                    className={cn(
                      'text-xs whitespace-nowrap',
                      PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM
                    )}
                  >
                    {PRIORITY_LABELS[task.priority] || task.priority}
                  </Badge>
                </TableCell>
                <TableCell role="gridcell">
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
