 import { format, formatDistanceToNow } from 'date-fns';
 import { nl } from 'date-fns/locale';
 import { User, Clock, Check, Trash2, AlertTriangle, Calendar, ListTodo } from 'lucide-react';
 import { Badge } from '@/components/ui/badge';
 import { Button } from '@/components/ui/button';
 import { Checkbox } from '@/components/ui/checkbox';
 import { Avatar, AvatarFallback } from '@/components/ui/avatar';
 import { MobileTableCard, MobileTableCardList } from '@/components/ui/mobile-table-card';
 import { PriorityBadge } from '@/components/PriorityBadge';
 import { cn } from '@/lib/utils';
 import { getAssigneeColor } from '@/hooks/useAssigneeColor';
 import { getDateUrgency } from '@/lib/dateFormatters';
 
interface Task {
  id: string;
  sequence_number: number;
  title: string;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  next_action: string | null;
  completed_at: string | null;
  org_id: string;
  application_id: string | null;
  recruitment_action_type: string | null;
  assignee_id: string | null;
  reporter_id?: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  description: string | null;
  organizations: { name: string } | null;
  profiles: { 
    name: string | null;
    email: string | null;
  } | null;
  reporter?: {
    name: string | null;
    email: string | null;
  } | null;
  subtasks?: Array<{
    id: string;
    title: string;
    status: string;
  }>;
}
 
 interface EmbeddedListCardsProps {
   tasks: Task[];
   selectedTaskIds: Set<string>;
   onToggleSelection: (taskId: string) => void;
   onTaskClick: (task: Task) => void;
   onAcceptTask: (taskId: string) => void;
   onToggleComplete: (taskId: string, completedAt: string | null) => void;
   openDeleteDialog: (task: Task) => void;
   activeTimers: Record<string, { start: string; profiles?: { name: string | null } }>;
   getRunningTime: (start: string) => string;
   globalFilterUserId: string | null;
 }
 
 function getInitials(name: string | null | undefined): string {
   if (!name) return '?';
   return name
     .split(' ')
     .map(part => part[0])
     .join('')
     .toUpperCase()
     .slice(0, 2);
 }
 
 export function EmbeddedListCards({
   tasks,
   selectedTaskIds,
   onToggleSelection,
   onTaskClick,
   onAcceptTask,
   onToggleComplete,
   openDeleteDialog,
   activeTimers,
   getRunningTime,
   globalFilterUserId,
 }: EmbeddedListCardsProps) {
   return (
     <MobileTableCardList ariaLabel="Takenlijst">
       {tasks.map((task) => {
         const urgency = getDateUrgency(task.due_at);
         const activeTimer = activeTimers[task.id];
         const subtasks = task.subtasks || [];
         const completedSubtasks = subtasks.filter(s => s.status === 'completed').length;
         const isAccepted = !!task.accepted_by;
         const canAccept = !task.accepted_by && task.assignee_id === globalFilterUserId;
 
         return (
            <MobileTableCard
              key={task.id}
              ariaLabel={`Taak: ${task.title}`}
              highlight={urgency.status === 'overdue' ? 'destructive' : undefined}
              className="glass-card-slate"
             onClick={() => onTaskClick(task)}
             leading={
               <div className="flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
                 <Checkbox
                   checked={selectedTaskIds.has(task.id)}
                   onCheckedChange={() => onToggleSelection(task.id)}
                   className="h-5 w-5"
                   aria-label={`Selecteer ${task.title}`}
                 />
                 {task.assignee_id && (
                   <Avatar className="h-8 w-8">
                     <AvatarFallback
                       className={cn(
                         "text-xs font-medium",
                         getAssigneeColor(task.assignee_id).avatarBg,
                         getAssigneeColor(task.assignee_id).avatarText
                       )}
                     >
                       {getInitials(task.profiles?.name)}
                     </AvatarFallback>
                   </Avatar>
                 )}
               </div>
             }
             primary={
               <div className="flex items-center gap-2">
                 <span className="font-mono text-xs text-muted-foreground">
                   #{String(task.sequence_number).padStart(2, '0')}
                 </span>
                 <span>{task.title}</span>
               </div>
             }
             trailing={<PriorityBadge taskId={task.id} priority={task.priority} size="sm" />}
             secondary={
               <div className="flex flex-col gap-1">
                 {task.organizations?.name && (
                   <span className="text-xs">{task.organizations.name}</span>
                 )}
                 {task.next_action && (
                   <span className="text-xs italic">→ {task.next_action}</span>
                 )}
               </div>
             }
             meta={
               <>
                 {/* Owner status */}
                 <div className="flex items-center gap-1">
                   <User className="h-3.5 w-3.5" />
                   <span>{task.profiles?.name || 'Niet toegewezen'}</span>
                    {isAccepted && <Check className="h-3 w-3 text-green-600" />}
                  </div>

                  {/* Toegewezen door */}
                  {task.reporter?.name && task.reporter_id && task.reporter_id !== task.assignee_id && (
                    <div className="flex items-center gap-1 text-muted-foreground italic">
                      <span className="text-[10px]">Toegewezen door {task.reporter.name}</span>
                    </div>
                  )}
 
                 {/* Deadline */}
                 {task.due_at && (
                   <div className={cn("flex items-center gap-1", urgency.className)}>
                     {urgency.status === 'overdue' && <AlertTriangle className="h-3.5 w-3.5" />}
                     <Calendar className="h-3.5 w-3.5" />
                     <span>{format(new Date(task.due_at), 'd MMM', { locale: nl })}</span>
                     {urgency.badge && (
                       <Badge variant="outline" className="text-[10px] px-1 py-0">
                         {urgency.badge}
                       </Badge>
                     )}
                   </div>
                 )}
 
                 {/* Subtasks */}
                 {subtasks.length > 0 && (
                   <div className="flex items-center gap-1 text-muted-foreground">
                     <ListTodo className="h-3.5 w-3.5" />
                     <span>{completedSubtasks}/{subtasks.length}</span>
                   </div>
                 )}
 
                 {/* Active timer */}
                 {activeTimer && (
                   <Badge variant="secondary" className="text-xs bg-primary/20">
                     <Clock className="h-3 w-3 mr-1" />
                     {getRunningTime(activeTimer.start)}
                   </Badge>
                 )}
               </>
             }
             actions={
               <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                 {canAccept && (
                   <Button
                     variant="outline"
                     size="sm"
                     className="flex-1 h-10"
                     onClick={() => onAcceptTask(task.id)}
                   >
                     <Check className="h-4 w-4 mr-1" />
                     Accepteren
                   </Button>
                 )}
                 <Button
                   variant={task.completed_at ? "secondary" : "default"}
                   size="sm"
                   className="flex-1 h-10"
                   onClick={() => onToggleComplete(task.id, task.completed_at)}
                 >
                   <Check className="h-4 w-4 mr-1" />
                   {task.completed_at ? 'Heropenen' : 'Afronden'}
                 </Button>
                 <Button
                   variant="ghost"
                   size="sm"
                   className="h-10 w-10 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                   onClick={() => openDeleteDialog(task)}
                 >
                   <Trash2 className="h-4 w-4" />
                 </Button>
               </div>
             }
           />
         );
       })}
     </MobileTableCardList>
   );
 }