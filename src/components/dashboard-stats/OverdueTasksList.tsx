import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { OverdueTask } from "@/hooks/useDashboardStats";

interface OverdueTasksListProps {
  tasks: OverdueTask[];
  isLoading?: boolean;
  maxItems?: number;
}

export function OverdueTasksList({ tasks, isLoading, maxItems = 5 }: OverdueTasksListProps) {
  const navigate = useNavigate();
  const displayTasks = tasks.slice(0, maxItems);
  const hasMore = tasks.length > maxItems;

  const handleClick = (taskId: string) => {
    navigate(`/kanban/${taskId}`);
  };

  if (isLoading) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Verlopen Taken
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-muted/50 animate-pulse rounded" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5" />
            Verlopen Taken
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <span className="text-green-600">✓</span>
            Geen verlopen taken
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/20 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Verlopen Taken
          <Badge variant="destructive" className="ml-auto">
            {tasks.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {displayTasks.map((task) => (
          <div
            key={task.id}
            onClick={() => handleClick(task.id)}
            className="p-3 rounded-lg bg-background border cursor-pointer hover:bg-muted/50 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate group-hover:text-primary transition-colors">
                  {task.title}
                </p>
                <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                  {task.assignee && (
                    <span>👤 {task.assignee}</span>
                  )}
                  <span>
                    📅 {format(new Date(task.dueDate), 'd MMM', { locale: nl })}
                  </span>
                  {task.sourceName && (
                    <span>📄 {task.sourceName}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="destructive">
                  {task.daysOverdue}d verlopen
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          </div>
        ))}
        {hasMore && (
          <button
            onClick={() => navigate('/lijst?filter=overdue')}
            className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors py-2"
          >
            +{tasks.length - maxItems} meer bekijken
          </button>
        )}
      </CardContent>
    </Card>
  );
}
