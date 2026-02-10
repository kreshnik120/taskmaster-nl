import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, User, Edit, Check, Play, Square, ArrowRight, ListChecks } from "lucide-react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTaskTimer } from "@/hooks/useTaskTimer";
import { ACTION_TOKENS } from "@/lib/constants/designTokens";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_at: string | null;
  next_action?: string | null;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
  subtasks?: Array<{
    id: string;
    title: string;
    status: string;
  }>;
}

interface TaskItemProps {
  task: Task;
  onTaskClick: (task: Task) => void;
  onCompleteTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
}

export function TaskItem({ task, onTaskClick, onCompleteTask, onEditTask }: TaskItemProps) {
  const { isTimerActive, elapsedTime, startTimer, stopTimer, isLoading } = useTaskTimer(task.id);
  
  const subtasksCompleted = task.subtasks?.filter((s: any) => s.status === 'completed').length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  const progressPercentage = subtasksTotal > 0 ? (subtasksCompleted / subtasksTotal) * 100 : 0;

  const handleTimerClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTimerActive) {
      await stopTimer();
    } else {
      await startTimer();
    }
  };

  return (
    <div 
      className={cn(
        "border rounded-lg bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200 group relative",
        isTimerActive && "border-green-500/50 shadow-lg shadow-green-500/10"
      )}
    >
      {/* Timer Active Indicator */}
      {isTimerActive && (
        <div className="absolute -top-2 -right-2 z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75" />
            <Badge variant="default" className="relative bg-green-500 text-white border-2 border-background">
              <Clock className="h-3 w-3 mr-1 animate-pulse" />
              {elapsedTime.split(' ')[0]}
            </Badge>
          </div>
        </div>
      )}

      <div 
        className="flex items-center justify-between p-4 cursor-pointer group-hover:bg-accent/30 transition-colors"
        onClick={() => onTaskClick(task)}
      >
        <div className="flex-1">
          <h3 className="font-medium mb-1 group-hover:text-primary transition-colors">{task.title}</h3>
          
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {task.priority && (
              <Badge 
                variant={
                  task.priority === 'HIGH' || task.priority === 'CRITICAL' ? 'destructive' : 
                  task.priority === 'MEDIUM' ? 'default' : 'outline'
                }
              >
                {task.priority === 'LOW' && 'Laag'}
                {task.priority === 'MEDIUM' && 'Normaal'}
                {task.priority === 'HIGH' && 'Hoog'}
                {task.priority === 'CRITICAL' && 'Kritiek'}
              </Badge>
            )}
            
            {task.due_at && (
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>{format(parseISO(task.due_at), "d MMM", { locale: nl })}</span>
              </div>
            )}
            
            {task.profiles && (
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span>{task.profiles.name || task.profiles.email}</span>
              </div>
            )}
          </div>
            
          {/* Next Action Indicator - Design Tokens */}
          {task.next_action && (
            <div className={cn(ACTION_TOKENS.compact.wrapper, "mt-2")}>
              <ArrowRight className={cn(ACTION_TOKENS.compact.icon, "shrink-0")} />
              <span className={cn(ACTION_TOKENS.compact.text, "truncate")}>{task.next_action}</span>
            </div>
          )}

          {subtasksTotal > 0 && (
            <div className="mt-1.5 flex items-center gap-1 text-muted-foreground/60">
              <ListChecks className="h-3 w-3" />
              <span className="text-[10px]">{subtasksCompleted}/{subtasksTotal}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 ml-4">
          <Button
            variant={isTimerActive ? "destructive" : "ghost"}
            size="icon"
            className={cn(
              "h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity",
              isTimerActive && "opacity-100 animate-pulse"
            )}
            onClick={handleTimerClick}
            disabled={isLoading}
          >
            {isTimerActive ? (
              <Square className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation();
              onCompleteTask(task.id);
            }}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onEditTask(task);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
