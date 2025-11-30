import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, Filter, Plus, Check, Edit2, Clock, Trash2, ArrowUp, ArrowDown, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCountUp } from "@/hooks/useCountUp";
import { PriorityBadge } from "@/components/PriorityBadge";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Task {
  id: string;
  sequence_number: number;
  title: string;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  next_action: string | null;
  completed_at: string | null;
  org_id: string;
  application_id: string | null;
  recruitment_action_type: string | null;
  assignee_id: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  description: string | null;
  organizations: { name: string } | null;
  profiles: { 
    name: string | null;
    email: string | null;
  } | null;
}

interface Profile {
  id: string;
  name: string | null;
}

const priorityLabels = {
  LOW: "Laag",
  MEDIUM: "Gemiddeld",
  HIGH: "Hoog",
  CRITICAL: "Kritiek",
};


// Memoized timer cell to prevent parent re-renders
const TimerCell = memo(({ activeTimer, currentTime, getRunningTime }: any) => (
  <Badge variant="secondary" className="text-xs bg-primary/20">
    <Clock className="h-3 w-3 mr-1" />
    {getRunningTime(activeTimer.start)}
  </Badge>
));
TimerCell.displayName = 'TimerCell';

export default function Lijst() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("none");
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [activeTimers, setActiveTimers] = useState<Record<string, { user_id: string; start: string; profiles: { name: string | null } | null }>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editingAssignee, setEditingAssignee] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
    fetchTasks();
    loadActiveTimers();
    loadProfiles();

    // Real-time listener voor taak updates
    const tasksChannel = supabase
      .channel('lijst-tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        (payload) => {
          console.log('Task change detected:', payload);
          fetchTasks();
        }
      )
      .subscribe();

    // Real-time listener voor time_entries
    const timeEntriesChannel = supabase
      .channel('lijst-time-entries')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_entries'
        },
        () => {
          loadActiveTimers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(timeEntriesChannel);
    };
  }, []);

  // Live timer update elke seconde
  useEffect(() => {
    if (Object.keys(activeTimers).length > 0) {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [activeTimers]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    } else {
      setUser(session.user);
      setCurrentUserId(session.user.id);
    }
  };

  const loadProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name")
        .order("name");
      
      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error("Error loading profiles:", error);
    }
  };

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id,
          sequence_number,
          title,
          priority,
          start_at,
          due_at,
          next_action,
          completed_at,
          org_id,
          assignee_id,
          accepted_at,
          accepted_by,
          description,
          application_id,
          recruitment_action_type,
          organizations(name),
          profiles:profiles!tasks_assignee_id_fkey(name, email)
        `)
        .is("deleted_at", null)
        .is("completed_at", null)
        .order("sequence_number", { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveTimers = async () => {
    const { data } = await supabase
      .from("time_entries")
      .select("task_id, user_id, start, profiles:profiles!time_entries_user_id_fkey(name)")
      .is("end", null);
    
    if (data) {
      const timersMap: Record<string, any> = {};
      data.forEach((entry: any) => {
        timersMap[entry.task_id] = entry;
      });
      setActiveTimers(timersMap);
    }
  };

  const getRunningTime = (start: string) => {
    const now = currentTime;
    const startTime = new Date(start);
    const totalSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}u ${minutes}m ${seconds}s`;
  };

  const handleToggleComplete = async (taskId: string, currentStatus: string | null) => {
    try {
      const updates: any = {
        completed_at: currentStatus ? null : new Date().toISOString()
      };

      // Synchroniseer column_id met completion status
      if (!currentStatus) {
        // Markeer als afgerond → verplaats naar "Afgerond" kolom
        const { data: doneColumn } = await supabase
          .from("columns")
          .select("id")
          .eq("status", "DONE")
          .limit(1)
          .maybeSingle();

        if (doneColumn) {
          updates.column_id = doneColumn.id;
        }
      } else {
        // Markeer als actief → verplaats naar "Bezig" kolom
        const { data: doingColumn } = await supabase
          .from("columns")
          .select("id")
          .eq("status", "DOING")
          .limit(1)
          .maybeSingle();

        if (doingColumn) {
          updates.column_id = doingColumn.id;
        }
      }

      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);

      if (error) throw error;

      toast.success(currentStatus ? "Taak gemarkeerd als actief" : "Taak afgerond");
      fetchTasks();
    } catch (error) {
      console.error("Error toggling task completion:", error);
      toast.error("Fout bij updaten van taak");
    }
  };

  const handleEditAction = (taskId: string, currentAction: string | null) => {
    setEditingAction(taskId);
    setEditingValue(currentAction || "");
  };

  const handleSaveAction = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ next_action: editingValue || null })
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Vervolgactie bijgewerkt");
      setEditingAction(null);
      setEditingValue("");
      fetchTasks();
    } catch (error) {
      console.error("Error updating next action:", error);
      toast.error("Fout bij bijwerken vervolgactie");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === "Enter") {
      handleSaveAction(taskId);
    } else if (e.key === "Escape") {
      setEditingAction(null);
      setEditingValue("");
    }
  };

  const handleAcceptTask = async (taskId: string) => {
    if (!currentUserId) return;
    
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ 
          accepted_by: currentUserId,
          accepted_at: new Date().toISOString(),
          assignee_id: currentUserId
        })
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Taak geaccepteerd");
      fetchTasks();
    } catch (error) {
      console.error("Error accepting task:", error);
      toast.error("Fout bij accepteren van taak");
    }
  };

  const handleUpdateAssignee = async (taskId: string, assigneeId: string | null) => {
    try {
      const updates: any = { assignee_id: assigneeId || null };
      
      // Als er niemand toegewezen wordt, reset ook de acceptatie
      if (!assigneeId) {
        updates.accepted_by = null;
        updates.accepted_at = null;
      }
      
      // Auto-accept bij self-assignment
      if (assigneeId === currentUserId) {
        updates.accepted_by = currentUserId;
        updates.accepted_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);

      if (error) throw error;

      toast.success(assigneeId === currentUserId ? "Taak toegewezen en geaccepteerd" : "Verantwoordelijke bijgewerkt");
      setEditingAssignee(null);
      fetchTasks();
    } catch (error) {
      console.error("Error updating assignee:", error);
      toast.error("Fout bij bijwerken verantwoordelijke");
    }
  };

  const getTaskStatus = (task: Task) => {
    if (task.accepted_by) return "accepted";
    if (task.assignee_id) return "assigned";
    return "unassigned";
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map(part => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatPeriod = (start: string | null, end: string | null) => {
    if (start && end) {
      const startDate = format(new Date(start), "d MMM", { locale: nl });
      const endDate = format(new Date(end), "d MMM", { locale: nl });
      return `${startDate} - ${endDate}`;
    }
    if (start) return `Vanaf ${format(new Date(start), "d MMM", { locale: nl })}`;
    if (end) return `Tot ${format(new Date(end), "d MMM", { locale: nl })}`;
    return "—";
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  const handleTaskUpdated = () => {
    fetchTasks();
  };

  const openDeleteDialog = (task: Task) => {
    setTaskToDelete(task);
    setDeleteDialogOpen(true);
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete || !currentUserId) return;

    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: currentUserId,
        })
        .eq("id", taskToDelete.id);

      if (error) throw error;

      toast.success("Taak verwijderd");
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
      fetchTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Fout bij verwijderen van taak");
    }
  };

  // Memoized filtered and sorted tasks for performance
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter((task) => {
      if (filterPriority !== "all" && task.priority !== filterPriority) return false;
      if (filterStatus === "completed" && !task.completed_at) return false;
      if (filterStatus === "active" && task.completed_at) return false;
      if (filterStatus === "accepted" && !task.accepted_by) return false;
      return true;
    });

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortColumn as keyof Task];
        let bVal: any = b[sortColumn as keyof Task];

        // Handle null/undefined
        if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1;
        if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1;

        // Handle dates
        if (sortColumn === 'start_at' || sortColumn === 'due_at') {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        }

        // Handle strings/numbers
        if (typeof aVal === 'string') {
          return sortDirection === 'asc' 
            ? aVal.localeCompare(bVal) 
            : bVal.localeCompare(aVal);
        }

        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    return filtered;
  }, [tasks, filterPriority, filterStatus, sortColumn, sortDirection]);

  const groupedTasks = () => {
    if (groupBy === "none") return { "Alle taken": filteredTasks };

    const groups: Record<string, Task[]> = {};
    filteredTasks.forEach((task) => {
      let key = "Ongegroepeerd";
      
      if (groupBy === "start" && task.start_at) {
        key = `START: ${format(new Date(task.start_at), "dd-MM-yy", { locale: nl })}`;
      } else if (groupBy === "due" && task.due_at) {
        key = `EIND: ${format(new Date(task.due_at), "dd-MM-yy", { locale: nl })}`;
      } else if (groupBy === "priority") {
        key = priorityLabels[task.priority as keyof typeof priorityLabels];
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });

    return groups;
  };

  const groups = groupedTasks();
  const myTasksCount = filteredTasks.filter(t => t.assignee_id === currentUserId).length;

  // KPI values voor animated counters (vóór early return)
  const openTasksCount = !loading ? tasks.filter(t => !t.completed_at && !t.accepted_by).length : 0;
  const completedTodayCount = !loading ? tasks.filter(t => t.completed_at && new Date(t.completed_at).toDateString() === new Date().toDateString()).length : 0;
  const highPriorityCount = !loading ? tasks.filter(t => t.priority === 'HIGH' || t.priority === 'CRITICAL').length : 0;
  const myTasksCountValue = !loading ? filteredTasks.filter(t => t.assignee_id === currentUserId).length : 0;

  // Animated counters - altijd in dezelfde volgorde aangeroepen
  const animatedOpenTasks = useCountUp({ end: openTasksCount, duration: 600 });
  const animatedCompletedToday = useCountUp({ end: completedTodayCount, duration: 600 });
  const animatedHighPriority = useCountUp({ end: highPriorityCount, duration: 600 });
  const animatedMyTasks = useCountUp({ end: myTasksCountValue, duration: 600 });

  // Keyboard navigation (j/k for row navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const flatTasks = Object.values(groups).flat();

      if (e.key === 'j') {
        // Move down
        e.preventDefault();
        setSelectedRowIndex(prev => {
          const newIndex = Math.min(prev + 1, flatTasks.length - 1);
          scrollToRow(newIndex);
          return newIndex;
        });
      } else if (e.key === 'k') {
        // Move up
        e.preventDefault();
        setSelectedRowIndex(prev => {
          const newIndex = Math.max(prev - 1, 0);
          scrollToRow(newIndex);
          return newIndex;
        });
      } else if (e.key === 'Enter' && selectedRowIndex >= 0) {
        // Open selected task
        e.preventDefault();
        const task = flatTasks[selectedRowIndex];
        if (task) handleTaskClick(task);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [groups, selectedRowIndex]);

  const scrollToRow = (index: number) => {
    if (tableRef.current) {
      const rows = tableRef.current.querySelectorAll('tbody tr[data-task-id]');
      const row = rows[index];
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 inline ml-1" />
      : <ArrowDown className="h-3 w-3 inline ml-1" />;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Lijstweergave laden...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="mb-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Lijst</h1>
          <p className="text-muted-foreground">
            {filteredTasks.length} taken in de lijst
          </p>
        </div>

        {/* Integrated Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end mb-6">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">
              Groepeer op
            </label>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Geen groepering</SelectItem>
                <SelectItem value="start">Startdatum</SelectItem>
                <SelectItem value="due">Einddatum</SelectItem>
                <SelectItem value="priority">Prioriteit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">
              Filter op prioriteit
            </label>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle prioriteiten</SelectItem>
                <SelectItem value="LOW">Laag</SelectItem>
                <SelectItem value="MEDIUM">Gemiddeld</SelectItem>
                <SelectItem value="HIGH">Hoog</SelectItem>
                <SelectItem value="CRITICAL">Kritiek</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">
              Filter op status
            </label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="active">Actief</SelectItem>
                <SelectItem value="accepted">Geaccepteerd</SelectItem>
                <SelectItem value="completed">Afgerond</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Compact Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="group flex flex-col items-center justify-center p-6 rounded-xl 
                         bg-gradient-to-br from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background/60 
                         backdrop-blur-sm border border-white/50 dark:border-white/10 border-t-4 border-t-blue-400/60 dark:border-t-blue-500/50
                         hover:shadow-lg hover:shadow-blue-500/10 hover:scale-[1.02] transition-all duration-200 cursor-pointer" onClick={() => { setFilterStatus('active'); setFilterPriority('all'); }}>
            <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {animatedOpenTasks}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Open</span>
          </div>
          
          <div className="group flex flex-col items-center justify-center p-6 rounded-xl 
                         bg-gradient-to-br from-green-50/80 to-white/60 dark:from-green-950/30 dark:to-background/60 
                         backdrop-blur-sm border border-white/50 dark:border-white/10 border-t-4 border-t-green-400/60 dark:border-t-green-500/50
                         hover:shadow-lg hover:shadow-green-500/10 hover:scale-[1.02] transition-all duration-200 cursor-pointer" onClick={() => { setFilterStatus('completed'); setFilterPriority('all'); }}>
            <span className="text-3xl font-bold text-green-600 dark:text-green-400">
              {animatedCompletedToday}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Vandaag</span>
          </div>
          
          <div className={cn("group flex flex-col items-center justify-center p-6 rounded-xl bg-gradient-to-br from-orange-50/80 to-white/60 dark:from-orange-950/30 dark:to-background/60 backdrop-blur-sm border border-white/50 dark:border-white/10 border-t-4 border-t-orange-400/60 dark:border-t-orange-500/50 hover:shadow-lg hover:shadow-orange-500/10 hover:scale-[1.02] transition-all duration-200", highPriorityCount === 0 && "opacity-50 cursor-not-allowed", highPriorityCount > 0 && "cursor-pointer")} onClick={() => { if (highPriorityCount > 0) { setFilterPriority('HIGH'); setFilterStatus('all'); } }}>
            <span className={cn("text-3xl font-bold", highPriorityCount > 0 ? "text-destructive" : "text-orange-600 dark:text-orange-400")}>
              {animatedHighPriority}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">High Priority</span>
          </div>
          
          <div className={cn("group flex flex-col items-center justify-center p-6 rounded-xl bg-gradient-to-br from-purple-50/80 to-white/60 dark:from-purple-950/30 dark:to-background/60 backdrop-blur-sm border border-white/50 dark:border-white/10 border-t-4 border-t-purple-400/60 dark:border-t-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 hover:scale-[1.02] transition-all duration-200", myTasksCountValue === 0 && "opacity-50 cursor-not-allowed", myTasksCountValue > 0 && "cursor-pointer")} onClick={() => { if (myTasksCountValue > 0) { setFilterStatus('all'); setFilterPriority('all'); toast.info(`${myTasksCountValue} taken aan jou toegewezen`); } }}>
            <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {animatedMyTasks}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Mijn Taken</span>
          </div>
        </div>
      </div>

      <div className="space-y-8" ref={tableRef}>
            {Object.entries(groups).map(([groupName, groupTasks]) => (
              <div key={groupName}>
                {groupBy !== "none" && (
                  <h2 className="mb-4 text-xl font-semibold text-muted-foreground">
                    {groupName}
                  </h2>
                )}
                <div className="rounded-lg border bg-card relative overflow-auto max-h-[calc(100vh-350px)]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="w-[50px]">ID</TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 transition-colors select-none"
                          onClick={() => handleSort('title')}
                          aria-label="Sorteer op taak"
                        >
                          Taak <SortIcon column="title" />
                        </TableHead>
                        <TableHead className="hidden md:table-cell">Organisatie</TableHead>
                        <TableHead>Eigenaar</TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 transition-colors select-none"
                          onClick={() => handleSort('priority')}
                          aria-label="Sorteer op prioriteit"
                        >
                          Prioriteit <SortIcon column="priority" />
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">Periode</TableHead>
                        <TableHead className="min-w-[200px]">Volgende actie</TableHead>
                        <TableHead className="w-[120px] hidden lg:table-cell">Timer</TableHead>
                        <TableHead className="w-[100px]">Actie</TableHead>
                        <TableHead className="w-[80px] text-center">Afgerond</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupTasks.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground">
                            Geen taken gevonden
                          </TableCell>
                        </TableRow>
                      ) : (
                        groupTasks.map((task, index) => {
                          const activeTimer = activeTimers[task.id];
                          const globalIndex = Object.values(groups)
                            .flat()
                            .findIndex(t => t.id === task.id);
                          const isSelected = globalIndex === selectedRowIndex;
                          return (
                            <TableRow 
                              key={task.id}
                              data-task-id={task.id}
                              onClick={() => handleTaskClick(task)}
                              className={cn(
                                "cursor-pointer transition-colors",
                                "hover:bg-muted/50",
                                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                                activeTimer && "bg-primary/5",
                                isSelected && "ring-2 ring-primary bg-primary/10"
                              )}
                              tabIndex={0}
                              aria-label={`Taak: ${task.title}`}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleTaskClick(task);
                                }
                              }}
                            >
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {String(task.sequence_number).padStart(2, '0')}
                            </TableCell>
                            <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {task.organizations?.name || "-"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {editingAssignee === task.id ? (
                          <Select
                            value={task.assignee_id || "none"}
                            onValueChange={(value) => {
                              handleUpdateAssignee(task.id, value === "none" ? null : value);
                            }}
                          >
                            <SelectTrigger className="w-[180px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Niet toegewezen</SelectItem>
                              {profiles.map((profile) => (
                                <SelectItem key={profile.id} value={profile.id}>
                                  {profile.name || "Naamloos"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : !task.assignee_id ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAssignee(task.id);
                            }}
                          >
                            Wijs toe
                          </Button>
                        ) : (
                          <div 
                            className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAssignee(task.id);
                            }}
                          >
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="bg-primary/10 text-xs font-medium">
                                {getInitials(task.profiles?.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{task.profiles?.name}</span>
                            {task.accepted_by ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <div className="h-2 w-2 rounded-full bg-amber-500" />
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <PriorityBadge taskId={task.id} priority={task.priority} size="md" />
                      </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                              {formatPeriod(task.start_at, task.due_at)}
                            </TableCell>
                            <TableCell className="min-w-[200px]">
                              {editingAction === task.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onKeyDown={(e) => handleKeyPress(e, task.id)}
                                    onBlur={() => handleSaveAction(task.id)}
                                    className="h-8"
                                    placeholder="Vervolgactie..."
                                    autoFocus
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group">
                                  <span className={task.next_action ? "" : "text-muted-foreground"}>
                                    {task.next_action || "Geen vervolgactie"}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleEditAction(task.id, task.next_action)}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {activeTimer ? (
                                <TimerCell 
                                  activeTimer={activeTimer}
                                  currentTime={currentTime}
                                  getRunningTime={getRunningTime}
                                />
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                {!task.assignee_id ? (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateAssignee(task.id, currentUserId);
                                    }}
                                    className="h-8"
                                  >
                                    <User className="h-3 w-3 mr-1" />
                                    Claim
                                  </Button>
                                ) : !task.accepted_by && task.assignee_id === currentUserId ? (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAcceptTask(task.id);
                                    }}
                                    className="h-8"
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    Accepteren
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDeleteDialog(task);
                                  }}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3 w-3" />
                                 </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={!!task.completed_at}
                                onCheckedChange={() => handleToggleComplete(task.id, task.completed_at)}
                                className="mx-auto"
                              />
                            </TableCell>
                          </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          onTaskUpdated={handleTaskUpdated}
        />
      )}
      
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Taak verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je de taak "{taskToDelete?.title}" wilt verwijderen? 
              Deze actie kan ongedaan worden gemaakt vanuit de pagina "Verwijderde Taken".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
