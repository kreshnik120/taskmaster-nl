import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Undo2, Trash2, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface DeletedTask {
  id: string;
  title: string;
  priority: string;
  deleted_at: string;
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

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
};

const VerwijderdeTaken = () => {
  const [tasks, setTasks] = useState<DeletedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
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
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    fetchDeletedTasks();
  };

  const fetchDeletedTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          priority,
          deleted_at,
          org_id,
          organizations (
            name
          )
        `)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching deleted tasks:", error);
      toast.error("Fout bij ophalen van verwijderde taken");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Taak is teruggezet");
      fetchDeletedTasks();
    } catch (error) {
      console.error("Error restoring task:", error);
      toast.error("Fout bij terugzetten van taak");
    }
  };

  const handlePermanentDelete = async () => {
    if (!taskToDelete) return;

    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskToDelete);

      if (error) throw error;

      toast.success("Taak definitief verwijderd");
      fetchDeletedTasks();
    } catch (error) {
      console.error("Error permanently deleting task:", error);
      toast.error("Fout bij definitief verwijderen");
    } finally {
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    }
  };

  const openDeleteDialog = (taskId: string) => {
    setTaskToDelete(taskId);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div>
        <h1 className="text-2xl font-semibold mb-1">Verwijderde Taken</h1>
        <p className="text-sm text-muted-foreground">
          Terugzetten of definitief verwijderen
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3">
        {/* Totaal */}
        <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-card border cursor-pointer hover:bg-muted/50 transition-colors">
          <span className="text-3xl font-bold">{tasks.length}</span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Totaal</span>
        </div>
        
        {/* Kritiek */}
        <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-card border cursor-pointer hover:bg-muted/50 transition-colors">
          <span className={`text-3xl font-bold ${
            tasks.filter(t => t.priority === 'CRITICAL').length > 0 ? 'text-destructive' : ''
          }`}>
            {tasks.filter(t => t.priority === 'CRITICAL').length}
          </span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Kritiek</span>
        </div>
        
        {/* Recent */}
        <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-card border cursor-pointer hover:bg-muted/50 transition-colors">
          <span className="text-3xl font-bold">
            {tasks.filter(t => {
              const deletedDate = new Date(t.deleted_at);
              const threeDaysAgo = new Date();
              threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
              return deletedDate >= threeDaysAgo;
            }).length}
          </span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Recent</span>
        </div>
        
        {/* Herstelbaar */}
        <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-card border cursor-pointer hover:bg-muted/50 transition-colors">
          <span className="text-3xl font-bold">{tasks.length}</span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Herstelbaar</span>
        </div>
      </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alle verwijderde taken</CardTitle>
              <CardDescription>
                {tasks.length > 0 ? `${tasks.length} taken in prullenbak` : 'Prullenbak is leeg'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Laden...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Geen verwijderde taken gevonden
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Taak</TableHead>
                      <TableHead>Organisatie</TableHead>
                      <TableHead>Prioriteit</TableHead>
                      <TableHead>Verwijderd op</TableHead>
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
                          {format(new Date(task.deleted_at), "dd MMM yyyy HH:mm", { locale: nl })}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestore(task.id)}
                            className="text-primary hover:text-primary hover:bg-primary/10"
                          >
                            <Undo2 className="h-4 w-4 mr-1" />
                            Terugzetten
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(task.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Definitief verwijderen
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Definitief verwijderen</AlertDialogTitle>
                <AlertDialogDescription>
                  Weet je zeker dat je deze taak definitief wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction onClick={handlePermanentDelete} className="bg-destructive hover:bg-destructive/90">
                  Definitief verwijderen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
    </div>
  );
};

export default VerwijderdeTaken;
