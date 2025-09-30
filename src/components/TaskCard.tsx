import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignee_id?: string;
  due_at?: string;
  order_key: string;
}

interface TaskCardProps {
  task: Task;
}

const priorityColors: Record<string, string> = {
  LOW: "border-l-4 border-l-priority-low",
  MEDIUM: "border-l-4 border-l-priority-medium",
  HIGH: "border-l-4 border-l-priority-high",
  CRITICAL: "border-l-4 border-l-priority-critical",
};

const priorityLabels: Record<string, string> = {
  LOW: "Laag",
  MEDIUM: "Gemiddeld",
  HIGH: "Hoog",
  CRITICAL: "Kritiek",
};

export function TaskCard({ task }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
        priorityColors[task.priority]
      }`}
    >
      <CardHeader className="p-3">
        <div className="flex items-start gap-2">
          <div {...attributes} {...listeners} className="mt-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium line-clamp-2">{task.title}</CardTitle>
            {task.description && (
              <CardDescription className="text-xs mt-1 line-clamp-2">
                {task.description}
              </CardDescription>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {priorityLabels[task.priority]}
              </Badge>
              {task.due_at && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(task.due_at), "d MMM", { locale: nl })}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
