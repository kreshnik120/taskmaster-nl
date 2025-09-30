import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, Filter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  MEDIUM: "Middel",
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

  useEffect(() => {
    checkAuth();
    fetchTasks();
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
          assignee:profiles!tasks_assignee_id_fkey(name)
        `)
        .order("start_at", { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
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
                  <SelectItem value="MEDIUM">Middel</SelectItem>
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
                        <TableHead>Volgende actie</TableHead>
                        <TableHead className="w-[100px]">Afgerond</TableHead>
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
                        groupTasks.map((task) => (
                          <TableRow key={task.id} className="cursor-pointer hover:bg-muted/50">
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
                            <TableCell className="max-w-[200px] truncate">
                              {task.next_action || "-"}
                            </TableCell>
                            <TableCell>
                              {task.completed_at ? (
                                <Badge variant="secondary">✓</Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
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
