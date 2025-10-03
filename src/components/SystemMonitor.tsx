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
        { jobname: 'auto-knowledge-harvester', schedule: '5 * * * *', active: true },
        { jobname: 'self-trainer', schedule: '10 * * * *', active: true },
        { jobname: 'knowledge-graph-builder', schedule: '15 * * * *', active: true },
        { jobname: 'data-quality-auditor', schedule: '20 * * * *', active: true },
        { jobname: 'compliance-monitor', schedule: '25 * * * *', active: true },
        { jobname: 'smart-deduplicator', schedule: '30 * * * *', active: true },
        { jobname: 'source-validator', schedule: '35 * * * *', active: true },
        { jobname: 'professional-matcher', schedule: '40 * * * *', active: true },
        { jobname: 'tariff-analyzer', schedule: '45 * * * *', active: true },
        { jobname: 'mega-forecast-generator', schedule: '50 * * * *', active: true },
        { jobname: 'client-communication-coach', schedule: '55 * * * *', active: true },
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
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Parse cron schedule: minute hour day month weekday
    const parts = schedule.split(' ');
    const minute = parts[0];
    const hour = parts[1];
    const dayOfMonth = parts[2];
    const month = parts[3];
    const weekday = parts[4];

    // Helper: format tijd
    const formatTime = (h: number, m: number) => {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    // Helper: weekdag naam
    const weekdayName = (day: number) => {
      const names = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
      return names[day];
    };

    // 1. Handle "5 */2 * * *" - Specific minute + interval hour
    if (!minute.includes('*') && !minute.includes(',') && hour.startsWith('*/') && weekday === '*') {
      const targetMinute = parseInt(minute);
      const hourInterval = parseInt(hour.substring(2));
      
      // Calculate next occurrence
      const minutesIntoInterval = (currentHour % hourInterval) * 60 + currentMinute;
      const targetMinuteInInterval = targetMinute;
      
      if (minutesIntoInterval < targetMinuteInInterval) {
        // Next run is in current interval
        const minutesUntil = targetMinuteInInterval - minutesIntoInterval;
        return `over ${minutesUntil} min`;
      } else {
        // Next run is in next interval
        const minutesUntilNextInterval = (hourInterval * 60) - minutesIntoInterval;
        const minutesUntil = minutesUntilNextInterval + targetMinute;
        const hoursUntil = Math.floor(minutesUntil / 60);
        const minsUntil = minutesUntil % 60;
        if (hoursUntil > 0) {
          return `over ${hoursUntil}u ${minsUntil}min`;
        }
        return `over ${minutesUntil} min`;
      }
    }

    // 2. Handle "25 * * * *" - Specific minute every hour
    if (!minute.includes('*') && !minute.includes(',') && hour === '*' && weekday === '*') {
      const targetMinute = parseInt(minute);
      
      if (currentMinute < targetMinute) {
        const minutesUntil = targetMinute - currentMinute;
        return `over ${minutesUntil} min`;
      } else {
        const minutesUntil = (60 - currentMinute) + targetMinute;
        return `over ${minutesUntil} min`;
      }
    }

    // 3. Handle "0 8 * * *" - Specific time daily
    if (!minute.includes('*') && !hour.includes('*') && weekday === '*' && dayOfMonth === '*') {
      const targetHour = parseInt(hour);
      const targetMinute = parseInt(minute);
      
      if (currentHour < targetHour || (currentHour === targetHour && currentMinute < targetMinute)) {
        // Today
        const minutesUntil = (targetHour - currentHour) * 60 + (targetMinute - currentMinute);
        const hoursUntil = Math.floor(minutesUntil / 60);
        return `over ${hoursUntil}u (${formatTime(targetHour, targetMinute)})`;
      } else {
        // Tomorrow
        return `morgen om ${formatTime(targetHour, targetMinute)}`;
      }
    }

    // 4. Handle "0 4 * * 0" - Specific time on specific weekday
    if (!minute.includes('*') && !hour.includes('*') && weekday !== '*' && dayOfMonth === '*') {
      const targetWeekday = parseInt(weekday);
      const targetHour = parseInt(hour);
      const targetMinute = parseInt(minute);
      
      // Calculate days until target
      let daysUntil = targetWeekday - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0 && (currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute))) {
        daysUntil = 7; // Next week
      }
      
      if (daysUntil === 0) {
        // Today
        const minutesUntil = (targetHour - currentHour) * 60 + (targetMinute - currentMinute);
        const hoursUntil = Math.floor(minutesUntil / 60);
        return `over ${hoursUntil}u (${formatTime(targetHour, targetMinute)})`;
      } else if (daysUntil === 1) {
        return `morgen om ${formatTime(targetHour, targetMinute)}`;
      } else {
        return `${weekdayName(targetWeekday)} om ${formatTime(targetHour, targetMinute)}`;
      }
    }

    // 5. Handle "0 */6 * * *" - Every X hours at minute 0
    if (minute === '0' && hour.startsWith('*/') && weekday === '*') {
      const hourInterval = parseInt(hour.substring(2));
      
      const minutesIntoInterval = (currentHour % hourInterval) * 60 + currentMinute;
      const minutesUntil = (hourInterval * 60) - minutesIntoInterval;
      
      const hoursUntil = Math.floor(minutesUntil / 60);
      const minsUntil = minutesUntil % 60;
      
      if (hoursUntil > 0) {
        return `over ${hoursUntil}u ${minsUntil}min`;
      }
      return `over ${minutesUntil} min`;
    }

    // Fallback
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
      schedule: '5 * * * *',
    },
    {
      name: 'self-trainer',
      cron: 'self-trainer',
      description: 'Stelt 52 planning/matching vragen en leert van antwoorden',
      schedule: '10 * * * *',
    },
    {
      name: 'knowledge-graph-builder',
      cron: 'knowledge-graph-builder',
      description: 'Bouwt relaties tussen knowledge items',
      schedule: '15 * * * *',
    },
    {
      name: 'data-quality-auditor',
      cron: 'data-quality-auditor',
      description: 'Controleert data kwaliteit en verwijdert duplicaten/low-confidence items',
      schedule: '20 * * * *',
    },
    {
      name: 'compliance-monitor',
      cron: 'compliance-monitor',
      description: 'Monitort officiële bronnen voor compliance updates (ABCzorg/CitoZorg)',
      schedule: '25 * * * *',
    },
    {
      name: 'smart-deduplicator',
      cron: 'smart-deduplicator',
      description: 'Merget semantisch identieke kennis items',
      schedule: '30 * * * *',
    },
    {
      name: 'source-validator',
      cron: 'source-validator',
      description: 'Valideert externe bronnen op bereikbaarheid',
      schedule: '35 * * * *',
    },
    {
      name: 'professional-matcher',
      cron: 'professional-matcher',
      description: 'Matcht professionals aan taken op basis van kennis',
      schedule: '40 * * * *',
    },
    {
      name: 'tariff-analyzer',
      cron: 'tariff-analyzer',
      description: 'Analyseert tarieven en kostenstructuren',
      schedule: '45 * * * *',
    },
    {
      name: 'mega-forecast-generator',
      cron: 'mega-forecast-generator',
      description: 'Genereert forecast reports voor planning optimalisatie',
      schedule: '50 * * * *',
    },
    {
      name: 'client-communication-coach',
      cron: 'client-communication-coach',
      description: 'Analyseert klantcommunicatie en verbetert klantvriendelijkheid',
      schedule: '55 * * * *',
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
