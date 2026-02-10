import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  parseISO,
  getWeek,
  differenceInDays,
  isAfter,
} from "date-fns";
import { nl } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Coffee,
  ChevronDown,
  Inbox,
} from "lucide-react";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { TaskDialog } from "@/components/TaskDialog";
import { useToast } from "@/hooks/use-toast";
import { useCountUp } from "@/hooks/useCountUp";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KPICard } from "@/components/ui/kpi-card";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  getAssigneeColor,
  PRIORITY_INDICATOR_DOTS,
} from "@/hooks/useAssigneeColor";

// ===== Types =====

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
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

// ===== Priority styles =====

const PRIORITY_BORDERS: Record<string, string> = {
  low: "border-l-emerald-500/70",
  medium: "border-l-blue-500/70",
  high: "border-l-amber-500/70",
  critical: "border-l-red-500/70",
};

const PRIORITY_BG: Record<string, string> = {
  low: "bg-emerald-50/40 dark:bg-emerald-900/20",
  medium: "bg-blue-50/40 dark:bg-blue-900/20",
  high: "bg-amber-50/40 dark:bg-amber-900/20",
  critical: "bg-red-50/40 dark:bg-red-900/20",
};

// ===== Helpers =====

const isOverdue = (task: Task): boolean => {
  const dueDate = task.due_at
    ? parseISO(task.due_at)
    : task.start_at
    ? parseISO(task.start_at)
    : null;
  if (!dueDate) return false;
  const now = new Date();
  dueDate.setHours(23, 59, 59, 999);
  return isAfter(now, dueDate);
};

const getEmptyStateMessage = (
  day: Date,
  isWeekend: boolean
): { icon: typeof Sparkles; message: string } => {
  if (isWeekend) return { icon: Coffee, message: "Weekend vrij" };
  if (isSameDay(day, new Date()))
    return { icon: Sparkles, message: "Vrije dag vandaag!" };
  if (differenceInDays(day, new Date()) < 0)
    return { icon: Calendar, message: "Geen taken" };
  return { icon: Plus, message: "Plan een taak" };
};

const getWeekProgress = (): number => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  if (dayOfWeek === 0 || dayOfWeek === 6) return 100;
  const workDayIndex = dayOfWeek - 1;
  return Math.round(((workDayIndex + hour / 24) / 5) * 100);
};

// ===== Drag & Drop wrappers =====

const DraggableTask = ({
  task,
  children,
}: {
  task: Task;
  children: React.ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `task-${task.id}`,
      data: { type: "task", task },
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        isDragging && "opacity-50 cursor-grabbing",
        "cursor-grab"
      )}
    >
      {children}
    </div>
  );
};

