import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Undo2, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface CompletedTask {
  id: string;
  title: string;
  priority: string;
  completed_at: string;
  due_at: string | null;
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

const AfgerondeTaken = () => {
  const [tasks, setTasks] = useState<CompletedTask[]>([]);
  const [loading, setLoading] = useState(true);
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
          due_at,
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

  const isTaskOnTime = (task: CompletedTask): boolean => {
    if (!task.due_at) return true; // Geen deadline = altijd tijdig
    const completedDate = parseISO(task.completed_at);
    const dueDate = parseISO(task.due_at);
    return completedDate <= dueDate;
  };

  const onTimeTasks = tasks.filter(isTaskOnTime);
  const lateTasks = tasks.filter(task => !isTaskOnTime(task));

  const renderTasksTable = (tasksToRender: CompletedTask[], showLateIndicator: boolean = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Taak</TableHead>
          <TableHead>Organisatie</TableHead>
          <TableHead>Prioriteit</TableHead>
          <TableHead>Deadline</TableHead>
          <TableHead>Afgerond op</TableHead>
          <TableHead className="text-right">Acties</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasksToRender.map((task) => (
          <TableRow key={task.id} className={showLateIndicator ? "bg-destructive/5" : ""}>
            <TableCell className="font-medium">{task.title}</TableCell>
            <TableCell>{task.organizations?.name || "-"}</TableCell>
            <TableCell>
              <Badge variant="secondary" className={priorityColors[task.priority]}>
                {priorityLabels[task.priority]}
              </Badge>
            </TableCell>
            <TableCell>
              {task.due_at ? (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {format(parseISO(task.due_at), "dd MMM yyyy HH:mm", { locale: nl })}
                </div>
              ) : (
                <span className="text-muted-foreground">Geen deadline</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {showLateIndicator ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                )}
                {format(parseISO(task.completed_at), "dd MMM yyyy HH:mm", { locale: nl })}
              </div>
            </TableCell>
            <TableCell className="text-right">
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
  );

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
                    <CheckCircle2 className="h-4 w-4" />
                    Archief
                  </Badge>
                </div>
                <p className="text-xl text-muted-foreground">
                  {format(new Date(), "EEEE d MMMM", { locale: nl })}
                </p>
              </div>
            </div>
            
            {/* Celebration Summary */}
            <div className="bg-gradient-to-r from-green-500/10 via-green-500/5 to-background rounded-lg p-4 border border-green-500/20">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="space-y-2 flex-1">
                  {loading ? (
                    <p className="text-sm">Laden...</p>
                  ) : tasks.length === 0 ? (
                    <p className="text-sm">
                      🎯 Nog geen afgeronde taken. Start vandaag met het voltooien van je eerste taak!
                    </p>
                  ) : (
                    <>
                      <p className="text-sm">
                        🎉 <strong>{tasks.length} taken afgerond</strong> - geweldig werk!
                      </p>
                      {onTimeTasks.length > 0 && (
                        <p className="text-sm text-green-600">
                          ✅ <strong>{onTimeTasks.length} taken ({Math.round(onTimeTasks.length / tasks.length * 100)}%)</strong> tijdig voltooid
                        </p>
                      )}
                      {lateTasks.length > 0 && (
                        <p className="text-sm text-orange-600">
                          ⚠️ <strong>{lateTasks.length} taken ({Math.round(lateTasks.length / tasks.length * 100)}%)</strong> te laat voltooid
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Compact Stats Bar */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {/* Totaal Afgerond */}
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/30">
              <span className="text-2xl mb-1">✅</span>
              <span className="text-2xl font-bold">
                {tasks.length}
              </span>
              <span className="text-xs text-muted-foreground">Totaal Afgerond</span>
            </div>
            
            {/* Tijdig Voltooid */}
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <span className="text-2xl mb-1">🎯</span>
              <span className="text-2xl font-bold text-green-600">
                {onTimeTasks.length}
              </span>
              <span className="text-xs text-muted-foreground">Tijdig Voltooid</span>
            </div>
            
            {/* Te Laat */}
            <div className={`flex flex-col items-center justify-center p-4 rounded-lg ${
              lateTasks.length > 0 ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-muted/30'
            }`}>
              <span className="text-2xl mb-1">⚠️</span>
              <span className={`text-2xl font-bold ${
                lateTasks.length > 0 ? 'text-orange-600' : 'text-muted-foreground'
              }`}>
                {lateTasks.length}
              </span>
              <span className="text-xs text-muted-foreground">Te Laat</span>
            </div>
            
            {/* Success Rate */}
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-2xl mb-1">📊</span>
              <span className="text-2xl font-bold text-primary">
                {tasks.length > 0 ? Math.round(onTimeTasks.length / tasks.length * 100) : 0}%
              </span>
              <span className="text-xs text-muted-foreground">Success Rate</span>
            </div>
          </div>
          
          <Card>
            <CardHeader className="bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Afgeronde Taken</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      {tasks.length > 0 ? (
                        <span>Bekijk je voltooide taken en prestaties</span>
                      ) : (
                        <span>Start met het voltooien van taken om hier je geschiedenis te zien</span>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Laden...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Geen afgeronde taken gevonden
                </div>
              ) : (
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="all">
                      Alle ({tasks.length})
                    </TabsTrigger>
                    <TabsTrigger value="ontime" className="data-[state=active]:text-green-600">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Tijdig afgerond ({onTimeTasks.length})
                    </TabsTrigger>
                    <TabsTrigger value="late" className="data-[state=active]:text-destructive">
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Te laat afgerond ({lateTasks.length})
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="all" className="mt-4">
                    {renderTasksTable(tasks)}
                  </TabsContent>
                  
                  <TabsContent value="ontime" className="mt-4">
                    {onTimeTasks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Geen tijdig afgeronde taken
                      </div>
                    ) : (
                      renderTasksTable(onTimeTasks)
                    )}
                  </TabsContent>
                  
                  <TabsContent value="late" className="mt-4">
                    {lateTasks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Geen te laat afgeronde taken
                      </div>
                    ) : (
                      renderTasksTable(lateTasks, true)
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default AfgerondeTaken;
