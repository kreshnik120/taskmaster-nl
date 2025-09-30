import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Undo2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface CompletedTask {
  id: string;
  title: string;
  priority: string;
  completed_at: string;
  org_id: string;
  organizations?: {
    name: string;
  };
}

const priorityColors: Record<string, string> = {
  LOW: "text-priority-low",
  MEDIUM: "text-priority-medium",
  HIGH: "text-priority-high",
  CRITICAL: "text-priority-critical",
};

const priorityLabels: Record<string, string> = {
  LOW: "Laag",
  MEDIUM: "Middel",
  HIGH: "Hoog",
  CRITICAL: "Kritiek",
};

const AfgerondeTaken = () => {
  const [tasks, setTasks] = useState<CompletedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    fetchCompletedTasks();
  };

  const fetchCompletedTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          priority,
          completed_at,
          org_id,
          organizations (
            name
          )
        `)
        .not("completed_at", "is", null)
        .is("deleted_at", null)
        .order("completed_at", { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching completed tasks:", error);
      toast.error("Fout bij ophalen van afgeronde taken");
    } finally {
      setLoading(false);
    }
  };

  const handleReopen = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ completed_at: null })
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Taak is heropend");
      fetchCompletedTasks();
    } catch (error) {
      console.error("Error reopening task:", error);
      toast.error("Fout bij heropenen van taak");
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-6">
          <SidebarTrigger className="mb-4" />
          
          <Card>
            <CardHeader>
              <CardTitle>Afgeronde taken</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Laden...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Geen afgeronde taken gevonden
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Taak</TableHead>
                      <TableHead>Organisatie</TableHead>
                      <TableHead>Prioriteit</TableHead>
                      <TableHead>Afgerond op</TableHead>
                      <TableHead className="text-right">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>{task.organizations?.name || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={priorityColors[task.priority]}>
                            {priorityLabels[task.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(task.completed_at), "dd MMM yyyy HH:mm", { locale: nl })}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReopen(task.id)}
                            className="text-primary hover:text-primary hover:bg-primary/10"
                          >
                            <Undo2 className="h-4 w-4 mr-1" />
                            Heropenen
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default AfgerondeTaken;
