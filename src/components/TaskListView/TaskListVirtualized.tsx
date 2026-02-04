import { forwardRef } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
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
import type { TaskListTask } from './types';

interface TaskListVirtualizedProps {
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

// Custom TableRow component that applies row-level props
interface VirtualizedRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-index'?: number;
  'aria-rowindex'?: number;
  'aria-selected'?: boolean;
  'aria-label'?: string;
}

const VirtualizedTableRow = forwardRef<HTMLTableRowElement, VirtualizedRowProps>(
  (props, ref) => {
    const { className, ...rest } = props;
    return (
      <TableRow
        ref={ref}
        className={cn('cursor-pointer transition-colors', className)}
        {...rest}
      />
    );
  }
);
VirtualizedTableRow.displayName = 'VirtualizedTableRow';

// Custom components for TableVirtuoso
const TableComponents = {
  Table: forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
    (props, ref) => (
      <Table
        ref={ref}
        {...props}
        role="grid"
        aria-colcount={5}
      />
    )
  ),
  TableHead: forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
    (props, ref) => <TableHeader ref={ref} {...props} />
  ),
  TableBody: forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
    (props, ref) => <TableBody ref={ref} {...props} />
  ),
  TableRow: VirtualizedTableRow,
};

/**
 * Virtualized table for large task lists (>50 items)
 * Uses react-virtuoso for efficient rendering
 */
export function TaskListVirtualized({
  tasks,
  selectedIds,
  selectedIndex,
  onTaskSelect,
  onToggleSelection,
  onToggleAll,
  isAllSelected,
  isPartiallySelected,
}: TaskListVirtualizedProps) {
  const ROW_HEIGHT = 64;
  const OVERSCAN = 5;

  return (
    <div className="rounded-md border" aria-rowcount={tasks.length + 1}>
      <TableVirtuoso
        style={{ height: Math.min(tasks.length * ROW_HEIGHT + 48, 600) }}
        data={tasks}
        overscan={OVERSCAN}
        fixedHeaderContent={() => (
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
        )}
        components={{
          ...TableComponents,
          TableRow: forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement> & { 'data-item-index'?: number }>(
            (props, ref) => {
              const itemIndex = props['data-item-index'];
              const task = itemIndex !== undefined ? tasks[itemIndex] : null;
              const isSelected = task ? selectedIds.has(task.id) : false;
              const isFocused = itemIndex === selectedIndex;
              
              return (
                <TableRow
                  ref={ref}
                  {...props}
                  role="row"
                  aria-rowindex={itemIndex !== undefined ? itemIndex + 2 : undefined}
                  aria-selected={isSelected}
                  aria-label={task ? generateTaskAriaLabel(task) : undefined}
                  className={cn(
                    props.className,
                    'cursor-pointer transition-colors',
                    isSelected && 'bg-accent/50',
                    isFocused && 'ring-2 ring-primary ring-inset',
                    !isSelected && !isFocused && 'hover:bg-muted/50'
                  )}
                  onClick={() => task && onTaskSelect?.(task)}
                />
              );
            }
          ),
        }}
        itemContent={(index, task) => {
          const overdue = isOverdue(task.due_at);
          const isSelected = selectedIds.has(task.id);

          return (
            <>
              <TableCell
                role="gridcell"
                onClick={(e) => e.stopPropagation()}
              >
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
            </>
          );
        }}
      />
    </div>
  );
}
