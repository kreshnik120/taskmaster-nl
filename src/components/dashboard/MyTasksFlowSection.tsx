import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay, 
  DragStartEvent, 
  PointerSensor, 
  useSensor, 
  useSensors,
  useDroppable 
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "@/components/TaskCard";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Kanban, 
  ArrowRight, 
  Loader2, 
  MoreHorizontal, 
  CheckCircle2,
  Inbox 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User } from "@supabase/supabase-js";

// ENTERPRISE CONFIG
const MAX_VISIBLE_TASKS = 5;
const COLUMNS_TO_SHOW: ("BACKLOG" | "READY" | "DOING" | "BLOCKED" | "REVIEW")[] = [
  "BACKLOG", "READY", "DOING", "BLOCKED", "REVIEW"
];

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignee_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  column_id: string | null;
  order_key: string;
  application_id: string | null;
  recruitment_action_type: string | null;
  start_at: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
  profiles: { name: string | null; email: string | null } | null;
}

interface Column {
  id: string;
  name: string;
  status: string;
  order: number;
}

// Droppable Column Wrapper
function DroppableColumn({ 
  column, 
  children 
}: { 
  column: Column; 
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`Kolom ${column.name}`}
      className={`flex-shrink-0 w-72 md:w-64 snap-start transition-colors duration-200 ${
        isOver ? "bg-primary/5 rounded-lg" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function MyTasksFlowSection() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Accessibility: status message for screen readers
  const [statusMessage, setStatusMessage] = useState("");

  // Drag sensors with distance threshold
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    })
  );

  // Auth check
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Load data when user is available
  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      // Load columns
      const { data: columnsData, error: columnsError } = await supabase
        .from("columns")
        .select("id, name, status, order")
        .in("status", COLUMNS_TO_SHOW)
        .order("order");

      if (columnsError) throw columnsError;
      setColumns(columnsData || []);

      // Load MY tasks only (filtered on current user)
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select(`
          id, title, description, priority, assignee_id,
          due_at, completed_at, column_id, order_key,
          application_id, recruitment_action_type, start_at,
          next_action, created_at, updated_at,
          profiles:profiles!tasks_assignee_id_fkey(name, email)
        `)
        .eq("assignee_id", user.id)
        .is("deleted_at", null)
        .is("completed_at", null)
        .order("due_at", { ascending: true });

      if (tasksError) throw tasksError;
      setTasks(tasksData || []);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Fout bij laden van taken");
    } finally {
      setLoading(false);
    }
  };

  // Get tasks for column
  const getTasksForColumn = (columnId: string): Task[] => {
    const column = columns.find(c => c.id === columnId);
    return tasks.filter(t =>
      t.column_id === columnId ||
      (column?.status === "BACKLOG" && !t.column_id)
    );
  };

  // Visible tasks (max 5) and overflow count
  const getVisibleTasks = (columnId: string) => {
    const allTasks = getTasksForColumn(columnId);
    return {
      visible: allTasks.slice(0, MAX_VISIBLE_TASKS),
      overflow: Math.max(0, allTasks.length - MAX_VISIBLE_TASKS),
      total: allTasks.length
    };
  };

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Determine target column
    let newColumnId: string;
    const isColumnId = columns.some(c => c.id === over.id);
    if (isColumnId) {
      newColumnId = over.id as string;
    } else {
      const targetTask = tasks.find(t => t.id === over.id);
      if (!targetTask?.column_id) return;
      newColumnId = targetTask.column_id;
    }

    if (task.column_id === newColumnId) return;

    const targetColumn = columns.find(c => c.id === newColumnId);

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, column_id: newColumnId } : t
    ));

    // Update database
    const { error } = await supabase
      .from("tasks")
      .update({ column_id: newColumnId })
      .eq("id", taskId);

    if (error) {
      // Revert on error
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, column_id: task.column_id } : t
      ));
      toast.error("Fout bij verplaatsen");
      return;
    }

    // Accessibility: announce change
    setStatusMessage(`Taak verplaatst naar ${targetColumn?.name}`);
    toast.success(`Taak verplaatst naar ${targetColumn?.name}`);
  };

  // Keyboard alternative for drag-drop (Accessibility)
  const moveTaskToColumn = async (taskId: string, newColumnId: string) => {
    const task = tasks.find(t => t.id === taskId);
    const targetColumn = columns.find(c => c.id === newColumnId);
    if (!task || !targetColumn || task.column_id === newColumnId) return;

    // Optimistic update
    const previousColumnId = task.column_id;
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, column_id: newColumnId } : t
    ));

    const { error } = await supabase
      .from("tasks")
      .update({ column_id: newColumnId })
      .eq("id", taskId);

    if (error) {
      // Revert on error
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, column_id: previousColumnId } : t
      ));
      toast.error("Fout bij verplaatsen");
      return;
    }

    setStatusMessage(`Taak verplaatst naar ${targetColumn.name}`);
    toast.success(`Taak verplaatst naar ${targetColumn.name}`);
  };

  // Task click handler
  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  // Task updated callback
  const handleTaskUpdated = () => {
    loadData();
  };

  // Total task count
  const totalTaskCount = tasks.length;

  if (loading) {
    return (
      <div className="border-t border-border pt-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex-shrink-0 w-64">
              <Skeleton className="h-[300px] w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ACCESSIBILITY: Live region for status updates */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {statusMessage}
      </div>

      <div className="border-t border-border pt-6 mt-6">
        {/* SECTION HEADER */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Kanban className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Mijn Taken</h2>
            <Badge variant="secondary" className="ml-1">
              {totalTaskCount} {totalTaskCount === 1 ? "taak" : "taken"}
            </Badge>
          </div>

          <Button variant="outline" size="sm" asChild>
            <Link to="/kanban" className="gap-2">
              Open volledig Kanban
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* EMPTY STATE */}
        {totalTaskCount === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Geen taken toegewezen</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
                Je hebt momenteel geen openstaande taken
              </p>
              <Button variant="outline" asChild>
                <Link to="/kanban">Ga naar Kanban bord</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* KANBAN FLOW */
          <DndContext 
            sensors={sensors} 
            onDragStart={handleDragStart} 
            onDragEnd={handleDragEnd}
          >
            {/* RESPONSIVE CONTAINER - snap-x on mobile */}
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {columns.map(column => {
                const { visible, overflow, total } = getVisibleTasks(column.id);
                const taskIds = visible.map(t => t.id);

                return (
                  <DroppableColumn key={column.id} column={column}>
                    <Card className="h-full min-h-[200px] bg-muted/30">
                      <CardHeader className="pb-2 pt-3 px-3">
                        <CardTitle className="text-sm font-medium flex items-center justify-between">
                          <span className="truncate">{column.name}</span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {total}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-3 pb-3">
                        {/* COLUMN CONTENT */}
                        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2 min-h-[100px]">
                            {visible.length === 0 ? (
                              /* EMPTY COLUMN STATE */
                              <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Inbox className="h-6 w-6 text-muted-foreground/30 mb-2" />
                                <span className="text-xs text-muted-foreground/50">
                                  Geen taken
                                </span>
                              </div>
                            ) : (
                              <>
                                {visible.map(task => (
                                  <div key={task.id} className="relative group">
                                    <TaskCard
                                      task={task}
                                      onClick={handleTaskClick}
                                    />
                                    
                                    {/* KEYBOARD ACCESSIBILITY: Dropdown menu */}
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 bg-background/80 backdrop-blur-sm"
                                          >
                                            <MoreHorizontal className="h-3 w-3" />
                                            <span className="sr-only">
                                              Acties voor {task.title}
                                            </span>
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-popover">
                                          <DropdownMenuLabel>Verplaats naar</DropdownMenuLabel>
                                          {columns
                                            .filter(c => c.id !== task.column_id)
                                            .map(c => (
                                              <DropdownMenuItem
                                                key={c.id}
                                                onClick={() => moveTaskToColumn(task.id, c.id)}
                                              >
                                                {c.name}
                                              </DropdownMenuItem>
                                            ))
                                          }
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                ))}

                                {/* OVERFLOW INDICATOR */}
                                {overflow > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => navigate("/kanban")}
                                  >
                                    Bekijk meer ({overflow})
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </SortableContext>
                      </CardContent>
                    </Card>
                  </DroppableColumn>
                );
              })}
            </div>

            {/* DRAG OVERLAY */}
            <DragOverlay>
              {activeTask && (
                <div className="opacity-90 rotate-2 scale-105">
                  <TaskCard task={activeTask} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* TASK DETAIL MODAL */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          onTaskUpdated={handleTaskUpdated}
        />
      )}
    </>
  );
}
