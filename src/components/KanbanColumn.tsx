import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignee_id?: string;
  due_at?: string;
  order_key: string;
  aiScore?: {
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
  };
}

interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  status: string;
  onUpdateName?: (columnId: string, newName: string) => Promise<void>;
  onTaskClick?: (task: Task) => void;
}

const statusColors: Record<string, string> = {
  BACKLOG: "bg-status-backlog",
  READY: "bg-status-ready",
  DOING: "bg-status-doing",
  BLOCKED: "bg-status-blocked",
  REVIEW: "bg-status-review",
  DONE: "bg-status-done",
};

export function KanbanColumn({ id, title, tasks, status, onUpdateName, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id });
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(title);
  const [isHovered, setIsHovered] = useState(false);

  const handleSave = async () => {
    const trimmedName = editedName.trim();
    if (!trimmedName || trimmedName === title) {
      setEditedName(title);
      setIsEditing(false);
      return;
    }

    if (trimmedName.length > 50) {
      setEditedName(title);
      setIsEditing(false);
      return;
    }

    if (onUpdateName) {
      await onUpdateName(id, trimmedName);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedName(title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <Card className="flex-shrink-0 w-80 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div 
            className="flex items-center gap-2 flex-1"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {isEditing ? (
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="h-7 text-sm font-medium"
                autoFocus
                maxLength={50}
              />
            ) : (
              <CardTitle 
                className="text-sm font-medium cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
                onClick={() => setIsEditing(true)}
              >
                {title}
                {isHovered && onUpdateName && (
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                )}
              </CardTitle>
            )}
          </div>
          <Badge variant="secondary" className="text-xs text-muted-foreground bg-muted/50">
            {tasks.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={setNodeRef} className="space-y-2 min-h-[200px]">
          {tasks.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Geen taken</p>
          ) : (
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onClick={onTaskClick}
                  aiScore={task.aiScore}
                />
              ))}
            </SortableContext>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
