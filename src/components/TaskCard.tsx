import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Edit, Calendar, ArrowRight, ListChecks, CheckCircle2, Circle, Clock, Repeat } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { logger } from "@/lib/logger";
import { UrgencyBadge } from "@/components/ui/urgency-badge";
import { ReminderDialog } from "@/components/ReminderDialog";
import { formatDateFull } from "@/lib/dateFormatters";
import { SUBTASK_TOKENS, ACTION_TOKENS } from "@/lib/constants/designTokens";
import { cn } from "@/lib/utils";
import { getAssigneeColor } from "@/hooks/useAssigneeColor";

const log = logger.create('TaskCard');

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignee_id: string | null;
  reporter_id?: string | null;
  due_at: string | null;
  completed_at: string | null;
  order_key: string;
  column_id?: string;
  application_id: string | null;
  recruitment_action_type: string | null;
  start_at: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  recurrence_rule?: string | null;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
  reporter?: {
    name: string | null;
    email: string | null;
  } | null;
  task_scoring_metadata?: {
    estimated_value_eur: number | null;
    complexity_score: number | null;
    business_impact_score: number | null;
    market_demand_factor: number | null;
  } | null;
}

// Helper: Check if task is pending acceptance (delegated but not yet accepted)
const isPendingAcceptance = (task: Task): boolean => {
  return !!(task.assignee_id && !task.accepted_at);
};

interface Subtask {
  id: string;
  title: string;
  task_id: string;
  status: string;
  assignee_id: string | null;
  due_at: string | null;
}

interface TaskCardProps {
  task: Task;
  subtasks?: Subtask[];
  onClick?: (task: Task) => void;
  onAccept?: (taskId: string) => void;
}

// Helper functions
const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
};

// Avatar colors now use centralized hook - removed local getAvatarColor

const getDaysInColumn = (task: Task) => {
  const lastUpdate = new Date(task.updated_at || task.created_at);
  const now = new Date();
  const days = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
  return days;
};

const getStatusDotColor = (days: number) => {
  if (days < 2) return "bg-muted-foreground/30";
  if (days < 5) return "bg-muted-foreground/50";
  return "bg-destructive/60";
};

const getHumanizedTime = (days: number) => {
  if (days === 0) return "Vandaag";
  if (days === 1) return "Gisteren";
  if (days < 7) return `${days} dagen`;
  const weeks = Math.floor(days / 7);
  return `${weeks} ${weeks === 1 ? 'week' : 'weken'}`;
};

// Removed priority colors and AI badge colors for clean, minimalist design

