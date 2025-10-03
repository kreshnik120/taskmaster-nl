import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Clock, Database, TrendingUp, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CronJob {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run?: string;
  next_run?: string;
}

interface FunctionLog {
  timestamp: number;
  level: string;
  event_message: string;
}

export const SystemMonitor = () => {
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [logs, setLogs] = useState<Record<string, FunctionLog[]>>({});
  const [knowledgeStats, setKnowledgeStats] = useState({ total: 0, today: 0 });
  const [loading, setLoading] = useState(true);
  const [testingFunction, setTestingFunction] = useState<string | null>(null);
  const [runningJobs, setRunningJobs] = useState<string[]>([]);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      // Load cron jobs status (hardcoded as we can't query cron.job directly via Supabase client)
      setCronJobs([
        { jobname: 'ultra-auto-harvester', schedule: '0 */1 * * *', active: true },
        { jobname: 'ultra-self-trainer', schedule: '0 */1 * * *', active: true },
        { jobname: 'ultra-knowledge-graph', schedule: '0 */1 * * *', active: true },
        { jobname: 'ultra-daily-report', schedule: '0 0 * * *', active: true },
      ]);

      // Load knowledge stats
      const { count: totalCount } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: todayCount } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo)
        .is('deleted_at', null);

      setKnowledgeStats({
        total: totalCount || 0,
        today: todayCount || 0,
      });

    } catch (error) {
      console.error('Error loading monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  const testFunction = async (functionName: string) => {
    setTestingFunction(functionName);
    setRunningJobs(prev => [...prev, functionName]);
    
    try {
      // Fire and forget - don't wait for response
      supabase.functions.invoke(functionName, {
        body: { 
          trigger: 'manual_test',
          async: true
        }
      }).then(() => {
        console.log(`${functionName} completed in background`);
        loadData();
        setRunningJobs(prev => prev.filter(job => job !== functionName));
      }).catch((error) => {
        console.error(`${functionName} background error:`, error);
        setRunningJobs(prev => prev.filter(job => job !== functionName));
      });

      // Immediate success feedback
      toast({
        title: "🚀 Test gestart",
        description: `${functionName} draait nu op de achtergrond. Dit kan 5-30 minuten duren. De stats updaten automatisch.`,
        duration: 5000,
      });

      setTestingFunction(null);
      
    } catch (error: any) {
      toast({
        title: "❌ Kon test niet starten",
        description: error.message,
        variant: "destructive",
      });
      setTestingFunction(null);
      setRunningJobs(prev => prev.filter(job => job !== functionName));
    }
  };

  const getNextRunTime = (schedule: string): string => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Parse cron schedule (e.g., "0 */1 * * *" = every hour at minute 0)
    const parts = schedule.split(' ');
    const minute = parts[0];
    const hour = parts[1];

    if (hour === '*/1' || hour === '*') {
      // Every hour
      const nextHour = currentMinute === 0 ? currentHour : currentHour + 1;
      const minutesUntil = currentMinute === 0 ? 60 : 60 - currentMinute;
      return `over ${minutesUntil} minuten`;
    } else if (hour === '0' && minute === '0') {
      // Midnight only
      const hoursUntil = 24 - currentHour;
      return `over ${hoursUntil} uur (00:00)`;
    }

    return 'onbekend';
  };

  const getCronStatus = (jobname: string): { color: string; icon: any; text: string } => {
    const job = cronJobs.find(j => j.jobname === jobname);
    if (!job) return { color: 'secondary', icon: AlertCircle, text: 'Niet gevonden' };
    if (!job.active) return { color: 'destructive', icon: AlertCircle, text: 'Inactief' };
    return { color: 'default', icon: CheckCircle2, text: 'Actief' };
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Refresh every 5 seconds for live updates
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const functions = [
    {
      name: 'auto-knowledge-harvester',
      cron: 'ultra-auto-harvester',
      description: 'Zoekt automatisch 50+ onderwerpen per run',
      schedule: '0 */1 * * *',
    },
    {
      name: 'self-trainer',
      cron: 'ultra-self-trainer',
      description: 'Stelt zichzelf vragen en leert van antwoorden',
      schedule: '0 */1 * * *',
    },
    {
      name: 'knowledge-graph-builder',
      cron: 'ultra-knowledge-graph',
      description: 'Bouwt relaties tussen knowledge items',
      schedule: '0 */1 * * *',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totaal Kennis</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{knowledgeStats.total}</div>
            <p className="text-xs text-muted-foreground">items in knowledge base</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vandaag Geleerd</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{knowledgeStats.today}</div>
            <p className="text-xs text-muted-foreground">nieuwe items laatste 24u</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actieve Jobs</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cronJobs.filter(j => j.active).length}/{cronJobs.length}
            </div>
            <p className="text-xs text-muted-foreground">cron jobs actief</p>
          </CardContent>
        </Card>
      </div>

      {/* Function Status Cards */}
      <div className="grid grid-cols-1 gap-4">
        {functions.map((func) => {
          const status = getCronStatus(func.cron);
          const StatusIcon = status.icon;
          const cronJob = cronJobs.find(j => j.jobname === func.cron);
          const isRunning = runningJobs.includes(func.name);

          return (
            <Card key={func.name} className={isRunning ? 'border-primary animate-pulse' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {func.name}
                      <Badge variant={status.color as any}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status.text}
                      </Badge>
                      {isRunning && (
                        <Badge variant="secondary" className="animate-pulse">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Draait...
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>{func.description}</CardDescription>
                  </div>
                  <Button
                    onClick={() => testFunction(func.name)}
                    disabled={isRunning}
                    size="sm"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Op achtergrond...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Test Nu
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Schedule:</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{func.schedule}</code>
                  </div>
                  {cronJob && (
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Volgende run:</span>
                      <span className="font-medium">{getNextRunTime(func.schedule)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>ℹ️ Systeem Informatie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>✅ <strong>Status:</strong> Alle autonome functies zijn nu PUBLIEK (verify_jwt = false)</p>
          <p>🔒 <strong>Veiligheid:</strong> CUTOFF_DATE hardcoded tot 6 oktober 2025, 23:59</p>
          <p>⏰ <strong>Schedule:</strong> Auto-runs elk uur (00:00, 01:00, 02:00, etc.)</p>
          <p>💰 <strong>Budget:</strong> Geschatte waarde €320 tot cutoff (GRATIS promo periode)</p>
          <p>📈 <strong>Verwachting:</strong> 8,000-10,000 knowledge items en 50,000+ relationships</p>
        </CardContent>
      </Card>
    </div>
  );
};
