import { CheckCircle2, Circle, Clock, SkipForward } from "lucide-react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

interface ProcessTimelineProps {
  subtasks: Subtask[];
  onCompleteStep: (subtaskId: string) => void;
  onSkipStep: (subtaskId: string) => void;
  onResetStep?: (subtaskId: string) => void;
  compact?: boolean;
}

export function ProcessTimeline({ 
  subtasks, 
  onCompleteStep, 
  onSkipStep,
  onResetStep,
  compact = false 
}: ProcessTimelineProps) {
  const sortedSubtasks = [...subtasks].sort((a, b) => a.order - b.order);
  const completedCount = sortedSubtasks.filter(s => s.status === 'completed').length;
  const totalCount = sortedSubtasks.length;

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
      "h-5 w-5 transition-all",
      isClickable && !compact && "cursor-pointer hover:scale-110"
    );
    
    switch (subtask.status) {
      case 'completed':
        return (
          <CheckCircle2 
            className={cn(iconClasses, "text-green-600 hover:text-green-700")}
            onClick={() => isClickable && !compact && handleIconClick(subtask)}
          />
        );
      case 'active':
        return (
          <Clock 
            className={cn(iconClasses, "text-primary animate-pulse hover:text-primary/80")}
            onClick={() => isClickable && !compact && handleIconClick(subtask)}
          />
        );
      case 'skipped':
        return (
          <SkipForward 
            className={cn(iconClasses, "text-muted-foreground hover:text-foreground")}
            onClick={() => isClickable && !compact && handleIconClick(subtask)}
          />
        );
      default:
        return (
          <Circle 
            className={cn(iconClasses, "text-muted-foreground hover:text-primary")}
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
        return 'bg-green-100 border-green-300';
      case 'active':
        return 'bg-primary/10 border-primary';
      case 'skipped':
        return 'bg-muted border-muted-foreground/20';
      default:
        return 'bg-background border-border';
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
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
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
                    "w-0.5 flex-1 mt-2",
                    subtask.status === 'completed' ? "bg-green-300" : "bg-border"
                  )} />
                )}
              </div>

            {/* Step content */}
            <div className={cn(
              "flex-1 rounded-lg border p-3 transition-all",
              getStatusColor(subtask.status)
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-medium",
                      subtask.status === 'completed' && "line-through text-muted-foreground",
                      subtask.status === 'active' && "text-primary"
                    )}>
                      {subtask.title}
                    </span>
                    {subtask.status === 'active' && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                        Actief
                      </span>
                    )}
                  </div>

                  {/* Assignee & Deadline */}
                  {!compact && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {subtask.profiles && (
                        <span className="flex items-center gap-1">
                          👤 {subtask.profiles.name || subtask.profiles.email}
                        </span>
                      )}
                      {subtask.due_at && (
                        <span className="flex items-center gap-1">
                          📅 {format(parseISO(subtask.due_at), "d MMM yyyy", { locale: nl })}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons for active step */}
                {subtask.status === 'active' && !compact && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => onCompleteStep(subtask.id)}
                      className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                      Voltooid
                    </button>
                    <button
                      onClick={() => onSkipStep(subtask.id)}
                      className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
                    >
                      Overslaan
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
