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
  const [jobIntervals, setJobIntervals] = useState<Record<string, NodeJS.Timeout>>({});
  const { toast } = useToast();

  const loadData = async () => {
    try {
      // Load cron jobs status (hardcoded as we can't query cron.job directly via Supabase client)
      setCronJobs([
        { jobname: 'auto-knowledge-harvester', schedule: '5 */2 * * *', active: true },
        { jobname: 'self-trainer', schedule: '25 * * * *', active: true },
        { jobname: 'knowledge-graph-builder', schedule: '15 */2 * * *', active: true },
        { jobname: 'mega-forecast-generator', schedule: '0 8 * * *', active: true },
        { jobname: 'data-quality-auditor', schedule: '0 1 * * *', active: true },
        { jobname: 'compliance-monitor', schedule: '0 3 * * *', active: true },
        { jobname: 'smart-deduplicator', schedule: '0 4 * * 0', active: true },
        { jobname: 'source-validator', schedule: '0 5 * * 1', active: true },
        { jobname: 'professional-matcher', schedule: '0 */6 * * *', active: true },
        { jobname: 'tariff-analyzer', schedule: '0 */12 * * *', active: true },
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
    const startTime = Date.now();
    const initialKnowledgeCount = knowledgeStats.total;
    
    setTestingFunction(functionName);
    setRunningJobs(prev => [...prev, functionName]);
    
    try {
      // Fire and forget
      supabase.functions.invoke(functionName, {
        body: { 
          trigger: 'manual_test',
          async: true
        }
      });

      toast({
        title: "🚀 Test gestart",
        description: `${functionName} draait op de achtergrond. Monitoring status...`,
        duration: 5000,
      });

      setTestingFunction(null);

      // Hybrid monitoring: stats changes + timeout fallback
      const maxRuntime = 20 * 60 * 1000; // 20 min max
      const checkInterval = setInterval(async () => {
        // Query database directly to get fresh count
        const { count: currentTotal } = await supabase
          .from('ai_knowledge_base')
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null);
        
        // Check completion conditions
        const statsChanged = (currentTotal || 0) > initialKnowledgeCount;
        const timeoutReached = Date.now() - startTime > maxRuntime;
        
        if (statsChanged || timeoutReached) {
          clearInterval(checkInterval);
          setRunningJobs(prev => prev.filter(job => job !== functionName));
          setJobIntervals(prev => {
            const updated = { ...prev };
            delete updated[functionName];
            return updated;
          });
          
          // Refresh UI stats
          await loadData();
          
          if (statsChanged) {
            const newItems = (currentTotal || 0) - initialKnowledgeCount;
            toast({
              title: "✅ Nieuwe kennis toegevoegd",
              description: `${functionName}: ${newItems} nieuwe items gevonden!`,
            });
          } else if (timeoutReached) {
            console.log(`${functionName} timeout reached (20 min), clearing UI`);
          }
        }
      }, 10000); // Check every 10s
      
      // Store interval for cleanup
      setJobIntervals(prev => ({ ...prev, [functionName]: checkInterval }));
      
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

    // Parse cron schedule
    const parts = schedule.split(' ');
    const minute = parts[0];
    const hour = parts[1];

    // Handle "*/100 * * * *" (every 100 minutes)
    if (minute.startsWith('*/')) {
      const interval = parseInt(minute.substring(2));
      return `elke ${interval} minuten`;
    }

    // Handle "0,30 */2 * * *" (every 2 hours at :00 and :30)
    if (minute.includes(',') && hour.startsWith('*/')) {
      const hourInterval = parseInt(hour.substring(2));
      const minutes = minute.split(',').map(m => parseInt(m));
      const nextMinutes = minutes.filter(m => m > currentMinute);
      if (nextMinutes.length > 0) {
        return `over ${nextMinutes[0] - currentMinute} minuten`;
      }
      return `over ${(60 - currentMinute) + minutes[0]} minuten`;
    }

    // Handle "0 */X * * *" (every X hours)
    if (hour.startsWith('*/')) {
      const hourInterval = parseInt(hour.substring(2));
      const minutesUntil = currentMinute === 0 ? hourInterval * 60 : (60 - currentMinute);
      if (hourInterval === 1) {
        return `over ${minutesUntil} minuten`;
      }
      return `elke ${hourInterval} uur`;
    }

    // Handle "0 0 * * *" (midnight)
    if (hour === '0' && minute === '0') {
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
    return () => {
      clearInterval(interval);
      // Cleanup all job monitoring intervals
      Object.values(jobIntervals).forEach(clearInterval);
    };
  }, [jobIntervals]);

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
      cron: 'auto-knowledge-harvester',
      description: 'Zoekt automatisch 128 planning & matching onderwerpen per run',
      schedule: '5 */2 * * *',
    },
    {
      name: 'self-trainer',
      cron: 'self-trainer',
      description: 'Stelt 52 planning/matching vragen en leert van antwoorden',
      schedule: '25 * * * *',
    },
    {
      name: 'knowledge-graph-builder',
      cron: 'knowledge-graph-builder',
      description: 'Bouwt relaties tussen knowledge items',
      schedule: '15 */2 * * *',
    },
    {
      name: 'mega-forecast-generator',
      cron: 'mega-forecast-generator',
      description: 'Genereert forecast reports voor planning optimalisatie',
      schedule: '0 8 * * *',
    },
    {
      name: 'data-quality-auditor',
      cron: 'data-quality-auditor',
      description: 'Controleert data kwaliteit en verwijdert duplicaten/low-confidence items',
      schedule: '0 1 * * *',
    },
    {
      name: 'compliance-monitor',
      cron: 'compliance-monitor',
      description: 'Monitort officiële bronnen voor compliance updates (ABCzorg/CitoZorg)',
      schedule: '0 3 * * *',
    },
    {
      name: 'smart-deduplicator',
      cron: 'smart-deduplicator',
      description: 'Merget semantisch identieke kennis items (weekly)',
      schedule: '0 4 * * 0',
    },
    {
      name: 'source-validator',
      cron: 'source-validator',
      description: 'Valideert externe bronnen op bereikbaarheid (weekly)',
      schedule: '0 5 * * 1',
    },
    {
      name: 'professional-matcher',
      cron: 'professional-matcher',
      description: 'Matcht professionals aan taken op basis van kennis',
      schedule: '0 */6 * * *',
    },
    {
      name: 'tariff-analyzer',
      cron: 'tariff-analyzer',
      description: 'Analyseert tarieven en kostenstructuren',
      schedule: '0 */12 * * *',
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
          <p>🚀 <strong>Status:</strong> MEGA AUTONOMOUS MODE actief (10 functies)</p>
          <p>🔒 <strong>Veiligheid:</strong> CUTOFF_DATE tot 6 oktober 2025, 23:59</p>
          <p>⏰ <strong>Frequentie:</strong> Harvester 12x/dag • Self-trainer 24x/dag • Graph 12x/dag • Quality 1x/nacht • Compliance 1x/nacht • Dedup 1x/week • Validator 1x/week • Matcher 4x/dag • Tariff 2x/dag</p>
          <p>🎯 <strong>Focus:</strong> Autonomous learning + quality monitoring + compliance tracking + professional matching</p>
          <p>💰 <strong>Kosten:</strong> €0 tot 6 okt (2.3M tokens gratis promo) • Daarna ~€0.05/dag</p>
          <p>📈 <strong>Verwachting:</strong> 6,000+ high-quality knowledge items by 6 okt + realtime compliance monitoring</p>
        </CardContent>
      </Card>
    </div>
  );
};
