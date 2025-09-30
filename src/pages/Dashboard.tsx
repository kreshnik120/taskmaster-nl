import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, CheckCircle2, Clock, Trash2, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { TaskDialog } from "@/components/TaskDialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Task {
  id: string;
  title: string;
  priority: string;
  due_at?: string;
  next_action?: string;
}

const Dashboard = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"high-to-low" | "low-to-high">("high-to-low");

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .is("completed_at", null)
        .order("due_at", { ascending: true })
        .limit(10);

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;

    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskToDelete);

      if (error) throw error;

      toast.success("Taak verwijderd");
      loadTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Fout bij verwijderen van taak");
    } finally {
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    }
  };

  const openDeleteDialog = (taskId: string) => {
    setTaskToDelete(taskId);
    setDeleteDialogOpen(true);
  };

  const priorityValue: Record<string, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (sortOrder === "high-to-low") {
      return priorityValue[b.priority] - priorityValue[a.priority];
    } else {
      return priorityValue[a.priority] - priorityValue[b.priority];
    }
  });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mijn dag</h1>
          <p className="text-muted-foreground">
            {format(new Date(), "EEEE, d MMMM yyyy", { locale: nl })}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe taak
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vandaag</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tasks.length}</div>
            <p className="text-xs text-muted-foreground">Openstaande taken</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Afgerond</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Deze week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tijdregistratie</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0u</div>
            <p className="text-xs text-muted-foreground">Vandaag gewerkt</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Focus taken</CardTitle>
              <CardDescription>De belangrijkste taken om vandaag aan te werken</CardDescription>
            </div>
            <Select value={sortOrder} onValueChange={(value: any) => setSortOrder(value)}>
              <SelectTrigger className="w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high-to-low">Hoog → Laag</SelectItem>
                <SelectItem value="low-to-high">Laag → Hoog</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Laden...</p>
          ) : tasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Geen openstaande taken. Klik op "Nieuwe taak" om te beginnen!
            </p>
          ) : (
            <div className="space-y-3">
              {sortedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium">{task.title}</p>
                    {task.next_action && (
                      <p className="text-sm text-muted-foreground mt-1">{task.next_action}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={priorityColors[task.priority]}>
                      {priorityLabels[task.priority]}
                    </Badge>
                    {task.due_at && (
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(task.due_at), "d MMM", { locale: nl })}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDeleteDialog(task.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          loadTasks();
        }}
        columnId={undefined}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Taak verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze taak wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
