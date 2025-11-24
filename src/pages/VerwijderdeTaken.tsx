import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-6">
          <SidebarTrigger className="mb-4" />
          
          {/* Hero Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-4xl font-bold">
                    {getGreeting()}, {user?.user_metadata?.name || 'daar'}
                  </h1>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Trash2 className="h-4 w-4" />
                    Prullenbak
                  </Badge>
                </div>
                <p className="text-xl text-muted-foreground">
                  {format(new Date(), "EEEE d MMMM", { locale: nl })}
                </p>
              </div>
            </div>
            
            {/* Recovery Context Summary */}
            <div className="bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-background rounded-lg p-4 border border-orange-500/20">
              <div className="flex items-start gap-3">
                <Trash2 className="h-5 w-5 text-orange-600 mt-0.5" />
                <div className="space-y-2 flex-1">
                  {loading ? (
                    <p className="text-sm">Laden...</p>
                  ) : tasks.length === 0 ? (
                    <p className="text-sm">
                      ✅ <strong>Prullenbak is leeg</strong> - geen verwijderde taken gevonden
                    </p>
                  ) : (
                    <>
                      <p className="text-sm">
                        🗑️ <strong>{tasks.length} verwijderde {tasks.length === 1 ? 'taak' : 'taken'}</strong> kunnen worden teruggezet of definitief verwijderd
                      </p>
                      <p className="text-sm text-muted-foreground">
                        💡 Tip: Verwijderde taken kun je terugzetten naar je actieve lijst, of definitief verwijderen om ruimte vrij te maken
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Compact Stats Bar */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {/* Totaal Verwijderd */}
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <span className="text-2xl mb-1">🗑️</span>
              <span className="text-2xl font-bold text-orange-600">
                {tasks.length}
              </span>
              <span className="text-xs text-muted-foreground">Totaal Verwijderd</span>
            </div>
            
            {/* Kritieke Taken */}
            <div className={`flex flex-col items-center justify-center p-4 rounded-lg ${
              tasks.filter(t => t.priority === 'CRITICAL').length > 0
                ? 'bg-destructive/10 border border-destructive/20'
                : 'bg-muted/30'
            }`}>
              <span className="text-2xl mb-1">🚨</span>
              <span className={`text-2xl font-bold ${
                tasks.filter(t => t.priority === 'CRITICAL').length > 0
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }`}>
                {tasks.filter(t => t.priority === 'CRITICAL').length}
              </span>
              <span className="text-xs text-muted-foreground">Kritieke Taken</span>
            </div>
            
            {/* Recent Verwijderd */}
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/30">
              <span className="text-2xl mb-1">📅</span>
              <span className="text-2xl font-bold text-primary">
                {tasks.filter(t => {
                  const deletedDate = new Date(t.deleted_at);
                  const threeDaysAgo = new Date();
                  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                  return deletedDate >= threeDaysAgo;
                }).length}
              </span>
              <span className="text-xs text-muted-foreground">Laatste 3 Dagen</span>
            </div>
            
            {/* Herstelbaar */}
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-2xl mb-1">↩️</span>
              <span className="text-2xl font-bold text-primary">
                {tasks.length}
              </span>
              <span className="text-xs text-muted-foreground">Herstelbaar</span>
            </div>
          </div>

          <Card>
            <CardHeader className="bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Trash2 className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Verwijderde Taken</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      {tasks.length > 0 ? (
                        <span>Terugzetten of definitief verwijderen van {tasks.length} {tasks.length === 1 ? 'taak' : 'taken'}</span>
                      ) : (
                        <span>Geen verwijderde taken - je prullenbak is leeg</span>
                      )}
                    </CardDescription>
                  </div>
                </div>
                {tasks.length > 0 && (
                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                    {tasks.length} items
                  </Badge>
                )}
              </div>
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
        </main>
      </div>
    </SidebarProvider>
  );
};

export default VerwijderdeTaken;
