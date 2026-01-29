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
import type { TaskListTask } from './types';

interface TaskListTableProps {
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
 * Desktop table view for task list
 */
export function TaskListTable({ tasks, onTaskSelect }: TaskListTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Taak</TableHead>
            <TableHead>Eigenaar</TableHead>
            <TableHead>Prioriteit</TableHead>
            <TableHead>Deadline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const overdue = isOverdue(task.due_at);
            
            return (
              <TableRow
                key={task.id}
                className={`cursor-pointer hover:bg-muted/50 ${
                  onTaskSelect ? 'cursor-pointer' : ''
                }`}
                onClick={() => onTaskSelect?.(task)}
              >
                <TableCell>
                  <div className="flex flex-col gap-1">
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
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {task.profiles?.name || 'Niet toegewezen'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM}
                  >
                    {PRIORITY_LABELS[task.priority] || task.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className={`flex items-center gap-2 ${overdue ? 'text-destructive' : ''}`}>
                    {overdue && <AlertTriangle className="h-4 w-4" />}
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{formatDueDate(task.due_at)}</span>
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
