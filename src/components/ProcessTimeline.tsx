import { useState } from "react";
import { CheckCircle2, Circle, Clock, SkipForward, User, Calendar, ArrowRight, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QuickSubtaskInput } from "./QuickSubtaskInput";

interface Subtask {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  order: number;
  due_at: string | null;
  assignee_id: string | null;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface ProcessTimelineProps {
  subtasks: Subtask[];
  onCompleteStep: (subtaskId: string) => void;
  onSkipStep: (subtaskId: string) => void;
  onResetStep?: (subtaskId: string) => void;
  onAddSubtask?: (title: string, assigneeId?: string, dueDate?: Date) => Promise<void>;
  teamMembers?: TeamMember[];
  compact?: boolean;
}

export function ProcessTimeline({ 
  subtasks, 
  onCompleteStep, 
  onSkipStep,
  onResetStep,
  onAddSubtask,
  teamMembers = [],
  compact = false 
}: ProcessTimelineProps) {
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  
  const sortedSubtasks = [...subtasks].sort((a, b) => a.order - b.order);
  const completedCount = sortedSubtasks.filter(s => s.status === 'completed').length;
  const totalCount = sortedSubtasks.length;

  const handleAddSubtask = async (title: string, assigneeId?: string, dueDate?: Date) => {
    if (onAddSubtask) {
      await onAddSubtask(title, assigneeId, dueDate);
      setIsAddingSubtask(false);
    }
  };

  const handleIconClick = (subtask: Subtask) => {
    if (subtask.status === 'completed' || subtask.status === 'skipped') {
      // Toggle back to pending
      if (onResetStep) {
        onResetStep(subtask.id);
      }
    } else {
      // Mark as complete (pending or active → completed)
      onCompleteStep(subtask.id);
    }
  };

  const getStatusIcon = (subtask: Subtask, isClickable: boolean = true) => {
    const iconClasses = cn(
      "h-4 w-4 transition-all duration-150",
      isClickable && !compact && "cursor-pointer hover:scale-110"
    );
    
    switch (subtask.status) {
      case 'completed':
        return (
          <CheckCircle2 
            className={cn(iconClasses, "text-green-500 hover:text-green-600")}
            onClick={() => isClickable && !compact && handleIconClick(subtask)}
          />
        );
      case 'active':
        return (
          <Clock 
            className={cn(iconClasses, "text-primary hover:text-primary/80")}
            onClick={() => isClickable && !compact && handleIconClick(subtask)}
          />
        );
      case 'skipped':
        return (
          <SkipForward 
            className={cn(iconClasses, "text-muted-foreground/70 hover:text-muted-foreground")}
            onClick={() => isClickable && !compact && handleIconClick(subtask)}
          />
        );
      default:
        return (
          <Circle 
            className={cn(iconClasses, "text-muted-foreground/60 hover:text-primary")}
            onClick={() => isClickable && !compact && handleIconClick(subtask)}
          />
        );
    }
  };

  const getTooltipText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Klik om terug te zetten naar pending';
      case 'skipped':
        return 'Klik om terug te zetten naar pending';
      case 'active':
        return 'Klik om af te ronden';
      default:
        return 'Klik om af te ronden';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800/50';
      case 'active':
        return 'bg-primary/5 border-primary/50';
      case 'skipped':
        return 'bg-muted/30 border-muted-foreground/10';
      default:
        return 'bg-background/50 border-border/60';
    }
  };

  if (sortedSubtasks.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Progress indicator */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {completedCount}/{totalCount} afgerond
          </span>
        </div>

        {/* Timeline */}
        <div className="space-y-3">
          {sortedSubtasks.map((subtask, index) => (
            <div key={subtask.id} className="flex gap-3">
              {/* Status indicator line */}
              <div className="flex flex-col items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-shrink-0">
                      {getStatusIcon(subtask, true)}
                    </div>
                  </TooltipTrigger>
                  {!compact && (
                    <TooltipContent>
                      <p>{getTooltipText(subtask.status)}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
                {index < sortedSubtasks.length - 1 && (
                  <div className={cn(
                    "w-px flex-1 mt-2 min-h-[20px]",
                    subtask.status === 'completed' 
                      ? "bg-gradient-to-b from-green-400 to-green-300/50" 
                      : "bg-border/60"
                  )} />
                )}
              </div>

            {/* Step content */}
            <div className={cn(
              "flex-1 rounded-xl border p-3.5 transition-all duration-150 group/step",
              getStatusColor(subtask.status)
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-medium text-sm leading-snug",
                      subtask.status === 'completed' && "line-through text-muted-foreground",
                      subtask.status === 'active' && "text-foreground"
                    )}>
                      {subtask.title}
                    </span>
                    {subtask.status === 'active' && (
                      <span className="text-xs text-primary flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        Actief
                      </span>
                    )}
                  </div>

                  {/* Indicator: zichtbaar in Actieverloop */}
                  {subtask.status === 'active' && (
                    <div className="flex items-center gap-1 text-[10px] text-primary/60 mt-0.5">
                      <ArrowRight className="h-3 w-3" />
                      <span>Zichtbaar in Actieverloop</span>
                    </div>
                  )}

                  {/* Assignee & Deadline */}
                  {!compact && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {subtask.profiles && (
                        <span className="flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          {subtask.profiles.name || subtask.profiles.email}
                        </span>
                      )}
                      {subtask.due_at && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(subtask.due_at), "d MMM yyyy", { locale: nl })}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons for active step - only visible on hover */}
                {subtask.status === 'active' && !compact && (
                  <div className="flex gap-1.5 opacity-0 group-hover/step:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={() => onCompleteStep(subtask.id)}
                      className="px-2.5 py-1 text-xs bg-primary/90 text-primary-foreground rounded-md hover:bg-primary transition-colors"
                    >
                      Voltooid
                    </button>
                    <button
                      onClick={() => onSkipStep(subtask.id)}
                      className="px-2.5 py-1 text-xs bg-muted/80 text-muted-foreground rounded-md hover:bg-muted transition-colors"
                    >
                      Overslaan
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

          {/* Quick add subtask */}
          {onAddSubtask && !compact && (
            <div className="flex gap-3">
              {/* Connector */}
              <div className="flex flex-col items-center">
                <div className="h-4 w-4 flex items-center justify-center">
                  <Plus className="h-3 w-3 text-muted-foreground/50" />
                </div>
              </div>

              {/* Add form or trigger */}
              {isAddingSubtask ? (
                <QuickSubtaskInput
                  onSubmit={handleAddSubtask}
                  onCancel={() => setIsAddingSubtask(false)}
                  teamMembers={teamMembers}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingSubtask(true)}
                  className={cn(
                    "flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                    "text-muted-foreground hover:text-foreground",
                    "border border-dashed border-border/60 hover:border-primary/30",
                    "hover:bg-muted/30 transition-colors"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  Stap toevoegen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