export function TaskCard({ task, subtasks = [], onClick, onAccept }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  // Click handler - @dnd-kit manages drag/click distinction via distance: 8
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on quick action buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    
    // Skip if currently dragging - @dnd-kit sets this automatically
    if (isDragging) {
      return;
    }
    
    onClick?.(task);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(task);
  };

  const [reminderOpen, setReminderOpen] = useState(false);

  const handleReminderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReminderOpen(true);
    log.log('Plan reminder voor', task.title);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const assigneeName = task.profiles?.name || 'Niet toegewezen';
  const daysInColumn = getDaysInColumn(task);
  const assigneeColor = getAssigneeColor(task.assignee_id);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="group touch-none"
      {...attributes}
      {...listeners}
    >
      <HoverCard openDelay={500}>
        <HoverCardTrigger asChild>
          <Card className="glass-task-card glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12 shadow-[0_2px_6px_hsla(234,45%,52%,0.06),0_8px_24px_hsla(234,45%,52%,0.10)] focus:outline-none focus:ring-2 focus:ring-tab-mijn-werk-500/30 focus:ring-offset-2 relative rounded-xl cursor-grab active:cursor-grabbing">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start gap-2">
                {/* Drag Handle - Visual indicator only */}
                <div
                  data-drag-handle
                  className="flex-shrink-0 pt-1 opacity-40 group-hover:opacity-80 transition-opacity"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Card Content - Clickable */}
                <div className="flex-1 min-w-0 space-y-2 cursor-pointer" onClick={handleCardClick}>
                  {/* Header: Avatar + Title */}
                  <div className="flex items-center gap-2">
                    {task.assignee_id && (
                      <Avatar className="h-6 w-6 flex-shrink-0 ring-2 ring-white/50 dark:ring-white/20 shadow-sm">
                        <AvatarFallback className={`text-xs font-medium ${assigneeColor.avatarBg} ${assigneeColor.avatarText}`}>
                          {getInitials(assigneeName)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <p className="text-sm font-medium text-foreground truncate flex-1">
                      {task.title}
                    </p>
                  </div>

                  {/* Pending Acceptance Badge + Accept Button */}
                  {isPendingAcceptance(task) && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                        <Clock className="h-3 w-3 mr-1" />
                        Wacht op acceptatie
                      </Badge>
                      {onAccept && (
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px] font-medium bg-green-600 hover:bg-green-700 text-white rounded-md"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAccept(task.id);
                          }}
                        >
                          Accepteren
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Reporter / Toegewezen door */}
                  {task.reporter?.name && task.reporter_id && task.reporter_id !== task.assignee_id && (
                    <p className="text-[10px] text-muted-foreground/70 italic">
                      Toegewezen door {task.reporter.name}
                    </p>
                  )}

                  {/* Description */}
                  {task.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {task.description}
                    </p>
                  )}

                  {/* Next Action Indicator - Unified tokens */}
                  {task.next_action && (
                    <div className={cn(ACTION_TOKENS.inline.wrapper, "mt-1")}>
                      <ArrowRight className={ACTION_TOKENS.inline.icon} />
                      <span className={cn(ACTION_TOKENS.inline.text, "truncate")}>{task.next_action}</span>
                    </div>
                  )}

                  {subtasks.length > 0 && (() => {
                    const completedCount = subtasks.filter(s => s.status === 'completed').length;
                    return (
                      <div className="mt-1.5 flex items-center gap-1 text-muted-foreground/60">
                        <ListChecks className="h-3 w-3" />
                        <span className="text-[10px]">{completedCount}/{subtasks.length}</span>
                      </div>
                    );
                  })()}

                  {task.recurrence_rule && (
                    <div className="flex items-center gap-1 text-muted-foreground/60" title={`Herhaalt ${
                      task.recurrence_rule === 'DAILY' ? 'dagelijks' :
                      task.recurrence_rule === 'WEEKLY' ? 'wekelijks' :
                      task.recurrence_rule === 'BIWEEKLY' ? 'tweewekelijks' : 'maandelijks'
                    }`}>
                      <Repeat className="h-3 w-3" />
                    </div>
                  )}

                  {/* Due date with urgency */}
                  {task.due_at && (
                    <UrgencyBadge dueAt={task.due_at} className="text-xs" />
                  )}

                  {/* Time in column */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      {getHumanizedTime(daysInColumn)}
                    </span>
                    <div className={`h-1.5 w-1.5 rounded-full ${getStatusDotColor(daysInColumn)}`} />
                  </div>
                </div>
              </div>
            </CardContent>

            {/* Quick Actions (Hover Only) - Glass styling */}
            <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/40 dark:border-white/15 shadow-[0_2px_8px_hsla(234,45%,52%,0.10)] hover:bg-white/90 dark:hover:bg-slate-800/90 hover:shadow-[0_4px_12px_hsla(234,45%,52%,0.15)] transition-all duration-200"
                onClick={handleEditClick}
                title="Bewerk taak"
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/40 dark:border-white/15 shadow-[0_2px_8px_hsla(234,45%,52%,0.10)] hover:bg-white/90 dark:hover:bg-slate-800/90 hover:shadow-[0_4px_12px_hsla(234,45%,52%,0.15)] transition-all duration-200"
                onClick={handleReminderClick}
                title="Plan herinnering"
              >
                <Calendar className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        </HoverCardTrigger>
      <HoverCardContent className="w-80 glass-layer-2 glass-light-bleed rounded-xl" side="right" align="start">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">{task.title}</h4>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            {/* Acceptatiestatus */}
            {isPendingAcceptance(task) && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-amber-500" />
                <span className="text-amber-700 dark:text-amber-400 font-medium">Wacht op acceptatie</span>
              </div>
            )}

            {/* Reporter */}
            {task.reporter?.name && task.reporter_id && task.reporter_id !== task.assignee_id && (
              <p className="text-muted-foreground/70 italic">
                Toegewezen door {task.reporter.name}
              </p>
            )}

            {task.description && (
              <p className="text-foreground/80">{task.description}</p>
            )}
            {task.assignee_id && (
              <p>👤 {assigneeName}</p>
            )}

            {/* Urgentie-badge */}
            {task.due_at && (
              <UrgencyBadge dueAt={task.due_at} className="text-xs" />
            )}

            {task.priority && (
              <p>⚡ Prioriteit: {task.priority}</p>
            )}

            {/* Herhaling */}
            {task.recurrence_rule && (
              <div className="flex items-center gap-1.5">
                <Repeat className="h-3 w-3" />
                <span>Herhaalt {
                  task.recurrence_rule === 'DAILY' ? 'dagelijks' :
                  task.recurrence_rule === 'WEEKLY' ? 'wekelijks' :
                  task.recurrence_rule === 'BIWEEKLY' ? 'tweewekelijks' : 'maandelijks'
                }</span>
              </div>
            )}

            {task.next_action && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                  Volgende actie
                </p>
                <p className="text-xs text-foreground/80 flex items-center gap-1.5">
                  <ArrowRight className="h-3 w-3 text-primary" />
                  {task.next_action}
                </p>
              </div>
            )}
            {subtasks.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                  Subtaken
                </p>
                <div className="space-y-1">
                  {subtasks.map(st => (
                    <p key={st.id} className={cn(
                      "text-xs flex items-center gap-1.5",
                      st.status === 'active' && "text-primary font-medium"
                    )}>
                      {st.status === 'completed' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : st.status === 'active' ? (
                        <div className={SUBTASK_TOKENS.inlinePreview.activeIcon} />
                      ) : (
                        <Circle className="h-3 w-3" />
                      )}
                      <span className="truncate">{st.title}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Tijd in kolom */}
            <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground/60">
                Aangemaakt: {format(new Date(task.created_at), "d MMM yyyy", { locale: nl })}
              </p>
              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <div className={`h-1.5 w-1.5 rounded-full ${getStatusDotColor(daysInColumn)}`} />
                {getHumanizedTime(daysInColumn)} in kolom
              </span>
            </div>
          </div>
        </div>
      </HoverCardContent>
      </HoverCard>
      <ReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        taskId={task.id}
        onSuccess={() => setReminderOpen(false)}
      />
    </div>
  );
}
