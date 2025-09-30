import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, Filter, Plus, Check, Edit2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Task {
  id: string;
  title: string;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  next_action: string | null;
  completed_at: string | null;
  org_id: string;
  assignee_id: string | null;
  organizations: { name: string } | null;
  profiles: { name: string | null } | null;
}

const priorityColors = {
  LOW: "bg-priority-low text-priority-low-foreground",
  MEDIUM: "bg-priority-medium text-priority-medium-foreground",
  HIGH: "bg-priority-high text-priority-high-foreground",
  CRITICAL: "bg-priority-critical text-priority-critical-foreground",
};

const priorityLabels = {
  LOW: "Laag",
  MEDIUM: "Gemiddeld",
  HIGH: "Hoog",
  CRITICAL: "Kritiek",
};

export default function Lijst() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("none");
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [activeTimers, setActiveTimers] = useState<Record<string, { user_id: string; start: string; profiles: { name: string | null } | null }>>({});

  useEffect(() => {
    checkAuth();
    fetchTasks();
    loadActiveTimers();

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

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          priority,
          start_at,
          due_at,
          next_action,
          completed_at,
          org_id,
          assignee_id,
          organizations(name),
          profiles:profiles!tasks_assignee_id_fkey(name)
        `)
        .is("deleted_at", null)
        .order("start_at", { ascending: true });

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
    const now = new Date();
    const startTime = new Date(start);
    const minutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}u ${mins}m`;
  };

  const handleToggleComplete = async (taskId: string, currentStatus: string | null) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ 
          completed_at: currentStatus ? null : new Date().toISOString() 
        })
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

  const filteredTasks = tasks.filter((task) => {
    if (filterPriority !== "all" && task.priority !== filterPriority) return false;
    if (filterStatus === "completed" && !task.completed_at) return false;
    if (filterStatus === "active" && task.completed_at) return false;
    return true;
  });

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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-background p-6">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold">Lijstweergave</h1>
            <div className="flex gap-2">
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Groeperen op" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen groepering</SelectItem>
                  <SelectItem value="start">Startdatum</SelectItem>
                  <SelectItem value="due">Einddatum</SelectItem>
                  <SelectItem value="priority">Prioriteit</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Prioriteit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle prioriteiten</SelectItem>
                  <SelectItem value="LOW">Laag</SelectItem>
                  <SelectItem value="MEDIUM">Gemiddeld</SelectItem>
                  <SelectItem value="HIGH">Hoog</SelectItem>
                  <SelectItem value="CRITICAL">Kritiek</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle taken</SelectItem>
                  <SelectItem value="active">Actief</SelectItem>
                  <SelectItem value="completed">Afgerond</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-8">
            {Object.entries(groups).map(([groupName, groupTasks]) => (
              <div key={groupName}>
                {groupBy !== "none" && (
                  <h2 className="mb-4 text-xl font-semibold text-muted-foreground">
                    {groupName}
                  </h2>
                )}
                <div className="rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">ID</TableHead>
                        <TableHead>Taak</TableHead>
                        <TableHead>Organisatie</TableHead>
                        <TableHead>Verantwoordelijke</TableHead>
                        <TableHead>Prioriteit</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>Eind</TableHead>
                        <TableHead className="min-w-[200px]">Volgende actie</TableHead>
                        <TableHead className="w-[120px]">Timer</TableHead>
                        <TableHead className="w-[80px] text-center">Afgerond</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupTasks.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            Geen taken gevonden
                          </TableCell>
                        </TableRow>
                      ) : (
                        groupTasks.map((task) => {
                          const activeTimer = activeTimers[task.id];
                          return (
                            <TableRow 
                              key={task.id} 
                              className={`cursor-pointer hover:bg-muted/50 ${
                                activeTimer ? "bg-primary/5" : ""
                              }`}
                            >
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {task.id.substring(0, 6)}
                            </TableCell>
                            <TableCell className="font-medium">{task.title}</TableCell>
                            <TableCell>
                              {task.organizations?.name || "-"}
                            </TableCell>
                            <TableCell>
                              {task.profiles?.name || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge className={priorityColors[task.priority as keyof typeof priorityColors]}>
                                {priorityLabels[task.priority as keyof typeof priorityLabels]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {task.start_at
                                ? format(new Date(task.start_at), "dd MMM yyyy", { locale: nl })
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {task.due_at
                                ? format(new Date(task.due_at), "dd MMM yyyy", { locale: nl })
                                : "-"}
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
                            <TableCell>
                              {activeTimer ? (
                                <Badge variant="secondary" className="text-xs bg-primary/20">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {getRunningTime(activeTimer.start)}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
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
        </main>
      </div>
    </SidebarProvider>
  );
}
