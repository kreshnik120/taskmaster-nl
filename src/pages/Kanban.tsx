import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignee_id: string | null;
  due_at: string | null;
  order_key: string;
  column_id?: string;
  start_at: string | null;
  next_action: string | null;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
}

interface Column {
  id: string;
  name: string;
  status: string;
  order: number;
}

const Kanban = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const navigate = useNavigate();
  const { taskId } = useParams();

  useEffect(() => {
    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadData();
      } else {
        navigate("/auth");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadData = async () => {
    try {
      // Load columns
      const { data: columnsData, error: columnsError } = await supabase
        .from("columns")
        .select("*")
        .order("order");

      if (columnsError) throw columnsError;

      if (columnsData && columnsData.length > 0) {
        setColumns(columnsData);
      } else {
        // Create default columns if none exist
        await createDefaultColumns();
      }

      // Load tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select(`
          *,
          profiles:profiles!tasks_assignee_id_fkey(name, email)
        `)
        .is("deleted_at", null)
        .order("order_key");

      if (tasksError) throw tasksError;
      setTasks(tasksData || []);

      // Real-time listener voor taak updates
      const tasksChannel = supabase
        .channel('kanban-tasks-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks'
          },
          (payload) => {
            console.log('Task change detected:', payload);
            // Herlaad taken bij elke wijziging
            supabase
              .from("tasks")
              .select(`
                *,
                profiles:profiles!tasks_assignee_id_fkey(name, email)
              `)
              .is("deleted_at", null)
              .order("order_key")
              .then(({ data }) => {
                if (data) setTasks(data);
              });
          }
        )
        .subscribe();

      // Real-time listener voor kolom updates
      const columnsChannel = supabase
        .channel('kanban-columns-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'columns'
          },
          (payload) => {
            console.log('Kolom bijgewerkt:', payload);
            setColumns((prev) =>
              prev.map((col) =>
                col.id === payload.new.id
                  ? { ...col, name: payload.new.name }
                  : col
              )
            );
          }
        )
        .subscribe();

      // Cleanup function wordt aangeroepen bij unmount
      return () => {
        supabase.removeChannel(tasksChannel);
        supabase.removeChannel(columnsChannel);
      };
    } catch (error: any) {
      toast.error("Fout bij laden van gegevens: " + error.message);
    } finally {
      setLoading(false);
    }
  };

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
      { name: "Geblokkeerd", status: "BLOCKED" as const, order: 3, project_id: projectId },
      { name: "Review", status: "REVIEW" as const, order: 4, project_id: projectId },
      { name: "Afgerond", status: "DONE" as const, order: 5, project_id: projectId },
    ];

    const { data, error } = await supabase.from("columns").insert(defaultColumns).select();

    if (error) throw error;
    if (data) setColumns(data);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) {
      console.log("Drag geannuleerd: geen geldige drop zone");
      return;
    }

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      console.error("Taak niet gevonden:", taskId);
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
        console.error("Kan kolom niet bepalen voor drop target:", over.id);
        toast.error("Fout bij verplaatsen: ongeldige bestemming");
        return;
      }
      newColumnId = targetTask.column_id;
    }

    // Check if task is already in this column
    if (task.column_id === newColumnId) {
      console.log("Taak is al in deze kolom");
      return;
    }

    const targetColumn = columns.find((c) => c.id === newColumnId);
    const oldColumn = columns.find((c) => c.id === task.column_id);
    console.log(`Verplaats taak "${task.title}" naar kolom "${targetColumn?.name}"`);

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
        console.error("Database error bij verplaatsen:", error);
        toast.error(`Fout bij verplaatsen: ${error.message}`);
        return;
      }

      // Update local state
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      );

      toast.success(`Taak verplaatst naar ${targetColumn?.name}`);
    } catch (err: any) {
      console.error("Onverwachte fout bij verplaatsen:", err);
      toast.error("Onverwachte fout bij verplaatsen van taak");
    }
  };

  const getTasksForColumn = (columnId: string) => {
    return tasks.filter((task) => task.column_id === columnId);
  };

  const handleUpdateColumnName = async (columnId: string, newName: string) => {
    try {
      const { error } = await supabase
        .from("columns")
        .update({ name: newName })
        .eq("id", columnId);

      if (error) {
        console.error("Fout bij bijwerken kolomnaam:", error);
        toast.error(`Fout bij opslaan: ${error.message}`);
        return;
      }

      // Optimistic update
      setColumns((prev) =>
        prev.map((col) =>
          col.id === columnId ? { ...col, name: newName } : col
        )
      );

      toast.success("Kolomnaam bijgewerkt");
    } catch (err: any) {
      console.error("Onverwachte fout bij bijwerken kolomnaam:", err);
      toast.error("Fout bij opslaan van kolomnaam");
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  const handleTaskUpdated = () => {
    loadData();
  };

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
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-6 overflow-auto">
          <SidebarTrigger className="mb-4" />
          <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Kanban Bord</h1>
          <p className="text-muted-foreground">Sleep taken tussen kolommen om de status te wijzigen</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe taak
        </Button>
      </div>

      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
              {columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  id={column.id}
                  title={column.name}
                  tasks={getTasksForColumn(column.id)}
                  status={column.status}
                  onUpdateName={handleUpdateColumnName}
                  onTaskClick={handleTaskClick}
                />
              ))}
        </div>
        <DragOverlay>{activeTask && <TaskCard task={activeTask} />}</DragOverlay>
      </DndContext>
          </div>
        </main>
      </div>
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
    </SidebarProvider>
  );
};

export default Kanban;
