import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignee_id?: string;
  due_at?: string;
  order_key: string;
}

interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  status: string;
}

const statusColors: Record<string, string> = {
  BACKLOG: "bg-status-backlog",
  READY: "bg-status-ready",
  DOING: "bg-status-doing",
  BLOCKED: "bg-status-blocked",
  REVIEW: "bg-status-review",
  DONE: "bg-status-done",
};

export function KanbanColumn({ id, title, tasks, status }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <Card className="flex-shrink-0 w-80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
            {title}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {tasks.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={setNodeRef} className="space-y-2 min-h-[200px]">
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </SortableContext>
        </div>
      </CardContent>
    </Card>
  );
}
