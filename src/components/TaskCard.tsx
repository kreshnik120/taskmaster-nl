import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { GripVertical, Clock } from "lucide-react";
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

// Removed priority colors and AI badge colors for clean, minimalist design

export function TaskCard({ task, onClick, aiScore }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on drag handle
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
      return;
    }
    onClick?.(task);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="cursor-pointer hover:shadow-sm transition-shadow border-border/50"
      {...attributes}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <button
            {...listeners}
            className="cursor-grab active:cursor-grabbing hover:text-foreground/80 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          </button>
          <div className="flex-1 min-w-0 space-y-1" onClick={handleCardClick}>
            <p className="text-sm font-medium text-foreground truncate">
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-muted-foreground truncate">
                {task.description}
              </p>
            )}
            {task.due_at && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                <Clock className="h-3 w-3" />
                {format(new Date(task.due_at), "d MMM", { locale: nl })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
