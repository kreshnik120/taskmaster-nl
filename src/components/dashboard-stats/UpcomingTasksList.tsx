import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { UpcomingTask } from "@/hooks/useDashboardStats";

interface UpcomingTasksListProps {
  tasks: UpcomingTask[];
  isLoading?: boolean;
  maxItems?: number;
}

export function UpcomingTasksList({ tasks, isLoading, maxItems = 5 }: UpcomingTasksListProps) {
  const navigate = useNavigate();
  const displayTasks = tasks.slice(0, maxItems);
  const hasMore = tasks.length > maxItems;

  const handleClick = (taskId: string) => {
    navigate(`/kanban/${taskId}`);
  };

  const getUrgencyColor = (daysUntil: number) => {
    if (daysUntil === 0) return 'destructive';
    if (daysUntil <= 2) return 'default';
    return 'secondary';
  };

  const getUrgencyLabel = (daysUntil: number) => {
    if (daysUntil === 0) return 'Vandaag';
    if (daysUntil === 1) return 'Morgen';
    return `${daysUntil} dagen`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Komende Week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-muted animate-pulse rounded" />
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
            <Calendar className="h-5 w-5" />
            Komende Week
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Geen taken gepland voor de komende 7 dagen
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="h-5 w-5" />
          Komende Week
          <Badge variant="secondary" className="ml-auto">
            {tasks.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {displayTasks.map((task) => (
          <div
            key={task.id}
            onClick={() => handleClick(task.id)}
            className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors group"
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
                    📅 {format(new Date(task.dueDate), 'EEEE d MMM', { locale: nl })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={getUrgencyColor(task.daysUntil)}>
                  {getUrgencyLabel(task.daysUntil)}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          </div>
        ))}
        {hasMore && (
          <button
            onClick={() => navigate('/kalender')}
            className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors py-2"
          >
            +{tasks.length - maxItems} meer bekijken
          </button>
        )}
      </CardContent>
    </Card>
  );
}
