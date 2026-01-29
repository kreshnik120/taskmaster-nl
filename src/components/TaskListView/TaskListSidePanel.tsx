import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { X, User, Calendar, AlertTriangle, Edit, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TaskListTask } from './types';

interface TaskListSidePanelProps {
  task: TaskListTask | null;
  onClose: () => void;
  onEdit?: (task: TaskListTask) => void;
  onDelete?: (task: TaskListTask) => void;
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

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  try {
    return format(new Date(dateString), 'd MMMM yyyy', { locale: nl });
  } catch {
    return '-';
  }
}

function isOverdue(dateString: string | null): boolean {
  if (!dateString) return false;
  return new Date(dateString) < new Date();
}

/**
 * Notion-style side panel for task details
 * Non-modal, allows interaction with table behind it
 */
export function TaskListSidePanel({
  task,
  onClose,
  onEdit,
  onDelete,
}: TaskListSidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && task) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [task, onClose]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (task && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay adding listener to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [task, onClose]);

  // Focus trap
  useEffect(() => {
    if (task && panelRef.current) {
      panelRef.current.focus();
    }
  }, [task]);

  const overdue = task?.due_at ? isOverdue(task.due_at) : false;

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          ref={panelRef}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background border-l shadow-xl outline-none"
          tabIndex={-1}
          role="complementary"
          aria-label="Taak details"
          aria-describedby="task-panel-title"
        >
          <ScrollArea className="h-full">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <h2 id="task-panel-title" className="text-xl font-bold text-foreground pr-8 leading-tight">
                  {task.title}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="shrink-0 -mt-1 -mr-2"
                  aria-label="Sluiten"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <Separator className="mb-6" />

              {/* Properties */}
              <div className="space-y-4 mb-6">
                {/* Priority */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Prioriteit</span>
                  <Badge className={cn(PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM)}>
                    {PRIORITY_LABELS[task.priority] || task.priority}
                  </Badge>
                </div>

                {/* Deadline */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Deadline</span>
                  <div className={cn('flex items-center gap-2', overdue && 'text-destructive')}>
                    {overdue && <AlertTriangle className="h-4 w-4" />}
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{formatDate(task.due_at)}</span>
                  </div>
                </div>

                {/* Start date */}
                {task.start_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Startdatum</span>
                    <span className="text-sm">{formatDate(task.start_at)}</span>
                  </div>
                )}

                {/* Owner */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Eigenaar</span>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {getInitials(task.profiles?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">
                      {task.profiles?.name || 'Niet toegewezen'}
                    </span>
                  </div>
                </div>

                {/* Organization */}
                {task.organizations?.name && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Organisatie</span>
                    <span className="text-sm">{task.organizations.name}</span>
                  </div>
                )}
              </div>

              <Separator className="mb-6" />

              {/* Description */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Beschrijving</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {task.description || 'Geen beschrijving'}
                </p>
              </div>

              {/* Next Action */}
              {task.next_action && (
                <>
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Volgende actie</h3>
                    <p className="text-sm text-foreground">{task.next_action}</p>
                  </div>
                </>
              )}

              {/* Subtasks */}
              {task.subtasks && task.subtasks.length > 0 && (
                <>
                  <Separator className="mb-6" />
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                      Subtaken ({task.completed_subtask_count || 0}/{task.subtask_count || 0})
                    </h3>
                    <div className="space-y-2">
                      {task.subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <CheckCircle2
                            className={cn(
                              'h-4 w-4 shrink-0',
                              subtask.status === 'completed' || subtask.status === 'skipped'
                                ? 'text-green-500'
                                : 'text-muted-foreground'
                            )}
                          />
                          <span
                            className={cn(
                              subtask.status === 'completed' || subtask.status === 'skipped'
                                ? 'text-muted-foreground line-through'
                                : 'text-foreground'
                            )}
                          >
                            {subtask.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator className="mb-6" />

              {/* Actions */}
              <div className="flex gap-3">
                {onEdit && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => onEdit(task)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Bewerken
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(task)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Verwijderen
                  </Button>
                )}
              </div>
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
