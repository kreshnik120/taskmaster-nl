import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { PageContainer } from "@/components/ui/page-container";
import { KanbanColumn } from "@/components/KanbanColumn";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KPICard } from "@/components/ui/kpi-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Loader2, AlertCircle, Search, ListTodo, Clock, CheckCircle2, ArrowUp, ArrowDown, ArrowUpDown, Calendar, GripVertical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAiScoring } from "@/hooks/useAiScoring";
import { useGreeting } from "@/hooks/useGreeting";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";

import { logger } from "@/lib/logger";

const log = logger.create('Kanban');

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
}

interface Column {
  id: string;
  name: string;
  originalName: string; // De standaard naam voor iedereen
  status: string;
  order: number;
  isCollapsed: boolean; // Persoonlijke collapsed state
}

interface Subtask {
  id: string;
  title: string;
  task_id: string;
  status: string;
  assignee_id: string | null;
  due_at: string | null;
  order: number;
  parent_task?: {
    id: string;
    title: string;
    column_id: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };
}

const Kanban = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [mySubtasks, setMySubtasks] = useState<Subtask[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastScrolledKpi, setLastScrolledKpi] = useState<string | null>(null);
  
  
  // Sorteer-voorkeur met localStorage persistentie (enterprise-niveau)
  const [sortBy, setSortBy] = useState<'due_at' | 'priority' | 'created_at' | 'manual'>(() => {
    const stored = localStorage.getItem('kanban-sort-by');
    return (stored as 'due_at' | 'priority' | 'created_at' | 'manual') || 'due_at';
  });
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => {
    const stored = localStorage.getItem('kanban-sort-direction');
    return (stored as 'asc' | 'desc') || 'asc';
  });
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Priority ranking voor sortering
  const priorityRank: Record<string, number> = {
    'CRITICAL': 4,
    'HIGH': 3,
    'MEDIUM': 2,
    'LOW': 1,
  };
  const navigate = useNavigate();
  const { taskId } = useParams();
  
  // Sensors configuratie met distance threshold
  // Voorkomt dat klikken als drag worden geregistreerd
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10, // Pas na 10px beweging wordt het een drag
      },
    })
  );
  
  // AI Scoring - hook called for side effects
  useAiScoring(tasks, true);

  // Personalized greeting - must be called before any early returns (React hooks rule)
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0];
  const { fullGreeting } = useGreeting(displayName);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Load data when user is set or filter changes
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  // Filter persistentie wordt nu afgehandeld door useGlobalTaskFilter hook

  // Persist sorteer voorkeuren
  useEffect(() => {
    localStorage.setItem('kanban-sort-by', sortBy);
    localStorage.setItem('kanban-sort-direction', sortDirection);
  }, [sortBy, sortDirection]);

  // Aparte functie om subtaken te laden (voor realtime refresh)
  const loadSubtasks = async () => {
    if (!user) return;

    const { data: subtasksData } = await supabase
      .from('subtasks')
      .select(`
        id, title, task_id, status, assignee_id, due_at, "order",
        tasks!inner(id, title, column_id, priority, deleted_at)
      `)
      .eq('assignee_id', user.id)
      .in('status', ['pending', 'active'])
      .is('tasks.deleted_at', null);

    const formattedSubtasks = (subtasksData || []).map((s: any) => ({
      ...s,
      parent_task: s.tasks
    }));
    setMySubtasks(formattedSubtasks);
  };

  const loadData = async () => {
    try {
      // Load columns
      const { data: columnsData, error: columnsError } = await supabase
        .from("columns")
        .select("*")
        .order("order");

      if (columnsError) throw columnsError;

      if (columnsData && columnsData.length > 0) {
        // Laad persoonlijke kolom voorkeuren
        const { data: prefsData } = await supabase
          .from("user_column_preferences")
          .select("column_id, custom_name, is_collapsed")
          .eq("user_id", user.id);

        const prefsMap = new Map(
          (prefsData || []).map(p => [p.column_id, p])
        );

        // Merge kolommen met persoonlijke voorkeuren
        const mergedColumns = columnsData.map(col => ({
          ...col,
          originalName: col.name,
          name: prefsMap.get(col.id)?.custom_name || col.name,
          isCollapsed: prefsMap.get(col.id)?.is_collapsed || false,
        }));

        setColumns(mergedColumns);
      } else {
        // Create default columns if none exist
        await createDefaultColumns();
      }

      // Load tasks with scoring metadata - filter by user if showOnlyMyTasks
      let query = supabase
        .from("tasks")
        .select(`
          *,
          profiles:profiles!tasks_assignee_id_fkey(name, email),
          task_scoring_metadata(*)
        `)
        .is("deleted_at", null)
        .is("completed_at", null);  // TOEGEVOEGD: Filter completed tasks uit actieve kolommen
      
      
      const { data: tasksData, error: tasksError } = await query.order("order_key");

      if (tasksError) throw tasksError;
      setTasks(tasksData || []);

      // Laad subtaken via aparte functie (ook gebruikt door realtime)
      await loadSubtasks();

      setLoading(false);
    } catch (error) {
      log.error('Error loading data:', error);
      setLoading(false);
      toast.error("Er is een fout opgetreden bij het laden van data");
    }
  };

  // Realtime subscription voor subtaken - direct updates bij toewijzing (AFTER function definitions)
  useRealtimeChannel({
    channelName: 'kanban-subtasks-realtime',
    table: 'subtasks',
    filter: user ? `assignee_id=eq.${user.id}` : undefined,
    onEvent: loadSubtasks,
    debounceMs: 200,
    enabled: !!user
  });

  // Realtime subscription voor taken - updates van alle gebruikers
  useRealtimeChannel({
    channelName: 'kanban-tasks-realtime',
    table: 'tasks',
    onEvent: loadData,
    debounceMs: 200,
    enabled: !!user
  });

  const createDefaultColumns = async () => {
    const { data: orgsData } = await supabase.from("organizations").select("id").limit(1);

    if (!orgsData || orgsData.length === 0) {
      // Create default organization
      const { data: newOrg, error: orgError } = await supabase
        .from("organizations")
        .insert({ name: "Standaard Organisatie" })
        .select()
        .single();

      if (orgError) throw orgError;

      // Link user to org
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("user_organizations")
          .insert({ user_id: user.id, org_id: newOrg.id, role: "OWNER" });
      }

      orgsData.push(newOrg);
    }

    const { data: projectsData } = await supabase.from("projects").select("id").limit(1);

    let projectId = projectsData?.[0]?.id;

    if (!projectId) {
      const { data: newProject } = await supabase
        .from("projects")
        .insert({ name: "Standaard Project", org_id: orgsData[0].id })
        .select()
        .single();

      projectId = newProject?.id;
    }

    const defaultColumns: Array<{
      name: string;
      status: "BACKLOG" | "READY" | "DOING" | "BLOCKED" | "REVIEW" | "DONE";
      order: number;
      project_id: string;
    }> = [
      { name: "Backlog", status: "BACKLOG" as const, order: 0, project_id: projectId },
      { name: "Klaar", status: "READY" as const, order: 1, project_id: projectId },
      { name: "Bezig", status: "DOING" as const, order: 2, project_id: projectId },
      { name: "In afwachting", status: "BLOCKED" as const, order: 3, project_id: projectId },
      { name: "Review", status: "REVIEW" as const, order: 4, project_id: projectId },
      { name: "Afgerond", status: "DONE" as const, order: 5, project_id: projectId },
    ];

    const { data, error } = await supabase.from("columns").insert(defaultColumns).select();

    if (error) throw error;
    if (data) {
      // Voeg originalName en isCollapsed toe aan nieuwe kolommen
      setColumns(data.map(col => ({ ...col, originalName: col.name, isCollapsed: false })));
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    // Add dragging class to freeze hover transforms globally
    document.documentElement.classList.add('dnd-dragging');
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    // Remove dragging class to restore hover effects
    document.documentElement.classList.remove('dnd-dragging');
    const { active, over } = event;
    setActiveTask(null);

    if (!over) {
      log.log("Drag geannuleerd: geen geldige drop zone");
      return;
    }

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      log.error("Taak niet gevonden:", taskId);
      toast.error("Taak niet gevonden");
      return;
    }

    // Detecteer of over.id een column ID of task ID is
    let newColumnId: string;
    const isColumnId = columns.some((c) => c.id === over.id);
    
    if (isColumnId) {
      // Direct op een kolom gesleept
      newColumnId = over.id as string;
    } else {
      // Op een taak gesleept, zoek de column_id van die taak
      const targetTask = tasks.find((t) => t.id === over.id);
      if (!targetTask || !targetTask.column_id) {
        log.error("Kan kolom niet bepalen voor drop target:", over.id);
        toast.error("Fout bij verplaatsen: ongeldige bestemming");
        return;
      }
      newColumnId = targetTask.column_id;
    }

    // Check if task is already in this column
    if (task.column_id === newColumnId) {
      log.log("Taak is al in deze kolom");
      return;
    }

    const targetColumn = columns.find((c) => c.id === newColumnId);
    const oldColumn = columns.find((c) => c.id === task.column_id);
    log.log(`Verplaats taak "${task.title}" naar kolom "${targetColumn?.name}"`);

    try {
      // Bereid updates voor
      const updates: any = { column_id: newColumnId };
      
      // Synchroniseer completed_at met kolom status
      if (targetColumn?.status === "DONE") {
        // Verplaatst naar "Afgerond" kolom → markeer als afgerond
        updates.completed_at = new Date().toISOString();
      } else if (oldColumn?.status === "DONE") {
        // Verplaatst WEG van "Afgerond" kolom → markeer als actief
        updates.completed_at = null;
      }

      // Update task in database
      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);

      if (error) {
        log.error("Database error bij verplaatsen:", error);
        toast.error(`Fout bij verplaatsen: ${error.message}`);
        return;
      }

      // Update local state
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      );

      toast.success(`Taak verplaatst naar ${targetColumn?.name}`);
    } catch (err: any) {
      log.error("Onverwachte fout bij verplaatsen:", err);
      toast.error("Onverwachte fout bij verplaatsen van taak");
    }
  };

  const getTasksForColumn = (columnId: string) => {
    const column = columns.find(c => c.id === columnId);
    
    // For Backlog column, also include tasks without a column_id (null or undefined)
    let filteredTasks: Task[];
    if (column?.status === 'BACKLOG') {
      filteredTasks = tasks.filter((task) => 
        task.column_id === columnId || 
        task.column_id === null || 
        task.column_id === undefined
      );
    } else {
      filteredTasks = tasks.filter((task) => task.column_id === columnId);
    }
    
    // Apply search filter
    if (searchQuery) {
      filteredTasks = filteredTasks.filter((task: Task) => 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Sorteer de gefilterde taken
    if (sortBy !== 'manual') {
      filteredTasks = [...filteredTasks].sort((a, b) => {
        if (sortBy === 'due_at') {
          // Taken zonder due_at onderaan
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
    }
    
    return filteredTasks;
  };

  const handleUpdateColumnName = async (columnId: string, newName: string) => {
    try {
      // Sla op naar persoonlijke voorkeuren (niet naar globale columns tabel)
      const { error } = await supabase
        .from("user_column_preferences")
        .upsert({
          user_id: user.id,
          column_id: columnId,
          custom_name: newName,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,column_id'
        });

      if (error) {
        log.error("Fout bij bijwerken kolomnaam:", error);
        toast.error(`Fout bij opslaan: ${error.message}`);
        return;
      }

      // Optimistic update
      setColumns((prev) =>
        prev.map((col) =>
          col.id === columnId ? { ...col, name: newName } : col
        )
      );

      toast.success("Je kolomnaam is opgeslagen");
    } catch (err: any) {
      log.error("Onverwachte fout bij bijwerken kolomnaam:", err);
      toast.error("Fout bij opslaan van kolomnaam");
    }
  };

  // Toggle collapsed state naar database met error feedback
  const handleToggleColumnCollapse = async (columnId: string, collapsed: boolean) => {
    try {
      const column = columns.find(c => c.id === columnId);
      const { error } = await supabase
        .from("user_column_preferences")
        .upsert({
          user_id: user.id,
          column_id: columnId,
          custom_name: column?.name || column?.originalName || '',
          is_collapsed: collapsed,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,column_id'
        });

      if (error) {
        log.error("Fout bij opslaan collapsed state:", error);
        toast.error("Kon voorkeur niet opslaan");
        return; // Geen optimistic update bij error
      }

      // Optimistic update alleen bij succes
      setColumns((prev) =>
        prev.map((col) =>
          col.id === columnId ? { ...col, isCollapsed: collapsed } : col
        )
      );
    } catch (err: any) {
      log.error("Onverwachte fout bij collapsed state:", err);
      toast.error("Er ging iets mis bij het opslaan");
    }
  };

  // Haal subtaken voor een specifieke kolom met sortering
  const getSubtasksForColumn = (columnId: string) => {
    let columnSubtasks = mySubtasks.filter(s => s.parent_task?.column_id === columnId);
    
    // Zelfde sorteerlogica als taken
    if (sortBy !== 'manual') {
      columnSubtasks = [...columnSubtasks].sort((a, b) => {
        if (sortBy === 'due_at') {
          if (!a.due_at && !b.due_at) return 0;
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          const dateA = new Date(a.due_at).getTime();
          const dateB = new Date(b.due_at).getTime();
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
        }
        
        if (sortBy === 'priority') {
          const rankA = priorityRank[a.parent_task?.priority || 'LOW'] || 0;
          const rankB = priorityRank[b.parent_task?.priority || 'LOW'] || 0;
          return sortDirection === 'asc' ? rankA - rankB : rankB - rankA;
        }
        
        if (sortBy === 'created_at') {
          // Subtasks: sorteer op order als fallback
          return sortDirection === 'asc' ? a.order - b.order : b.order - a.order;
        }
        
        return 0;
      });
    }
    
    return columnSubtasks;
  };

  const handleSubtaskClick = (subtask: Subtask) => {
    // Zoek de parent taak en open die in de modal
    const parentTask = tasks.find(t => t.id === subtask.task_id);
    if (parentTask) {
      setSelectedTask(parentTask);
      setDetailModalOpen(true);
      toast.info(`Subtaak: ${subtask.title}`);
    } else {
      // Als de parent taak niet geladen is (bijv. andere assignee), laad hem apart
      loadParentTaskAndOpen(subtask.task_id, subtask.title);
    }
  };

  const loadParentTaskAndOpen = async (taskId: string, subtaskTitle: string) => {
    const { data, error } = await supabase
      .from("tasks")
      .select(`*, profiles:profiles!tasks_assignee_id_fkey(name, email), task_scoring_metadata(*)`)
      .eq("id", taskId)
      .single();
    
    if (data && !error) {
      setSelectedTask(data);
      setDetailModalOpen(true);
      toast.info(`Subtaak: ${subtaskTitle}`);
    } else {
      toast.error("Kon de taak niet laden");
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  // Enterprise-niveau: Memoized subtasks grouped by task_id voor efficiënte lookup
  const subtasksByTaskId = useMemo(() => {
    const map = new Map<string, Subtask[]>();
    mySubtasks.forEach(s => {
      const taskId = s.task_id;
      if (!map.has(taskId)) map.set(taskId, []);
      map.get(taskId)!.push(s);
    });
    return map;
  }, [mySubtasks]);

  // Granulaire refresh: alleen subtasks herladen na subtask wijziging
  const handleTaskUpdated = useCallback(() => {
    loadSubtasks();
    loadData(); // Full reload om column_id sync te garanderen
  }, [user]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === 'n' && !dialogOpen && !detailModalOpen) {
        e.preventDefault();
        setDialogOpen(true);
      }
      if (e.key === '/' && !dialogOpen && !detailModalOpen) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setDialogOpen(false);
        setDetailModalOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogOpen, detailModalOpen]);

  // Auto-open task modal from URL parameter
  useEffect(() => {
    if (taskId && tasks.length > 0 && !loading) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        setSelectedTask(task);
        setDetailModalOpen(true);
        toast.success("Navigeren naar taak...");
      } else {
        toast.error("Taak niet gevonden");
        navigate("/kanban");
      }
    }
  }, [taskId, tasks, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Kanban bord laden...</p>
      </div>
    );
  }


  const activeTasks = getTasksForColumn(columns.find(c => c.status === 'DOING')?.id || '').length + 
                      getTasksForColumn(columns.find(c => c.status === 'REVIEW')?.id || '').length;
  const blockedCount = getTasksForColumn(columns.find(c => c.status === 'BLOCKED')?.id || '').length;
  const reviewCount = getTasksForColumn(columns.find(c => c.status === 'REVIEW')?.id || '').length;
  const completedToday = tasks.filter(t => t.completed_at && new Date(t.completed_at).toDateString() === new Date().toDateString()).length;

  return (
    <PageContainer contextColor="indigo">
      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPICard 
          icon={ListTodo} 
          title="Actieve taken" 
          value={activeTasks} 
          variant="count"
          isActive={lastScrolledKpi === "active"}
          onClick={() => {
            const firstColumn = columns[0];
            if (firstColumn) {
              document.getElementById(`column-${firstColumn.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setLastScrolledKpi("active");
              setTimeout(() => setLastScrolledKpi(null), 2000);
            }
          }}
        />
        <KPICard 
          icon={Clock} 
          title="In afwachting" 
          value={blockedCount} 
          variant="time"
          isActive={lastScrolledKpi === "blocked"}
          onClick={() => {
            const blockedColumn = columns.find(c => c.status === 'BLOCKED');
            if (blockedColumn) {
              document.getElementById(`column-${blockedColumn.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setLastScrolledKpi("blocked");
              setTimeout(() => setLastScrolledKpi(null), 2000);
            }
          }}
        />
        <KPICard 
          icon={Clock} 
          title="In Review" 
          value={reviewCount} 
          variant="time"
          isActive={lastScrolledKpi === "review"}
          onClick={() => {
            const reviewColumn = columns.find(c => c.status === 'REVIEW');
            if (reviewColumn) {
              document.getElementById(`column-${reviewColumn.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setLastScrolledKpi("review");
              setTimeout(() => setLastScrolledKpi(null), 2000);
            }
          }}
        />
        <KPICard 
          icon={CheckCircle2} 
          title="Vandaag afgerond" 
          value={completedToday} 
          variant="success"
          isActive={lastScrolledKpi === "done"}
          onClick={() => {
            const doneColumn = columns.find(c => c.status === 'DONE');
            if (doneColumn) {
              document.getElementById(`column-${doneColumn.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setLastScrolledKpi("done");
              setTimeout(() => setLastScrolledKpi(null), 2000);
            }
          }}
        />
      </div>

      {/* Compact Header with Personalized Greeting */}
      <div className="flex items-center justify-between py-4 border-b mb-6">
        <div>
          <h1 className="text-xl font-medium text-foreground">
            Team Kanban Bord
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Team overzicht • {activeTasks} actief • {blockedCount} in afwachting • {completedToday} vandaag afgerond
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sorteer controls - subtiele pill-style */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-8 w-[130px] border-0 bg-transparent hover:bg-muted/80 transition-colors focus:ring-0">
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent align="start" className="bg-popover">
                <SelectItem value="due_at">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Deadline</span>
                  </div>
                </SelectItem>
                <SelectItem value="priority">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Prioriteit</span>
                  </div>
                </SelectItem>
                <SelectItem value="created_at">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Aangemaakt</span>
                  </div>
                </SelectItem>
                <SelectItem value="manual">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Handmatig</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            
            {/* Richting toggle met tooltip - alleen zichtbaar bij niet-manual */}
            {sortBy !== 'manual' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                    className="h-8 w-8 p-0 hover:bg-muted/80"
                  >
                    {sortDirection === 'asc' ? (
                      <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {sortBy === 'priority' 
                    ? (sortDirection === 'asc' ? 'Laagste prioriteit eerst' : 'Hoogste prioriteit eerst')
                    : (sortDirection === 'asc' ? 'Vroegste eerst' : 'Laatste eerst')
                  }
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Zoek taken... (druk /)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {blockedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blockedColumn = columns.find(c => c.status === 'BLOCKED');
                if (blockedColumn) {
                  document.getElementById(`column-${blockedColumn.id}`)?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="gap-2"
            >
              <Clock className="h-4 w-4 text-amber-500" />
              Toon in afwachting
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Nieuwe taak
          </Button>
        </div>
      </div>

            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {columns.map((column) => (
                  <div key={column.id} id={`column-${column.id}`}>
                    <KanbanColumn
                      id={column.id}
                      title={column.name}
                      tasks={getTasksForColumn(column.id)}
                      subtasks={getSubtasksForColumn(column.id)}
                      subtasksByTaskId={subtasksByTaskId}
                      status={column.status}
                      isCollapsed={column.isCollapsed}
                      onUpdateName={handleUpdateColumnName}
                      onToggleCollapse={handleToggleColumnCollapse}
                      onTaskClick={handleTaskClick}
                      onSubtaskClick={handleSubtaskClick}
                    />
                  </div>
                ))}
              </div>
              {/* DRAG OVERLAY - NO transforms, only shadows for floating effect */}
              <DragOverlay dropAnimation={null}>
                {activeTask && (
                  <div className="cursor-grabbing">
                    <div className="glass-drag-overlay-enhanced">
                      <TaskCard 
                        task={activeTask} 
                        subtasks={subtasksByTaskId.get(activeTask.id) || []}
                      />
                    </div>
                  </div>
                )}
              </DragOverlay>
            </DndContext>

      <TaskDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
        onSuccess={loadData}
        columnId={columns.find(c => c.status === "BACKLOG")?.id}
      />
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          onTaskUpdated={handleTaskUpdated}
        />
      )}
    </PageContainer>
  );
};

export default Kanban;
