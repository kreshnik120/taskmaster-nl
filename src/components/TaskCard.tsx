import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { GripVertical, Edit, Calendar } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { UrgencyBadge, UrgencyDot } from "@/components/ui/urgency-badge";
import { formatDateFull } from "@/lib/dateFormatters";

const log = logger.create('TaskCard');

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignee_id: string | null;
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
  profiles: {
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

interface AIScore {
  priority_score: number;
  label: "NORMAL" | "CRITICAL" | "LOW_PRIORITY";
  breakdown?: {
    klant_impact: number;
    omzet_bescherming: number;
    overgang_voorbereiding: number;
    compliance: number;
    operationeel: number;
  };
  explanation?: string;
}

interface TaskCardProps {
  task: Task;
  onClick?: (task: Task) => void;
  aiScore?: AIScore;
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

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
};

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

export function TaskCard({ task, onClick, aiScore }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on drag handle or quick actions
    if ((e.target as HTMLElement).closest('[data-drag-handle]') || 
        (e.target as HTMLElement).closest('button')) {
      return;
    }
    onClick?.(task);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(task);
  };

  const handleReminderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: Open reminder dialog
    log.log('Plan reminder voor', task.title);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const assigneeName = task.profiles?.name || 'Niet toegewezen';
  const daysInColumn = getDaysInColumn(task);

  return (
    <HoverCard openDelay={500}>
      <HoverCardTrigger asChild>
        <div ref={setNodeRef} style={style} className="group">
          <Card className="hover:scale-[1.01] hover:shadow-md active:scale-[0.99] transition-all duration-200 ease-out border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 relative">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start gap-2">
                {/* Drag Handle */}
                <div
                  {...attributes}
                  {...listeners}
                  data-drag-handle
                  className="flex-shrink-0 pt-1 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-60 transition-opacity"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Card Content - Clickable */}
                <div className="flex-1 min-w-0 space-y-2 cursor-pointer" onClick={handleCardClick}>
                  {/* Header: Avatar + Title */}
                  <div className="flex items-center gap-2">
                    {task.assignee_id && (
                      <Avatar className="h-6 w-6 flex-shrink-0">
                        <AvatarFallback className={`text-xs font-medium ${getAvatarColor(assigneeName)}`}>
                          {getInitials(assigneeName)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <p className="text-sm font-medium text-foreground truncate flex-1">
                      {task.title}
                    </p>
                  </div>

                  {/* Description */}
                  {task.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {task.description}
                    </p>
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

            {/* Quick Actions (Hover Only) */}
            <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleEditClick}
                title="Bewerk taak"
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleReminderClick}
                title="Plan herinnering"
              >
                <Calendar className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="right" align="start">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">{task.title}</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            {task.description && (
              <p className="text-foreground/80">{task.description}</p>
            )}
            {task.assignee_id && (
              <p>👤 {assigneeName}</p>
            )}
            {task.due_at && (
              <p>📅 {formatDateFull(task.due_at)}</p>
            )}
            {task.priority && (
              <p>⚡ Prioriteit: {task.priority}</p>
            )}
            <p className="text-[10px] mt-2 text-muted-foreground/60">
              Aangemaakt: {format(new Date(task.created_at), "d MMM yyyy", { locale: nl })}
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
