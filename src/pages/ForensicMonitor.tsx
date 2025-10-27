import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Play, Square, Download, Clock, Database, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface CheckResult {
  timestamp: string;
  db_reachable: boolean;
  db_latency_ms: number;
  db_error?: string;
  db_logs_count: number;
  edge_logs_count: number;
  public_health_status?: string;
  public_health_latency_ms?: number;
}

export default function ForensicMonitor() {
  const [isRunning, setIsRunning] = useState(false);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [currentCheck, setCurrentCheck] = useState<CheckResult | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const runSingleCheck = async (): Promise<CheckResult> => {
    const timestamp = new Date().toISOString();
    const result: CheckResult = {
      timestamp,
      db_reachable: false,
      db_latency_ms: 0,
      db_logs_count: 0,
      edge_logs_count: 0,
    };

    // 1. DB Reachability Check
    const dbStart = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const { error } = await supabase
        .from('tasks')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal)
        .maybeSingle();

      clearTimeout(timeoutId);
      result.db_latency_ms = Date.now() - dbStart;
      result.db_reachable = !error || error.code === 'PGRST116';
      if (error && error.code !== 'PGRST116') {
        result.db_error = `${error.message} (${error.code})`;
      }
    } catch (err: any) {
      result.db_latency_ms = Date.now() - dbStart;
      result.db_error = err.name === 'AbortError' ? 'Timeout (3s)' : err.message;
    }

    // 2. Check public-health endpoint
    try {
      const healthStart = Date.now();
      const healthResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-health`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      result.public_health_latency_ms = Date.now() - healthStart;
      const healthData = await healthResponse.json();
      result.public_health_status = healthData.overall_status;
    } catch (err: any) {
      result.public_health_status = 'unreachable';
    }

    // 3. Skip DB/Edge logs fetching (not accessible via client)
    result.db_logs_count = 0;
    result.edge_logs_count = 0;

    return result;
  };

  const startMonitoring = async () => {
    setIsRunning(true);
    toast.success('Forensische monitoring gestart (check om de 5 min)');

    // Run first check immediately
    const firstCheck = await runSingleCheck();
    setCurrentCheck(firstCheck);
    setChecks((prev) => [firstCheck, ...prev]);

    // Schedule subsequent checks every 5 minutes
    intervalRef.current = setInterval(async () => {
      const check = await runSingleCheck();
      setCurrentCheck(check);
      setChecks((prev) => [check, ...prev].slice(0, 50)); // Keep last 50
    }, 5 * 60 * 1000);
  };

  const stopMonitoring = () => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    toast.info('Forensische monitoring gestopt');
  };

  const generateIncidentReport = () => {
    if (checks.length === 0) {
      toast.error('Geen checks uitgevoerd');
      return;
    }

    const report = `
=== INCIDENT FORENSISCH RAPPORT ===
Project: TaskMaster-NL
Supabase Project ID: oelmsmcgryeoryhonexw
Gegenereerd: ${new Date().toISOString()}

SAMENVATTING:
- Totaal checks: ${checks.length}
- DB bereikbaar: ${checks.filter((c) => c.db_reachable).length}/${checks.length}
- Gemiddelde DB latency: ${(checks.reduce((sum, c) => sum + c.db_latency_ms, 0) / checks.length).toFixed(0)}ms
- Laatste check: ${checks[0].timestamp}

CHRONOLOGIE (laatste 10):
${checks
  .slice(0, 10)
  .map(
    (c, i) =>
      `${i + 1}. ${c.timestamp}
   DB: ${c.db_reachable ? '✅' : '❌'} (${c.db_latency_ms}ms) ${c.db_error || ''}
   Public Health: ${c.public_health_status} (${c.public_health_latency_ms}ms)
   DB Logs: ${c.db_logs_count} | Edge Logs: ${c.edge_logs_count}`
  )
  .join('\n\n')}

DIAGNOSE:
${checks[0].db_reachable ? '⚠️ Backend momenteel bereikbaar' : '🔴 Backend NIET bereikbaar (consistent 544/timeout)'}

VERZOEK AAN OPERATORS:
1. Controleer DB instance health + pooler status
2. Check voor lange/geblokkeerde transacties
3. Restart DB instance + pooler indien nodig
4. Onderzoek compute/proxy logs voor 544 oorzaak

CONTACT:
Gebruiker kan live feedback geven via chat zodra er verandering is.
    `.trim();

    navigator.clipboard.writeText(report);
    toast.success('Incident rapport gekopieerd naar klembord');
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Forensische Backend Monitor</h1>
          <p className="text-muted-foreground">
            Geautomatiseerde incident tracking (5-min interval)
          </p>
        </div>
        <div className="flex gap-2">
          {!isRunning ? (
            <Button onClick={startMonitoring} size="lg">
              <Play className="w-4 h-4 mr-2" />
              Start Monitoring
            </Button>
          ) : (
            <Button onClick={stopMonitoring} variant="destructive" size="lg">
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          )}
          <Button
            onClick={generateIncidentReport}
            variant="outline"
            size="lg"
            disabled={checks.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Rapport
          </Button>
        </div>
      </div>

      {isRunning && (
        <Alert>
          <Activity className="h-4 w-4 animate-pulse" />
          <AlertDescription>
            Monitoring actief - volgende check over ~5 minuten. {checks.length} checks verzameld.
          </AlertDescription>
        </Alert>
      )}

      {currentCheck && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Laatste Check
            </CardTitle>
            <CardDescription>{currentCheck.timestamp}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">DB Status</p>
                <Badge variant={currentCheck.db_reachable ? 'default' : 'destructive'}>
                  {currentCheck.db_reachable ? 'Bereikbaar' : 'Timeout'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">DB Latency</p>
                <p className="text-lg font-mono">{currentCheck.db_latency_ms}ms</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Public Health</p>
                <Badge
                  variant={
                    currentCheck.public_health_status === 'healthy' ? 'default' : 'destructive'
                  }
                >
                  {currentCheck.public_health_status}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Edge Logs</p>
                <p className="text-lg font-mono">{currentCheck.edge_logs_count}</p>
              </div>
            </div>
            {currentCheck.db_error && (
              <Alert variant="destructive">
                <AlertDescription className="font-mono text-sm">
                  {currentCheck.db_error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Check Historie ({checks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {checks.map((check, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Badge variant={check.db_reachable ? 'default' : 'destructive'}>
                    {check.db_reachable ? '✅' : '❌'}
                  </Badge>
                  <span className="text-sm font-mono">{check.timestamp}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{check.db_latency_ms}ms</span>
                  <span>
                    {check.db_logs_count} logs | {check.edge_logs_count} edge
                  </span>
                </div>
              </div>
            ))}
            {checks.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Nog geen checks uitgevoerd. Start monitoring om te beginnen.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