const DroppableDay = ({
  day,
  children,
}: {
  day: Date;
  children: React.ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.toISOString()}`,
    data: { day },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-all duration-200 rounded-xl",
        isOver && "ring-2 ring-tab-mijn-werk-500/50 ring-inset bg-tab-mijn-werk-500/5"
      )}
    >
      {children}
    </div>
  );
};

// ===== Main Component =====

export default function MyWeekCalendarSection() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 })
  );
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"5" | "7">("5");
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newTaskDate, setNewTaskDate] = useState<Date | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [unplannedOpen, setUnplannedOpen] = useState(true);

  // Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
  );

  // Load user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          `id, title, description, priority, assignee_id, due_at, completed_at,
           column_id, order_key, application_id, recruitment_action_type,
           start_at, next_action, created_at, updated_at, accepted_at, accepted_by,
           profiles!tasks_assignee_id_fkey (name, email)`
        )
        .eq("assignee_id", userId)
        .is("deleted_at", null)
        .is("completed_at", null)
        .order("start_at", { ascending: true, nullsFirst: false });

      if (error) throw error;
      setTasks((data || []) as Task[]);
    } catch (error) {
      console.error("Error fetching my tasks:", error);
      toast({
        title: "Fout bij laden",
        description: "Kon taken niet laden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (userId) fetchTasks();
  }, [userId, fetchTasks]);

  // Realtime
  useRealtimeChannel({
    channelName: "my-week-calendar-tasks",
    table: "tasks",
    filter: userId ? `assignee_id=eq.${userId}` : undefined,
    onEvent: fetchTasks,
    debounceMs: 200,
    enabled: !!userId,
  });

  // ===== Computed data =====

  const allWeekDays = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i)
  );
  const weekDays = viewMode === "5" ? allWeekDays.slice(0, 5) : allWeekDays;

  const getTasksForDay = (day: Date) =>
    tasks.filter(
      (t) =>
        (t.start_at && isSameDay(parseISO(t.start_at), day)) ||
        (t.due_at && isSameDay(parseISO(t.due_at), day))
    );

  const unplannedTasks = tasks.filter((t) => !t.start_at && !t.due_at);

  const todayCount = !loading ? getTasksForDay(new Date()).length : 0;
  const weekCount = !loading
    ? tasks.filter((t) => {
        const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
        const d = t.start_at
          ? parseISO(t.start_at)
          : t.due_at
          ? parseISO(t.due_at)
          : null;
        return d && d >= currentWeekStart && d <= weekEnd;
      }).length
    : 0;
  const unplannedCount = !loading ? unplannedTasks.length : 0;

  // Animated counters
  const animatedToday = useCountUp({ end: todayCount, duration: 600 });
  const animatedWeek = useCountUp({ end: weekCount, duration: 600 });
  const animatedUnplanned = useCountUp({ end: unplannedCount, duration: 600 });

  // ===== Navigation =====

  const goToPreviousWeek = () =>
    setCurrentWeekStart(addDays(currentWeekStart, -7));
  const goToNextWeek = () =>
    setCurrentWeekStart(addDays(currentWeekStart, 7));
  const goToToday = () =>
    setCurrentWeekStart(
      startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 })
    );

  // ===== Interactions =====

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  const handleTaskUpdated = async () => {
    await fetchTasks();
    setDetailModalOpen(false);
  };

  const handleDayClick = (day: Date) => {
    setNewTaskDate(day);
    setNewTaskDialogOpen(true);
  };

  const handleNewTaskCreated = () => {
    fetchTasks();
    setNewTaskDialogOpen(false);
    setNewTaskDate(null);
  };

  // ===== Drag & Drop =====

  const handleDragStart = (event: DragStartEvent) => {
    document.documentElement.classList.add("dnd-dragging");
    const task = event.active.data.current?.task;
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    document.documentElement.classList.remove("dnd-dragging");
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;
    const overId = over.id as string;
    if (!overId.startsWith("day-")) return;

    const targetDay = parseISO(overId.replace("day-", ""));
    const task = active.data.current?.task as Task | undefined;
    if (!task) return;

    await rescheduleTask(task, targetDay);
  };

  const rescheduleTask = async (task: Task, newDay: Date) => {
    const currentDate = task.start_at
      ? format(parseISO(task.start_at), "yyyy-MM-dd")
      : task.due_at
      ? format(parseISO(task.due_at), "yyyy-MM-dd")
      : null;
    const newDate = format(newDay, "yyyy-MM-dd");
    if (currentDate === newDate) return;

    const updates: Record<string, string> = {};

    if (task.start_at) {
      const orig = parseISO(task.start_at);
      const newStart = new Date(newDay);
      newStart.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
      updates.start_at = newStart.toISOString();
    }

    if (task.due_at) {
      const orig = parseISO(task.due_at);
      const newDue = new Date(newDay);
      newDue.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
      updates.due_at = newDue.toISOString();
    }

    // Unplanned tasks get due_at at 12:00
    if (!task.start_at && !task.due_at) {
      const noon = new Date(newDay);
      noon.setHours(12, 0, 0, 0);
      updates.due_at = noon.toISOString();
    }

    const { error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", task.id);

    if (error) {
      toast({
        title: "Fout",
        description: "Kon taak niet verplaatsen",
        variant: "destructive",
      });
      return;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, ...updates } : t))
    );

    toast({
      title: "Taak verplaatst",
      description: `${task.title} → ${format(newDay, "EEEE d MMM", {
        locale: nl,
      })}`,
      duration: 5000,
    });
  };

  // ===== Loading =====

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Weekkalender laden...</p>
      </div>
    );
  }

  const weekNumber = getWeek(currentWeekStart, { locale: nl });
  const isCurrentWeek = isSameDay(
    currentWeekStart,
    startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 })
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard
          icon={Calendar}
          title="Vandaag"
          value={animatedToday}
          variant="indigo"
          onClick={goToToday}
        />
        <KPICard
          icon={CheckCircle2}
          title="Deze week"
          value={animatedWeek}
          variant="indigo"
        />
        <KPICard
          icon={Inbox}
          title="Ongepland"
          value={animatedUnplanned}
          variant="time"
        />
      </div>

      {/* Week Navigation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Left: Week info */}
          <p className="text-sm text-muted-foreground/80">
            Week {weekNumber} · {tasks.length} taken
          </p>

          {/* Right: Controls */}
          <div className="flex items-center gap-3">
            {/* 5/7 Toggle */}
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => v && setViewMode(v as "5" | "7")}
              className="bg-muted/50 p-1 rounded-full"
            >
              <ToggleGroupItem
                value="5"
                aria-label="Werkweek"
                className="rounded-full px-4 text-sm data-[state=on]:bg-background data-[state=on]:shadow-sm data-[state=on]:text-primary"
              >
                Ma-Vr
              </ToggleGroupItem>
              <ToggleGroupItem
                value="7"
                aria-label="Volle week"
                className="rounded-full px-4 text-sm data-[state=on]:bg-background data-[state=on]:shadow-sm data-[state=on]:text-primary"
              >
                Ma-Zo
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Week nav arrows */}
        <div className="flex items-center justify-center gap-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPreviousWeek}
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          <div className="text-center min-w-[180px]">
            <p className="text-sm font-medium tabular-nums">
              {format(currentWeekStart, "d MMM", { locale: nl }).toLowerCase()}{" "}
              –{" "}
              {format(
                endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
                "d MMM yyyy",
                { locale: nl }
              ).toLowerCase()}
            </p>
            <button
              onClick={goToToday}
              className="text-[11px] font-medium text-primary hover:text-primary/80 hover:underline transition-colors"
            >
              Vandaag
            </button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={goToNextWeek}
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Progress bar (only current week) */}
        {isCurrentWeek && (
          <div className="flex items-center justify-center gap-3 px-16">
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
              Ma
            </span>
            <Progress
              value={getWeekProgress()}
              className="h-1 w-48 bg-muted/30"
            />
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
              Vr
            </span>
          </div>
        )}
      </div>

      {/* Calendar Grid + Drag & Drop */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className={cn(
            "grid gap-3",
            viewMode === "5"
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
              : "grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
          )}
        >
          {weekDays.map((day) => {
            const dayTasks = getTasksForDay(day);
            const isToday = isSameDay(day, new Date());
            const dayOfWeek = day.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            return (
              <DroppableDay key={day.toISOString()} day={day}>
                <Card
                  className={cn(
                    "overflow-hidden min-h-[280px] border border-border/20 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]",
                    isToday && "bg-primary/[0.03] border-primary/10",
                    isWeekend &&
                      !isToday &&
                      "bg-muted/[0.02] dark:bg-muted/[0.04]"
                  )}
                >
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-sm font-normal tracking-wide flex items-center justify-between">
                      <span
                        className={cn(
                          "flex items-center gap-2",
                          isToday && "text-primary font-medium"
                        )}
                      >
                        {format(day, "EEE", { locale: nl })}
                        <span
                          className={cn(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs",
                            isToday
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "text-muted-foreground"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                      </span>
                      <button
                        onClick={() => handleDayClick(day)}
                        className="p-1 rounded-full text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-colors"
                        title="Nieuwe taak"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-2 space-y-1">
                    {dayTasks.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-4 text-muted-foreground/30">
                        {(() => {
                          const { icon: EmptyIcon, message } =
                            getEmptyStateMessage(day, isWeekend);
                          return (
                            <>
                              <EmptyIcon className="h-5 w-5 mb-1" />
                              <span className="text-[11px]">{message}</span>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {dayTasks.map((task) => {
                      const priority = task.priority?.toLowerCase() || "medium";
                      const assigneeColor = getAssigneeColor(task.assignee_id);
                      const taskIsOverdue = isOverdue(task);

                      return (
                        <DraggableTask key={task.id} task={task}>
                          <div
                            onClick={() => handleTaskClick(task)}
                            className={cn(
                              "p-2 rounded-lg border-l-2 cursor-pointer transition-all duration-150",
                              "hover:shadow-sm hover:scale-[1.01]",
                              assigneeColor.bg,
                              assigneeColor.border,
                              taskIsOverdue && "ring-1 ring-red-500/30"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                                  assigneeColor.dot
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <p className="text-xs font-medium truncate flex-1">
                                    {task.title}
                                  </p>
                                  {(priority === "high" ||
                                    priority === "critical") && (
                                    <span
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full shrink-0",
                                        PRIORITY_INDICATOR_DOTS[priority]
                                      )}
                                      title={
                                        priority === "critical"
                                          ? "Kritiek"
                                          : "Hoge prioriteit"
                                      }
                                    />
                                  )}
                                </div>
                                {task.start_at && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {format(parseISO(task.start_at), "HH:mm")}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </DraggableTask>
                      );
                    })}
                  </CardContent>
                </Card>
              </DroppableDay>
            );
          })}
        </div>

        {/* Drag Overlay - Indigo themed */}
        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className="cursor-grabbing">
              <div className="glass-drag-overlay-enhanced p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-white/40 dark:border-white/15">
                <p className="text-xs font-medium">{activeTask.title}</p>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Ongepland sectie */}
      <Collapsible open={unplannedOpen} onOpenChange={setUnplannedOpen}>
        <Card className="glass-card-indigo glass-light-bleed-indigo">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-primary/[0.02] transition-colors pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-muted-foreground" />
                  Ongepland
                  {unplannedCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 px-1.5 py-0 text-xs"
                    >
                      {unplannedCount}
                    </Badge>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    unplannedOpen && "rotate-180"
                  )}
                />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-3">
              {unplannedTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 text-center py-4">
                  Alle taken zijn ingepland 🎉
                </p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {unplannedTasks.map((task) => {
                    const priority = task.priority?.toLowerCase() || "medium";

                    return (
                      <DraggableTask key={task.id} task={task}>
                        <div
                          onClick={() => handleTaskClick(task)}
                          className={cn(
                            "flex-shrink-0 w-48 p-2 rounded-lg border-l-2 cursor-pointer transition-all duration-150",
                            "hover:shadow-sm",
                            PRIORITY_BG[priority] || PRIORITY_BG.medium,
                            PRIORITY_BORDERS[priority] ||
                              PRIORITY_BORDERS.medium
                          )}
                        >
                          <p className="text-xs font-medium truncate">
                            {task.title}
                          </p>
                          {task.next_action && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {task.next_action}
                            </p>
                          )}
                        </div>
                      </DraggableTask>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          onTaskUpdated={handleTaskUpdated}
        />
      )}

      {/* New Task Dialog */}
      <TaskDialog
        open={newTaskDialogOpen}
        onOpenChange={setNewTaskDialogOpen}
        onSuccess={handleNewTaskCreated}
        defaultStartDate={newTaskDate || undefined}
      />
    </div>
  );
}
