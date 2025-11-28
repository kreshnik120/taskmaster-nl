import { Button } from "@/components/ui/button";
import { Play, Square, Loader2 } from "lucide-react";
import { useTaskTimer } from "@/hooks/useTaskTimer";
import { cn } from "@/lib/utils";

interface QuickTimerButtonProps {
  taskId: string;
  className?: string;
}

export function QuickTimerButton({ taskId, className }: QuickTimerButtonProps) {
  const { isTimerActive, startTimer, stopTimer, isLoading } = useTaskTimer(taskId);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTimerActive) {
      await stopTimer();
    } else {
      await startTimer();
    }
  };

  return (
    <Button
      variant={isTimerActive ? "default" : "ghost"}
      size="icon"
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        "h-8 w-8 transition-all",
        isTimerActive ? "bg-green-500 hover:bg-green-600 text-white animate-pulse" : "opacity-0 group-hover:opacity-100 hover:bg-green-500/10 hover:text-green-500",
        className
      )}
      title={isTimerActive ? "Stop timer" : "Start timer"}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isTimerActive ? (
        <Square className="h-4 w-4" />
      ) : (
        <Play className="h-4 w-4" />
      )}
    </Button>
  );
}
