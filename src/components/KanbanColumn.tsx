import { useState, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Pencil, ChevronDown, Inbox } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignee_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  order_key: string;
  column_id?: string;
  application_id: string | null;
  recruitment_action_type: string | null;
  start_at: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
  task_scoring_metadata?: {
    estimated_value_eur: number | null;
    complexity_score: number | null;
    business_impact_score: number | null;
    market_demand_factor: number | null;
  } | null;
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

const statusBorderColors: Record<string, string> = {
  BACKLOG: "border-t-2 border-t-slate-400",
  READY: "border-t-2 border-t-blue-400",
  DOING: "border-t-2 border-t-amber-400",
  BLOCKED: "border-t-2 border-t-red-400",
  REVIEW: "border-t-2 border-t-purple-400",
  DONE: "border-t-2 border-t-emerald-400",
};

const statusCountColors: Record<string, string> = {
  BACKLOG: "bg-slate-50 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400",
  READY: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  DOING: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  BLOCKED: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  REVIEW: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  DONE: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
};

export function KanbanColumn({ id, title, tasks, status, onUpdateName, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id });
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(title);
  const [isHovered, setIsHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem(`kanban-column-${status}-open`);
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem(`kanban-column-${status}-open`, String(isOpen));
  }, [isOpen, status]);

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
    <Card className={`flex-shrink-0 w-80 bg-card ${statusBorderColors[status] || ""}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-2 flex-1 hover:opacity-80 transition-opacity">
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-0" : "-rotate-90"
                }`}
              />
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
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <CardTitle
                    className="text-sm font-medium cursor-pointer hover:text-foreground/80 transition-colors flex items-center gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                  >
                    {title.charAt(0).toUpperCase() + title.slice(1)}
                    {isHovered && onUpdateName && (
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    )}
                  </CardTitle>
                )}
              </div>
            </CollapsibleTrigger>
            <Badge className={`text-xs font-medium ${statusCountColors[status] || "bg-muted/50 text-muted-foreground"}`}>
              {tasks.length}
            </Badge>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <div ref={setNodeRef} className="space-y-2 min-h-[200px]">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground/60">Geen taken</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Sleep hier om toe te voegen</p>
                </div>
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
