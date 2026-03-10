import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/ui/page-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Undo2, Clock, CheckCircle2, AlertCircle, TrendingUp, Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { KPICard } from "@/components/ui/kpi-card";
import { getPrioritySolidClass, getPriorityLabel } from "@/hooks/usePriorityConfig";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Input } from "@/components/ui/input";
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
import { useGreeting } from "@/hooks/useGreeting";

const log = logger.create('AfgerondeTaken');

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



const AfgerondeTaken = () => {
  const [tasks, setTasks] = useState<CompletedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const navigate = useNavigate();

  // Get personalized greeting
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0];
  const { fullGreeting } = useGreeting(displayName);

  useEffect(() => {
    checkAuth();
  }, []);

  // Realtime channel voor completed tasks - multi-user sync met filter
  useEffect(() => {
    const channel = supabase
      .channel('afgerond-tasks-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: 'completed_at=not.is.null',  // Alleen completed task changes
      }, (payload) => {
        log.debug('Realtime update:', payload.eventType);
        fetchCompletedTasks();
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

  const searchFilteredTasks = tasks.filter(task => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return task.title.toLowerCase().includes(q) || task.organizations?.name?.toLowerCase().includes(q);
  });

  const onTimeTasks = searchFilteredTasks.filter(isTaskOnTime);
  const lateTasks = searchFilteredTasks.filter(task => !isTaskOnTime(task));

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
          <TableRow key={task.id} className={cn(
            "table-row-hover-emerald",
            showLateIndicator && "bg-destructive/5"
          )}>
            <TableCell className="font-medium">{task.title}</TableCell>
            <TableCell>{task.organizations?.name || "-"}</TableCell>
            <TableCell>
              <Badge className={getPrioritySolidClass(task.priority)}>
                {getPriorityLabel(task.priority)}
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
    <PageContainer contextColor="emerald" className="space-y-6">
      {/* Hero Section */}
      <div>
        <h1 className="text-2xl font-semibold mb-1">{fullGreeting}</h1>
        <p className="text-sm text-muted-foreground">
          Bekijk voltooide taken en prestaties
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={CheckCircle2}
          title="Totaal"
          value={tasks.length}
          variant="count"
          onClick={() => setActiveTab(activeTab === "all" ? "all" : "all")}
          isActive={activeTab === "all"}
        />
        <KPICard
          icon={Clock}
          title="Tijdig"
          value={onTimeTasks.length}
          variant="success"
          onClick={() => setActiveTab(activeTab === "ontime" ? "all" : "ontime")}
          isActive={activeTab === "ontime"}
        />
        <KPICard
          icon={AlertCircle}
          title="Te Laat"
          value={lateTasks.length}
          variant="urgent"
          onClick={() => setActiveTab(activeTab === "late" ? "all" : "late")}
          isActive={activeTab === "late"}
        />
        <KPICard
          icon={TrendingUp}
          title="Success Rate"
          value={tasks.length > 0 ? Math.round(onTimeTasks.length / tasks.length * 100) : 0}
          suffix="%"
          variant="time"
          onClick={() => toast.info("Dit is je totale succes percentage")}
        />
      </div>
      
      <Card>
        <CardHeader>
              <CardTitle className="text-lg">Alle afgeronde taken</CardTitle>
              <CardDescription>
                {tasks.length > 0 ? `${tasks.length} taken voltooid` : 'Geen taken voltooid'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Laden...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8 px-6 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-muted-foreground">
                  Geen afgeronde taken gevonden
                </div>
              ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                      <div className="text-center py-8 px-6 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-muted-foreground">
                        Geen tijdig afgeronde taken
                      </div>
                    ) : (
                      renderTasksTable(onTimeTasks)
                    )}
                  </TabsContent>
                  
                  <TabsContent value="late" className="mt-4">
                    {lateTasks.length === 0 ? (
                      <div className="text-center py-8 px-6 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-muted-foreground">
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
    </PageContainer>
  );
};

export default AfgerondeTaken;
