import { useState, useEffect, useMemo, useRef } from "react";
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
import { TaskDialog } from "@/components/TaskDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Kanban, 
  ArrowRight, 
  Loader2, 
  MoreHorizontal, 
  CheckCircle2,
  Inbox,
  Search,
  ArrowUp,
  ArrowDown,
  Calendar,
  AlertCircle,
  Clock,
  Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User } from "@supabase/supabase-js";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";

// ENTERPRISE CONFIG
const MAX_VISIBLE_TASKS = 5;
const COLUMNS_TO_SHOW: ("BACKLOG" | "READY" | "DOING" | "BLOCKED" | "REVIEW")[] = [
  "BACKLOG", "READY", "DOING", "BLOCKED", "REVIEW"
];

const priorityRank: Record<string, number> = {
  'CRITICAL': 4,
  'HIGH': 3,
  'MEDIUM': 2,
  'LOW': 1,
};

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
  accepted_at: string | null;
  accepted_by: string | null;
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
      className={`flex-shrink-0 w-72 md:w-64 snap-start transition-all duration-200 ${
        isOver ? "bg-tab-mijn-werk-100/60 dark:bg-tab-mijn-werk-900/40 backdrop-blur-xl rounded-xl ring-2 ring-tab-mijn-werk-400/60 shadow-lg shadow-tab-mijn-werk-500/10" : ""
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
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  // Accessibility: status message for screen readers
  const [statusMessage, setStatusMessage] = useState("");

  // Search and sort
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [sortBy, setSortBy] = useState<'due_at' | 'priority' | 'created_at'>(() => {
    const stored = localStorage.getItem('mytasks-sort-by');
    return (stored as 'due_at' | 'priority' | 'created_at') || 'due_at';
  });
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => {
    const stored = localStorage.getItem('mytasks-sort-direction');
    return (stored as 'asc' | 'desc') || 'asc';
  });
  const [searchQuery, setSearchQuery] = useState("");

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

  // Persist sort preferences
  useEffect(() => {
    localStorage.setItem('mytasks-sort-by', sortBy);
    localStorage.setItem('mytasks-sort-direction', sortDirection);
  }, [sortBy, sortDirection]);

  // Keyboard shortcuts for search and new task
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/' && !detailModalOpen && !taskDialogOpen) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'n' && !detailModalOpen && !taskDialogOpen) {
        e.preventDefault();
        setTaskDialogOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailModalOpen, taskDialogOpen]);

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
          accepted_at, accepted_by,
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

  // Realtime subscription for task updates (AFTER loadData definition)
  useRealtimeChannel({
    channelName: 'mytasks-flow-realtime',
    table: 'tasks',
    filter: user ? `assignee_id=eq.${user.id}` : undefined,
    onEvent: loadData,
    debounceMs: 200,
    enabled: !!user
  });

  const getTasksForColumn = (columnId: string): Task[] => {
    const column = columns.find(c => c.id === columnId);
    let filteredTasks = tasks.filter(t =>
      t.column_id === columnId ||
      (column?.status === "BACKLOG" && !t.column_id)
    );

    // Search filter
    if (searchQuery) {
      filteredTasks = filteredTasks.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    return [...filteredTasks].sort((a, b) => {
      if (sortBy === 'due_at') {
        if (!a.due_at && !b.due_at) return 0;
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        const dateA = new Date(a.due_at).getTime();
        const dateB = new Date(b.due_at).getTime();
        return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      }
      if (sortBy === 'priority') {
        const rankA = priorityRank[a.priority] || 0;
        const rankB = priorityRank[b.priority] || 0;
        return sortDirection === 'asc' ? rankA - rankB : rankB - rankA;
      }
      if (sortBy === 'created_at') {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      }
      return 0;
    });
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

  // Accept task handler (for delegated tasks)
  const handleAcceptTask = async (taskId: string) => {
    if (!user) return;
    
    const { error } = await supabase
      .from("tasks")
      .update({ 
        accepted_by: user.id,
        accepted_at: new Date().toISOString()
      })
      .eq("id", taskId);

    if (error) {
      toast.error("Fout bij accepteren");
      return;
    }

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId 
        ? { ...t, accepted_by: user.id, accepted_at: new Date().toISOString() } 
        : t
    ));
    
    setStatusMessage("Taak geaccepteerd");
    toast.success("Taak geaccepteerd");
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
              <Skeleton className="h-[300px] w-full bg-tab-mijn-werk-100/50 dark:bg-tab-mijn-werk-900/30" />
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

      <div className="pt-6 mt-6">
        {/* Gradient separator - glassmorphism compatible */}
        <div className="h-px bg-gradient-to-r from-transparent via-tab-mijn-werk-200/50 dark:via-tab-mijn-werk-700/50 to-transparent mb-6 -mt-6" />
        {/* SECTION HEADER */}
        <div className="flex flex-col gap-3 mb-4">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <Kanban className="h-5 w-5 text-tab-mijn-werk-500" />
            <h2 className="text-lg font-semibold">Mijn Taken</h2>
            <Badge className="ml-1 bg-tab-mijn-werk-100 text-tab-mijn-werk-700 border border-tab-mijn-werk-200 dark:bg-tab-mijn-werk-900/40 dark:text-tab-mijn-werk-300 dark:border-tab-mijn-werk-700">
              {totalTaskCount} {totalTaskCount === 1 ? "taak" : "taken"}
            </Badge>
          </div>

          {/* Controls row */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            {/* Sort controls */}
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-8 w-[140px] text-xs bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-tab-mijn-werk-200/50 dark:border-tab-mijn-werk-700/50">
                  <div className="flex items-center gap-1.5">
                    {sortBy === 'due_at' && <Calendar className="h-3 w-3" />}
                    {sortBy === 'priority' && <AlertCircle className="h-3 w-3" />}
                    {sortBy === 'created_at' && <Clock className="h-3 w-3" />}
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="due_at">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      Deadline
                    </div>
                  </SelectItem>
                  <SelectItem value="priority">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3 w-3" />
                      Prioriteit
                    </div>
                  </SelectItem>
                  <SelectItem value="created_at">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      Aangemaakt
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                    className="h-8 w-8 p-0 hover:bg-muted/80"
                    aria-label={sortDirection === 'asc' ? 'Sorteer aflopend' : 'Sorteer oplopend'}
                  >
                    {sortDirection === 'asc' ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : (
                      <ArrowDown className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {sortBy === 'priority'
                    ? (sortDirection === 'asc' ? 'Laagste eerst' : 'Hoogste eerst')
                    : (sortDirection === 'asc' ? 'Vroegste eerst' : 'Laatste eerst')
                  }
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Zoek taken... (/)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-sm bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-tab-mijn-werk-200/50 dark:border-tab-mijn-werk-700/50 focus:border-tab-mijn-werk-400"
                aria-label="Zoek in mijn taken"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => setTaskDialogOpen(true)} size="sm" className="gap-2 bg-tab-mijn-werk-500 hover:bg-tab-mijn-werk-600 text-white">
                <Plus className="h-4 w-4" />
                Nieuwe taak
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/kanban" className="gap-2">
                  Team overzicht
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* EMPTY STATE */}
        {totalTaskCount === 0 ? (
          <Card className="border-dashed glass-layer-1">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-tab-mijn-werk-200 dark:text-tab-mijn-werk-800 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Geen taken toegewezen</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
                Je hebt momenteel geen openstaande taken
              </p>
              <Button variant="outline" asChild>
                <Link to="/kanban">Bekijk alle team taken</Link>
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
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent scroll-fade-edges">
              {columns.map(column => {
                const { visible, overflow, total } = getVisibleTasks(column.id);
                const taskIds = visible.map(t => t.id);

                return (
                  <DroppableColumn key={column.id} column={column}>
                    <Card className="h-full min-h-[200px] glass-kanban-column border-t-2 border-t-tab-mijn-werk-400/80 dark:border-t-tab-mijn-werk-600/80 shadow-[0_4px_12px_hsla(234,45%,52%,0.08),0_12px_32px_hsla(234,45%,52%,0.06)]">
                      <CardHeader className="pb-2 pt-3 px-3 bg-gradient-to-b from-white/40 to-transparent dark:from-white/5 dark:to-transparent border-b border-white/20 dark:border-white/10">
                        <CardTitle className="text-sm font-medium flex items-center justify-between">
                          <span className="truncate">{column.name}</span>
                          <Badge variant="glass" className="ml-2 text-xs">
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
                                <div className="p-3 rounded-xl glass-icon-bubble mb-2">
                                  <Inbox className="h-6 w-6 text-tab-mijn-werk-400 dark:text-tab-mijn-werk-600" />
                                </div>
                                <span className="text-xs text-muted-foreground/60 font-medium">
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
                                        <DropdownMenuContent align="end" className="glass-layer-2">
                                          {/* Accept option for pending tasks */}
                                          {!task.accepted_at && (
                                            <>
                                              <DropdownMenuItem
                                                onClick={() => handleAcceptTask(task.id)}
                                                className="text-primary"
                                              >
                                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                                Accepteren
                                              </DropdownMenuItem>
                                              <DropdownMenuSeparator />
                                            </>
                                          )}
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
                                    className="w-full text-xs text-tab-mijn-werk-500 hover:text-tab-mijn-werk-600 dark:text-tab-mijn-werk-400 dark:hover:text-tab-mijn-werk-300 hover:bg-tab-mijn-werk-50/50 dark:hover:bg-tab-mijn-werk-900/30"
                                    onClick={() => navigate("/kanban")}
                                  >
                                    +{overflow} meer in team overzicht
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

      {/* NEW TASK DIALOG */}
      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        onSuccess={loadData}
      />
    </>
  );
}
