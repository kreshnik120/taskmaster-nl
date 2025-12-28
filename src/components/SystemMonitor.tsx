import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Database, TrendingUp } from "lucide-react";
import { logger } from "@/lib/logger";

interface CronJob {
  jobname: string;
  schedule: string;
  active: boolean;
}

export const SystemMonitor = () => {
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [knowledgeStats, setKnowledgeStats] = useState({ total: 0, today: 0 });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      // Load knowledge stats only
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

      // Simplified cron jobs count
      setCronJobs([
        { jobname: 'system-jobs', schedule: 'hourly', active: true }
      ]);

    } catch (error) {
      logger.error('Error loading monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      </div>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>Autonomous AI system operating parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Operating Mode:</span>
            <Badge variant="default">Autonomous Learning</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Safety Level:</span>
            <Badge variant="outline">High (Human-in-the-Loop)</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Learning Frequency:</span>
            <span className="font-medium">Hourly (11 functions)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Focus Areas:</span>
            <span className="font-medium">Planning & Professional Matching</span>
          </div>
          <div className="border-t pt-3 mt-3">
            <p className="text-xs text-muted-foreground">
              <strong>Costs:</strong> Approximately €0.15-0.30 per day (~€5-9/month) for continuous learning.
              Most economical AI system with real-time knowledge updates.
            </p>
          </div>
          <div className="border-t pt-3 mt-3">
            <p className="text-xs text-muted-foreground">
              <strong>Expectations:</strong> The system learns autonomously from user interactions, task patterns,
              and external sources. Knowledge base grows organically - expect 50-200 new high-quality items per day
              focused on planning optimization and professional matching intelligence.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};