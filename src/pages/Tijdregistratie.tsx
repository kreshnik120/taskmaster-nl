import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Play, Square, Clock, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Task {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  next_action: string | null;
  assignee_id: string | null;
  application_id: string | null;
  recruitment_action_type: string | null;
}

interface ActiveTimerInfo {
  task_id: string;
  user_id: string;
  start: string;
  profiles: {
    name: string | null;
  } | null;
}

interface TimeEntry {
  id: string;
  task_id: string;
  start: string;
  end: string | null;
  duration_min: number | null;
  note: string | null;
  tasks: {
    id: string;
    title: string;
  } | null;
}

const Tijdregistratie = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTimer, setActiveTimer] = useState<TimeEntry | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [note, setNote] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<string>("today");
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [activeTimers, setActiveTimers] = useState<Record<string, ActiveTimerInfo>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const navigate = useNavigate();


  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadTasks();
        loadTimeEntries();
        checkActiveTimer();
        loadAllActiveTimers();
      } else {
        navigate("/auth");
      }
      setLoading(false);
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

    // Real-time listener voor taken
    const tasksChannel = supabase
      .channel('tijdregistratie-tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        () => {
          loadTasks();
        }
      )
      .subscribe();

    // Real-time listener voor time_entries
    const timeEntriesChannel = supabase
      .channel('tijdregistratie-time-entries')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_entries'
        },
        () => {
          checkActiveTimer();
          loadTimeEntries();
          loadAllActiveTimers();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(timeEntriesChannel);
    };
  }, [navigate]);

  useEffect(() => {
    if (user) {
      loadTimeEntries();
    }
  }, [filterPeriod, user]);

  // Live timer update elke seconde
  useEffect(() => {
    if (activeTimer || Object.keys(activeTimers).length > 0) {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [activeTimer, activeTimers]);

  const loadTasks = async () => {
    const { data } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        priority,
        due_at,
        next_action,
        assignee_id,
        org_id,
        application_id,
        recruitment_action_type
      `)
      .is("deleted_at", null)
      .is("completed_at", null)
      .order("due_at", { ascending: true, nullsFirst: false });
    
    if (data) setTasks(data);
  };

  const loadAllActiveTimers = async () => {
    const { data } = await supabase
      .from("time_entries")
      .select("task_id, user_id, start, profiles:profiles!time_entries_user_id_fkey(name)")
      .is("end", null);
    
    if (data) {
      const timersMap: Record<string, ActiveTimerInfo> = {};
      data.forEach((entry: any) => {
        timersMap[entry.task_id] = entry;
      });
      setActiveTimers(timersMap);
    }
  };

  const checkActiveTimer = async () => {
    const { data } = await supabase
      .from("time_entries")
      .select("*, tasks(id, title)")
      .is("end", null)
      .maybeSingle();
    
    if (data) setActiveTimer(data);
  };

  const loadTimeEntries = async () => {
    let query = supabase
      .from("time_entries")
      .select("*, tasks(id, title)")
      .order("start", { ascending: false });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filterPeriod) {
      case "today":
        query = query.gte("start", today.toISOString());
        break;
      case "week":
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1);
        query = query.gte("start", weekStart.toISOString());
        break;
      case "month":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        query = query.gte("start", monthStart.toISOString());
        break;
    }

    const { data } = await query;
    
    if (data) {
      setTimeEntries(data);
      const total = data.reduce((sum, entry) => {
        if (entry.duration_min) return sum + entry.duration_min;
        if (entry.end) {
          const duration = new Date(entry.end).getTime() - new Date(entry.start).getTime();
          return sum + Math.floor(duration / 60000);
        }
        return sum;
      }, 0);
      setTotalMinutes(total);
    }
  };

  const startTimer = async () => {
    if (!selectedTaskId) {
      toast.error("Selecteer eerst een taak");
      return;
    }

    if (activeTimer) {
      toast.error("Er loopt al een timer");
      return;
    }

    const { data, error } = await supabase
      .from("time_entries")
      .insert({
        task_id: selectedTaskId,
        user_id: user.id,
        start: new Date().toISOString(),
        note: note || null,
      })
      .select("*, tasks(id, title)")
      .single();

    if (error) {
      toast.error("Fout bij starten timer");
      console.error(error);
      return;
    }

    setActiveTimer(data);
    setNote("");
    loadAllActiveTimers();
    toast.success("Timer gestart");
  };

  const stopTimer = async () => {
    if (!activeTimer) return;

    const endTime = new Date();
    const startTime = new Date(activeTimer.start);
    const durationMin = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

    const { error } = await supabase
      .from("time_entries")
      .update({
        end: endTime.toISOString(),
        duration_min: durationMin,
      })
      .eq("id", activeTimer.id);

    if (error) {
      toast.error("Fout bij stoppen timer");
      console.error(error);
      return;
    }

    setActiveTimer(null);
    loadTimeEntries();
    loadAllActiveTimers();
    toast.success(`Timer gestopt: ${formatMinutes(durationMin)}`);
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase
      .from("time_entries")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Fout bij verwijderen");
      return;
    }

    loadTimeEntries();
    toast.success("Tijdregistratie verwijderd");
  };

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}u ${mins}m`;
  };

  const getRunningTime = () => {
    if (!activeTimer) return "0u 0m 0s";
    const now = currentTime;
    const start = new Date(activeTimer.start);
    const totalSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}u ${minutes}m ${seconds}s`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Hero Section - Minimal */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Tijdregistratie</h1>
        <p className="text-muted-foreground">
          {formatMinutes(totalMinutes)} geregistreerd {filterPeriod === 'today' ? 'vandaag' : filterPeriod === 'week' ? 'deze week' : 'deze maand'}
        </p>
      </div>

      {/* Stats Bar - Monochrome KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {/* Vandaag */}
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Vandaag</p>
              <p className="text-2xl font-semibold">
                {formatMinutes(
                  timeEntries
                    .filter(e => {
                      const entryDate = new Date(e.start);
                      const today = new Date();
                      return entryDate.toDateString() === today.toDateString();
                    })
                    .reduce((sum, e) => sum + (e.duration_min || 0), 0)
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Deze Week */}
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Deze Week</p>
              <p className="text-2xl font-semibold">
                {formatMinutes(
                  timeEntries
                    .filter(e => {
                      const entryDate = new Date(e.start);
                      const today = new Date();
                      const weekStart = new Date(today);
                      weekStart.setDate(today.getDate() - today.getDay() + 1);
                      return entryDate >= weekStart;
                    })
                    .reduce((sum, e) => sum + (e.duration_min || 0), 0)
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Registraties */}
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Registraties</p>
              <p className="text-2xl font-semibold">{timeEntries.length}</p>
            </div>
          </CardContent>
        </Card>

        {/* Actieve Timer */}
        <Card className={`cursor-pointer transition-colors ${
          activeTimer ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
        }`}>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Actieve Timer</p>
              <p className={`text-2xl font-semibold ${activeTimer ? 'text-primary' : ''}`}>
                {activeTimer ? getRunningTime().split(' ')[0] : '0u'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timer Card - Clean */}
      <Card>
        <CardHeader>
          <CardTitle>Timer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeTimer ? (
            <div className="space-y-4">
              <div className="p-6 border rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <p className="font-medium text-lg mb-1">{activeTimer.tasks?.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Gestart om {format(new Date(activeTimer.start), "HH:mm", { locale: nl })}
                    </p>
                    {activeTimer.note && (
                      <p className="text-sm text-muted-foreground mt-2">{activeTimer.note}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-semibold tabular-nums">
                      {getRunningTime()}
                    </p>
                  </div>
                </div>
              </div>
              <Button onClick={stopTimer} variant="outline" size="lg" className="w-full">
                <Square className="mr-2 h-4 w-4" />
                Stop Timer
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Taak</label>
                <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer een taak" />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map((task) => {
                      const isActive = activeTimers[task.id];
                      
                      return (
                        <SelectItem 
                          key={task.id} 
                          value={task.id}
                          disabled={!!isActive}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <span className="flex-1">{task.title}</span>
                            {isActive && (
                              <span className="text-xs text-muted-foreground">
                                {isActive.profiles?.name || "Actief"}
                              </span>
                            )}
                            {task.due_at && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(task.due_at), "d MMM", { locale: nl })}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Notitie (optioneel)</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Bijv. Meeting met team, code review..."
                  rows={2}
                />
              </div>
              <Button onClick={startTimer} className="w-full">
                <Play className="mr-2 h-4 w-4" />
                Start Timer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overview Card - Clean Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Overzicht</CardTitle>
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Vandaag</SelectItem>
                <SelectItem value="week">Deze week</SelectItem>
                <SelectItem value="month">Deze maand</SelectItem>
                <SelectItem value="all">Alles</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Totale tijd</p>
            <p className="text-3xl font-semibold">{formatMinutes(totalMinutes)}</p>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Taak</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Eind</TableHead>
                  <TableHead>Duur</TableHead>
                  <TableHead>Notitie</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Geen tijdregistraties gevonden
                    </TableCell>
                  </TableRow>
                ) : (
                  timeEntries.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {entry.tasks?.title || "Onbekende taak"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(entry.start), "dd MMM HH:mm", { locale: nl })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.end ? (
                          format(new Date(entry.end), "dd MMM HH:mm", { locale: nl })
                        ) : (
                          <span className="text-primary">Loopt...</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {entry.duration_min ? formatMinutes(entry.duration_min) : "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.note || "-"}
                      </TableCell>
                      <TableCell>
                        {entry.end && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteEntry(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Tijdregistratie;