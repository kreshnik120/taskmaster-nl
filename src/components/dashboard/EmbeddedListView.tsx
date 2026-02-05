import { useState, useEffect, useMemo, useRef, memo, useCallback } from "react";
 import { useIsMobile } from "@/hooks/use-mobile";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { KPICard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
 import { Loader2, Plus, Check, Edit2, Clock, Trash2, ArrowUp, ArrowDown, User, Users, Search, UserPlus, CheckCircle2, X, ListTodo, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCountUp } from "@/hooks/useCountUp";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PriorityBadge } from "@/components/PriorityBadge";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { TaskDialog } from "@/components/TaskDialog";
import { useMySubtasks } from "@/hooks/useMySubtasks";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatPeriod, getDateUrgency } from "@/lib/dateFormatters";
import { SUBTASK_TOKENS } from "@/lib/constants/designTokens";
import { useActiveTimers } from "@/hooks/useActiveTimers";
import { useGlobalTaskFilter } from "@/hooks/useGlobalTaskFilter";
import { getAssigneeColor } from "@/hooks/useAssigneeColor";
import { getPriorityLabel } from "@/hooks/usePriorityConfig";
 import { EmbeddedListCards } from "@/components/dashboard/EmbeddedListCards";
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
  subtasks?: Array<{
    id: string;
    title: string;
    status: string;
  }>;
}

interface Profile {
  id: string;
  name: string | null;
}


// Memoized timer cell to prevent parent re-renders
const TimerCell = memo(({ activeTimer, getRunningTime }: { activeTimer: { start: string }; getRunningTime: (start: string) => string }) => (
  <Badge variant="secondary" className="text-xs bg-primary/20">
    <Clock className="h-3 w-3 mr-1" />
    {getRunningTime(activeTimer.start)}
  </Badge>
));
TimerCell.displayName = 'TimerCell';

/**
 * Embedded List View for Dashboard tab
 * Stripped of auth check and page headers - Dashboard handles those
 */
