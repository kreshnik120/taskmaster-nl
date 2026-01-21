import { useState, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Pencil, ChevronDown, Inbox, ListTree } from "lucide-react";
import { UrgencyBadge } from "@/components/ui/urgency-badge";

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

interface Subtask {
  id: string;
  title: string;
  task_id: string;
  status: string;
  assignee_id: string | null;
  due_at: string | null;
  order_key: number;
  parent_task?: {
    id: string;
    title: string;
    column_id: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };
}

interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  subtasks?: Subtask[];
  status: string;
  isCollapsed?: boolean;
  onUpdateName?: (columnId: string, newName: string) => Promise<void>;
  onToggleCollapse?: (columnId: string, collapsed: boolean) => Promise<void>;
  onTaskClick?: (task: Task) => void;
  onSubtaskClick?: (subtask: Subtask) => void;
}

const statusBorderColors: Record<string, string> = {
  BACKLOG: "border-t-4 border-t-status-backlog",
  READY: "border-t-4 border-t-status-ready",
  DOING: "border-t-4 border-t-status-doing",
  BLOCKED: "border-t-4 border-t-status-blocked",
  REVIEW: "border-t-4 border-t-status-review",
  DONE: "border-t-4 border-t-status-done",
};

const statusCountColors: Record<string, string> = {
  BACKLOG: "bg-status-backlog/10 text-status-backlog",
  READY: "bg-status-ready/10 text-status-ready",
  DOING: "bg-status-doing/10 text-status-doing",
  BLOCKED: "bg-status-blocked/10 text-status-blocked",
  REVIEW: "bg-status-review/10 text-status-review",
  DONE: "bg-status-done/10 text-status-done",
};

export function KanbanColumn({ id, title, tasks, subtasks = [], status, isCollapsed, onUpdateName, onToggleCollapse, onTaskClick, onSubtaskClick }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id });
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(title);
  const [isHovered, setIsHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(!isCollapsed);

  // Sync with database value when it changes
  useEffect(() => {
    setIsOpen(!isCollapsed);
  }, [isCollapsed]);

  // Sync editedName wanneer title prop extern verandert
  useEffect(() => {
    if (!isEditing) {
      setEditedName(title);
    }
  }, [title, isEditing]);

  const handleToggleOpen = async (open: boolean) => {
    setIsOpen(open);
    if (onToggleCollapse) {
      await onToggleCollapse(id, !open);
    }
  };

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
      <Collapsible open={isOpen} onOpenChange={handleToggleOpen}>
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
              {tasks.length + subtasks.length}
            </Badge>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <div ref={setNodeRef} className="space-y-2 min-h-[200px]">
              {tasks.length === 0 && subtasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground/60">Geen taken</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Sleep hier om toe te voegen</p>
                </div>
              ) : (
                <>
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
                  
                  {/* Subtaken toegewezen aan jou */}
                  {subtasks.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                        <ListTree className="h-3 w-3" />
                        Mijn subtaken ({subtasks.length})
                      </p>
                      {subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          onClick={() => onSubtaskClick?.(subtask)}
                          className="group relative bg-muted/30 border border-border/50 rounded-md p-2.5 cursor-pointer hover:bg-muted/50 hover:border-primary/30 transition-all"
                        >
                          <div className="flex items-start gap-2">
                            <ListTree className="h-3.5 w-3.5 text-primary/60 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {subtask.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                ↳ {subtask.parent_task?.title}
                              </p>
                              {subtask.due_at && (
                                <div className="mt-1.5">
                                  <UrgencyBadge dueAt={subtask.due_at} className="text-xs" />
                                </div>
                              )}
                            </div>
                            {subtask.parent_task?.priority && (
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] px-1.5 py-0 ${
                                  subtask.parent_task.priority === 'CRITICAL' ? 'border-destructive/50 text-destructive' :
                                  subtask.parent_task.priority === 'HIGH' ? 'border-orange-500/50 text-orange-600' :
                                  'border-muted-foreground/30 text-muted-foreground'
                                }`}
                              >
                                {subtask.parent_task.priority === 'CRITICAL' ? '!' : 
                                 subtask.parent_task.priority === 'HIGH' ? '↑' : '·'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
