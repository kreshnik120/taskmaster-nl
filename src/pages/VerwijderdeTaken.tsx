import { useEffect, useState } from "react";
 import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/ui/page-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Undo2, Trash2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { KPICard } from "@/components/ui/kpi-card";
import { getPrioritySolidClass, getPriorityLabel } from "@/hooks/usePriorityConfig";
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
import { useGreeting } from "@/hooks/useGreeting";
 import { VerwijderdeTakenCards } from "@/components/verwijderd/VerwijderdeTakenCards";

const log = logger.create('VerwijderdeTaken');

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


const VerwijderdeTaken = () => {
  const [tasks, setTasks] = useState<DeletedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const navigate = useNavigate();
   const isMobile = useIsMobile();

  // Get personalized greeting
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0];
  const { fullGreeting } = useGreeting(displayName);

  useEffect(() => {
    checkAuth();
  }, []);

  // Realtime channel voor deleted tasks - multi-user sync met filter
  useEffect(() => {
    const channel = supabase
      .channel('verwijderd-tasks-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: 'deleted_at=not.is.null',  // Alleen deleted task changes
      }, (payload) => {
        log.debug('Realtime update:', payload.eventType);
        fetchDeletedTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
    <PageContainer contextColor="slate" className="space-y-6">
      {/* Hero Section */}
      <div>
        <h1 className="text-2xl font-semibold mb-1">{fullGreeting}</h1>
        <p className="text-sm text-muted-foreground">
          Terugzetten of definitief verwijderen
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={Trash2}
          title="Totaal"
          value={tasks.length}
          variant="count"
          onClick={() => setFilterPriority("all")}
          isActive={filterPriority === "all"}
        />
        <KPICard
          icon={AlertTriangle}
          title="Kritiek"
          value={tasks.filter(t => t.priority === 'CRITICAL').length}
          variant="urgent"
          onClick={() => setFilterPriority(filterPriority === "CRITICAL" ? "all" : "CRITICAL")}
          isActive={filterPriority === "CRITICAL"}
        />
        <KPICard
          icon={Clock}
          title="Recent"
          value={tasks.filter(t => {
            const deletedDate = new Date(t.deleted_at);
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            return deletedDate >= threeDaysAgo;
          }).length}
          variant="time"
          onClick={() => setFilterPriority(filterPriority === "RECENT" ? "all" : "RECENT")}
          isActive={filterPriority === "RECENT"}
        />
        <KPICard
          icon={Undo2}
          title="Herstelbaar"
          value={tasks.length}
          variant="success"
          onClick={() => toast.info("Alle taken kunnen worden hersteld")}
        />
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
                <div className="text-center py-8 px-6 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-muted-foreground">
                  Geen verwijderde taken gevonden
                </div>
               ) : isMobile ? (
                 <VerwijderdeTakenCards
                   tasks={tasks.filter(task => {
                     if (filterPriority === "all") return true;
                     if (filterPriority === "CRITICAL") return task.priority === "CRITICAL";
                     if (filterPriority === "RECENT") {
                       const deletedDate = new Date(task.deleted_at);
                       const threeDaysAgo = new Date();
                       threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                       return deletedDate >= threeDaysAgo;
                     }
                     return true;
                   })}
                   onRestore={handleRestore}
                   onDelete={openDeleteDialog}
                 />
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
                    {tasks.filter(task => {
                      if (filterPriority === "all") return true;
                      if (filterPriority === "CRITICAL") return task.priority === "CRITICAL";
                      if (filterPriority === "RECENT") {
                        const deletedDate = new Date(task.deleted_at);
                        const threeDaysAgo = new Date();
                        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                        return deletedDate >= threeDaysAgo;
                      }
                      return true;
                    }).map((task) => (
                      <TableRow key={task.id} className="table-row-hover-slate">
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>{task.organizations?.name || "-"}</TableCell>
                        <TableCell>
                          <Badge className={getPrioritySolidClass(task.priority)}>
                            {getPriorityLabel(task.priority)}
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
    </PageContainer>
  );
};

export default VerwijderdeTaken;