export default function EmbeddedListView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("none");
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  
  // Centrale hooks voor timer en filter state
  const { activeTimers, getRunningTime } = useActiveTimers();
  const { showOnlyMyTasks, setShowOnlyMyTasks, userId: globalFilterUserId, loading: filterLoading } = useGlobalTaskFilter();
  const [editingAssignee, setEditingAssignee] = useState<string | null>(null);
  // currentUserId verwijderd - gebruiken nu globalFilterUserId overal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const tableRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState<string | null>(null);
  const [bulkPriority, setBulkPriority] = useState<string | null>(null);
  const [mySubtasksOpen, setMySubtasksOpen] = useState(true);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
   const isMobile = useIsMobile();
  
  // Hook for assigned subtasks
  const { subtasks: mySubtasks } = useMySubtasks(globalFilterUserId);

  // Wacht op userId voordat taken worden geladen (voorkomt race condition)
  useEffect(() => {
    if (globalFilterUserId) {
      fetchTasks();
      loadProfiles();
    }
  }, [globalFilterUserId]);

  // Refetch wanneer filter wijzigt
  useEffect(() => {
    if (globalFilterUserId) {
      fetchTasks();
    }
  }, [showOnlyMyTasks]);

  const loadProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name")
        .order("name");
      
      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      logger.error("Error loading profiles:", error);
    }
  };

  const fetchTasks = async () => {
    try {
      let query = supabase
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
          profiles:profiles!tasks_assignee_id_fkey(name, email),
          subtasks:subtasks(id, title, status)
        `)
        .is("deleted_at", null)
        .is("completed_at", null);
      
      // Filter op huidige gebruiker indien "Mijn taken" actief
      if (showOnlyMyTasks && globalFilterUserId) {
        query = query.eq("assignee_id", globalFilterUserId);
      }
      
      const { data, error } = await query.order("sequence_number", { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      logger.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  // Real-time listener via standardized hook (AFTER function definitions)
  useRealtimeChannel({
    channelName: 'embedded-list-tasks-realtime',
    table: 'tasks',
    onEvent: fetchTasks,
    debounceMs: 200
  });

  const handleToggleComplete = async (taskId: string, currentStatus: string | null) => {
    try {
      const updates: any = {
        completed_at: currentStatus ? null : new Date().toISOString()
      };

      if (!currentStatus) {
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
      logger.error("Error toggling task completion:", error);
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
      logger.error("Error updating next action:", error);
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
    if (!globalFilterUserId) return;
    
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ 
          accepted_by: globalFilterUserId,
          accepted_at: new Date().toISOString(),
          assignee_id: globalFilterUserId
        })
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Taak geaccepteerd");
      fetchTasks();
    } catch (error) {
      logger.error("Error accepting task:", error);
      toast.error("Fout bij accepteren van taak");
    }
  };

  const handleUpdateAssignee = async (taskId: string, assigneeId: string | null) => {
    try {
      const updates: any = { assignee_id: assigneeId || null };
      
      if (!assigneeId) {
        updates.accepted_by = null;
        updates.accepted_at = null;
      }
      
      if (assigneeId === globalFilterUserId) {
        updates.accepted_by = globalFilterUserId;
        updates.accepted_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);

      if (error) throw error;

      toast.success(assigneeId === globalFilterUserId ? "Taak toegewezen en geaccepteerd" : "Verantwoordelijke bijgewerkt");
      setEditingAssignee(null);
      fetchTasks();
    } catch (error) {
      logger.error("Error updating assignee:", error);
      toast.error("Fout bij bijwerken verantwoordelijke");
    }
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
    if (!taskToDelete || !globalFilterUserId) return;

    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: globalFilterUserId,
        })
        .eq("id", taskToDelete.id);

      if (error) throw error;

      toast.success("Taak verwijderd");
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
      fetchTasks();
    } catch (error) {
      logger.error("Error deleting task:", error);
      toast.error("Fout bij verwijderen van taak");
    }
  };

  // Bulk actions
  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const toggleAllTasks = () => {
    if (selectedTaskIds.size === filteredTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!globalFilterUserId || selectedTaskIds.size === 0 || isBulkDeleting) return;

    setIsBulkDeleting(true);

    try {
      const taskIdsArray = Array.from(selectedTaskIds);

      const { error } = await supabase
        .from("tasks")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: globalFilterUserId,
        })
        .in("id", taskIdsArray);

      if (error) throw error;

      toast.success(`${selectedTaskIds.size} ${selectedTaskIds.size === 1 ? 'taak' : 'taken'} verwijderd`);
      setSelectedTaskIds(new Set());
      setBulkDeleteDialogOpen(false);
      fetchTasks();
    } catch (error) {
      console.error("[EmbeddedList] Bulk delete failed:", error);
      toast.error("Fout bij verwijderen van taken");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkAssign = async (assigneeId: string | null) => {
    if (selectedTaskIds.size === 0) return;

    try {
      const updates: any = { assignee_id: assigneeId || null };
      if (!assigneeId) {
        updates.accepted_by = null;
        updates.accepted_at = null;
      }

      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .in("id", Array.from(selectedTaskIds));

      if (error) throw error;

      toast.success(`${selectedTaskIds.size} taken toegewezen`);
      setSelectedTaskIds(new Set());
      setBulkAssignee(null);
      fetchTasks();
    } catch (error) {
      console.error("Error bulk assigning:", error);
      toast.error("Fout bij toewijzen van taken");
    }
  };

  const handleBulkPriority = async (priority: string) => {
    if (selectedTaskIds.size === 0) return;

    try {
      const { error } = await supabase
        .from("tasks")
        .update({ priority: priority as "CRITICAL" | "HIGH" | "LOW" | "MEDIUM" })
        .in("id", Array.from(selectedTaskIds));

      if (error) throw error;

      toast.success(`${selectedTaskIds.size} taken bijgewerkt`);
      setSelectedTaskIds(new Set());
      setBulkPriority(null);
      fetchTasks();
    } catch (error) {
      console.error("Error bulk updating priority:", error);
      toast.error("Fout bij bijwerken van prioriteit");
    }
  };

  // Memoized filtered and sorted tasks
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter((task) => {
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase();
        const matchesTitle = task.title?.toLowerCase().includes(query);
        const matchesDescription = task.description?.toLowerCase().includes(query);
        const matchesAssignee = task.profiles?.name?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDescription && !matchesAssignee) return false;
      }
      
      if (filterPriority !== "all" && task.priority !== filterPriority) return false;
      if (filterStatus === "completed" && !task.completed_at) return false;
      if (filterStatus === "active" && task.completed_at) return false;
      if (filterStatus === "accepted" && !task.accepted_by) return false;
      return true;
    });

    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortColumn as keyof Task];
        let bVal: any = b[sortColumn as keyof Task];

        if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1;
        if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1;

        if (sortColumn === 'start_at' || sortColumn === 'due_at') {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        }

        if (typeof aVal === 'string') {
          return sortDirection === 'asc' 
            ? aVal.localeCompare(bVal) 
            : bVal.localeCompare(aVal);
        }

        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    return filtered;
  }, [tasks, filterPriority, filterStatus, sortColumn, sortDirection, debouncedSearchQuery]);

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
        key = getPriorityLabel(task.priority);
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });

    return groups;
  };

  const groups = groupedTasks();

  // KPI values
  const openTasksCount = !loading ? tasks.filter(t => !t.completed_at && !t.accepted_by).length : 0;
  const completedTodayCount = !loading ? tasks.filter(t => t.completed_at && new Date(t.completed_at).toDateString() === new Date().toDateString()).length : 0;
  const highPriorityCount = !loading ? tasks.filter(t => t.priority === 'HIGH' || t.priority === 'CRITICAL').length : 0;
  const myTasksCountValue = !loading ? filteredTasks.filter(t => t.assignee_id === globalFilterUserId).length : 0;

  // Animated counters
  const animatedOpenTasks = useCountUp({ end: openTasksCount, duration: 600 });
  const animatedCompletedToday = useCountUp({ end: completedTodayCount, duration: 600 });
  const animatedHighPriority = useCountUp({ end: highPriorityCount, duration: 600 });
  const animatedMyTasks = useCountUp({ end: myTasksCountValue, duration: 600 });

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

  const scrollToRow = (index: number) => {
    if (tableRef.current) {
      const rows = tableRef.current.querySelectorAll('tbody tr[data-task-id]');
      const row = rows[index];
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };


  if (loading || filterLoading) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Lijstweergave laden...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Embedded Header - simplified without greeting */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground flex-1">
            {filteredTasks.length} taken
            {tasks.filter(t => t.priority === 'HIGH' || t.priority === 'CRITICAL').length > 0 && 
              ` • ${tasks.filter(t => t.priority === 'HIGH' || t.priority === 'CRITICAL').length} hoge prioriteit`}
          </p>
          
          {/* Mijn taken / Alle taken Toggle */}
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
            <Button 
              variant={showOnlyMyTasks ? "default" : "ghost"} 
              size="sm"
              onClick={() => setShowOnlyMyTasks(true)}
              className="gap-1.5 h-8 px-3 text-sm"
            >
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mijn taken</span>
            </Button>
            <Button 
              variant={!showOnlyMyTasks ? "default" : "ghost"} 
              size="sm"
              onClick={() => setShowOnlyMyTasks(false)}
              className="gap-1.5 h-8 px-3 text-sm"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Alle taken</span>
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Zoek taken... (Cmd+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 px-2"
                onClick={() => setSearchQuery("")}
              >
                Wis
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end mb-4">
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

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard 
            icon={ListTodo} 
            title="Open" 
            value={animatedOpenTasks} 
            variant="count"
            onClick={() => { setFilterStatus('active'); setFilterPriority('all'); }}
          />
          <KPICard 
            icon={CheckCircle2} 
            title="Vandaag" 
            value={animatedCompletedToday} 
            variant="success"
            onClick={() => { setFilterStatus('completed'); setFilterPriority('all'); }}
          />
          <KPICard 
            icon={AlertTriangle} 
            title="High Priority" 
            value={animatedHighPriority} 
            variant="urgent"
            onClick={() => { if (highPriorityCount > 0) { setFilterPriority('HIGH'); setFilterStatus('all'); } }}
            className={cn(highPriorityCount === 0 && "opacity-50 cursor-not-allowed")}
          />
          <KPICard 
            icon={User} 
            title="Mijn Taken" 
            value={animatedMyTasks} 
            variant="personal"
            onClick={() => { if (myTasksCountValue > 0) { setFilterStatus('all'); setFilterPriority('all'); toast.info(`${myTasksCountValue} taken aan jou toegewezen`); } }}
            className={cn(myTasksCountValue === 0 && "opacity-50 cursor-not-allowed")}
          />
        </div>
      </motion.div>

      {/* My Subtasks Section */}
      <AnimatePresence>
        {mySubtasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-primary/20 bg-primary/5 overflow-hidden">
              <Collapsible open={mySubtasksOpen} onOpenChange={setMySubtasksOpen}>
                <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-primary/10 transition-colors">
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-primary" />
                    <span className="font-medium">
                      Aan jou toegewezen subtaken
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {mySubtasks.length}
                    </Badge>
                  </div>
                  {mySubtasksOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-2">
                    {mySubtasks.map((subtask) => (
                      <div
                        key={subtask.id}
                        className="flex items-center justify-between p-3 bg-background rounded-lg border hover:border-primary/40 transition-colors cursor-pointer"
                        onClick={() => {
                          const task = tasks.find(t => t.id === subtask.task_id);
                          if (task) {
                            handleTaskClick(task);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox checked={subtask.status === 'completed'} disabled />
                          <div>
                            <p className="font-medium text-sm">{subtask.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Subtaak
                            </p>
                          </div>
                        </div>
                        {subtask.due_at && (
                          <Badge variant="outline" className="text-xs">
                            {formatDistanceToNow(new Date(subtask.due_at), { addSuffix: true, locale: nl })}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Actions Bar */}
      {selectedTaskIds.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50"
        >
          <Card className="shadow-2xl border-2 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-sm font-semibold">
                    {selectedTaskIds.size} geselecteerd
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTaskIds(new Set())}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="h-6 w-px bg-border" />

                <Select value={bulkAssignee || "none"} onValueChange={(v) => {
                  if (v === "none") {
                    handleBulkAssign(null);
                  } else {
                    handleBulkAssign(v);
                  }
                }}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Toewijzen aan..." />
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

                <Select value={bulkPriority || "none"} onValueChange={(v) => {
                  if (v !== "none") {
                    handleBulkPriority(v);
                  }
                }}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Prioriteit..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Kies prioriteit</SelectItem>
                    <SelectItem value="LOW">Laag</SelectItem>
                    <SelectItem value="MEDIUM">Gemiddeld</SelectItem>
                    <SelectItem value="HIGH">Hoog</SelectItem>
                    <SelectItem value="CRITICAL">Kritiek</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteDialogOpen(true)}
                  className="h-9"
                  disabled={selectedTaskIds.size === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Verwijderen ({selectedTaskIds.size})
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Task Table */}
      <div className="space-y-8" ref={tableRef}>
        {Object.entries(groups).map(([groupName, groupTasks]) => (
          <div key={groupName}>
            {groupBy !== "none" && (
              <h2 className="mb-4 text-xl font-semibold text-muted-foreground">
                {groupName}
              </h2>
            )}
            {groupTasks.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <CheckCircle2 className="h-16 w-16 text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {searchQuery || filterPriority !== 'all' || filterStatus !== 'all' 
                      ? "Geen taken gevonden" 
                      : "Geen taken"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
                    {searchQuery || filterPriority !== 'all' || filterStatus !== 'all'
                      ? "Probeer je filters te wissen om meer resultaten te zien"
                      : "Klik op de knop hieronder om je eerste taak aan te maken"}
                  </p>
                  <div className="flex gap-3">
                    {(searchQuery || filterPriority !== 'all' || filterStatus !== 'all') && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchQuery("");
                          setFilterPriority("all");
                          setFilterStatus("all");
                        }}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Filters wissen
                      </Button>
                    )}
                    <Button onClick={() => setTaskDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Nieuwe taak
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
               isMobile ? (
                 <EmbeddedListCards
                   tasks={groupTasks}
                   selectedTaskIds={selectedTaskIds}
                   onToggleSelection={toggleTaskSelection}
                   onTaskClick={handleTaskClick}
                   onAcceptTask={handleAcceptTask}
                   onToggleComplete={handleToggleComplete}
                   openDeleteDialog={openDeleteDialog}
                   activeTimers={activeTimers}
                   getRunningTime={getRunningTime}
                   globalFilterUserId={globalFilterUserId}
                 />
               ) : (
               <div className="rounded-lg border bg-card relative overflow-auto max-h-[calc(100vh-450px)]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedTaskIds.size === filteredTasks.length && filteredTasks.length > 0}
                          onCheckedChange={toggleAllTasks}
                          aria-label="Selecteer alle taken"
                        />
                      </TableHead>
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
                    {groupTasks.map((task, index) => {
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
                            "group cursor-pointer transition-colors",
                            "hover:bg-muted/30",
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
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedTaskIds.has(task.id)}
                              onCheckedChange={() => toggleTaskSelection(task.id)}
                              aria-label={`Selecteer taak ${task.title}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {String(task.sequence_number).padStart(2, '0')}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span>{task.title}</span>
                              {(task as any).subtasks?.length > 0 && (() => {
                                const subtasks = (task as any).subtasks || [];
                                const completedCount = subtasks.filter((s: any) => s.status === 'completed').length;
                                return (
                                  <span className={cn(SUBTASK_TOKENS.counter.wrapper, "text-muted-foreground/60")}>
                                    <ListTodo className={SUBTASK_TOKENS.counter.icon} />
                                    {completedCount}/{subtasks.length}
                                  </span>
                                );
                              })()}
                            </div>
                          </TableCell>
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
                              <Badge
                                variant="outline"
                                className="text-muted-foreground cursor-pointer hover:bg-muted"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAssignee(task.id);
                                }}
                              >
                                <UserPlus className="h-3 w-3 mr-1" />
                                Niet toegewezen
                              </Badge>
                            ) : (
                              <div 
                                className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAssignee(task.id);
                                }}
                              >
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback className={`text-xs font-medium ${getAssigneeColor(task.assignee_id).avatarBg} ${getAssigneeColor(task.assignee_id).avatarText}`}>
                                    {getInitials(task.profiles?.name) || "NA"}
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
                          <TableCell className="hidden sm:table-cell">
                            {(() => {
                              const urgency = getDateUrgency(task.due_at);
                              return (
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "text-sm tabular-nums",
                                    urgency.className
                                  )}>
                                    {formatPeriod(task.start_at, task.due_at)}
                                  </span>
                                  {urgency.badge && (
                                    <span className={cn(
                                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide",
                                      urgency.status === 'overdue' && "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
                                      urgency.status === 'today' && "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400",
                                      urgency.status === 'tomorrow' && "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                                    )}>
                                      <span className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        urgency.status === 'overdue' && "bg-red-500",
                                        urgency.status === 'today' && "bg-orange-500",
                                        urgency.status === 'tomorrow' && "bg-amber-500"
                                      )} />
                                      {urgency.badge}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
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
                            {activeTimer && (
                              <TimerCell activeTimer={activeTimer} getRunningTime={getRunningTime} />
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteDialog(task);
                              }}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={!!task.completed_at}
                              onCheckedChange={() => handleToggleComplete(task.id, task.completed_at)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Markeer als afgerond"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
               )
            )}
          </div>
        ))}
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onTaskUpdated={handleTaskUpdated}
      />

      {/* Task Dialog */}
      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        onSuccess={() => {
          setTaskDialogOpen(false);
          fetchTasks();
        }}
      />

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Taak verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je "{taskToDelete?.title}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedTaskIds.size} taken verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je {selectedTaskIds.size} {selectedTaskIds.size === 1 ? 'taak' : 'taken'} wilt verwijderen? 
              Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Annuleren</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete} 
              className="bg-destructive text-destructive-foreground"
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verwijderen...
                </>
              ) : (
                `${selectedTaskIds.size} ${selectedTaskIds.size === 1 ? 'taak' : 'taken'} verwijderen`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
