import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, AlertTriangle, Copy, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CheckResult {
  name: string;
  status: 'pending' | 'success' | 'error' | 'warning';
  latency?: number;
  message?: string;
  details?: string;
}

export default function Diagnostics() {
  const [checks, setChecks] = useState<CheckResult[]>([
    { name: 'Backend REST', status: 'pending' },
    { name: 'Auth Service', status: 'pending' },
    { name: 'Edge Functions', status: 'pending' },
    { name: 'Storage Service', status: 'pending' },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const updateCheck = (index: number, update: Partial<CheckResult>) => {
    setChecks(prev => {
      const newChecks = [...prev];
      newChecks[index] = { ...newChecks[index], ...update };
      return newChecks;
    });
  };

  const runCheck = async (index: number, checkFn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await checkFn();
      const latency = Date.now() - start;
      updateCheck(index, { status: 'success', latency, message: 'OK' });
    } catch (error: any) {
      const latency = Date.now() - start;
      updateCheck(index, { 
        status: 'error', 
        latency, 
        message: 'Fout', 
        details: error?.message || 'Onbekende fout'
      });
    }
  };

  const runAllChecks = async () => {
    setIsRunning(true);
    setChecks(prev => prev.map(c => ({ ...c, status: 'pending', latency: undefined, message: undefined, details: undefined })));

    // Check 1: REST reachability
    await runCheck(0, async () => {
      const { error } = await supabase.from('autonomous_system_status').select('count').limit(1);
      if (error && error.code !== 'PGRST116') throw error;
    });

    // Check 2: Auth service
    await runCheck(1, async () => {
      const { error } = await supabase.auth.getSession();
      if (error) throw error;
    });

    // Check 3: Edge Functions
    await runCheck(2, async () => {
      const { error } = await supabase.functions.invoke('system-health-monitor', {
        body: { check: 'ping' }
      });
      if (error) throw error;
    });

    // Check 4: Storage
    await runCheck(3, async () => {
      const { error } = await supabase.storage.listBuckets();
      if (error) throw error;
    });

    setIsRunning(false);
    setLastRun(new Date());
  };

  const getStatusIcon = (status: CheckResult['status']) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: CheckResult['status']) => {
    switch (status) {
      case 'success': return <Badge variant="default" className="bg-green-500">OK</Badge>;
      case 'error': return <Badge variant="destructive">Fout</Badge>;
      case 'warning': return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Waarschuwing</Badge>;
      default: return <Badge variant="outline">Wachten...</Badge>;
    }
  };

  const generateIncidentSnippet = () => {
    const timestamp = new Date().toISOString();
    const summary = checks.map(c => 
      `${c.name}: ${c.status.toUpperCase()} ${c.latency ? `(${c.latency}ms)` : ''} ${c.details ? `- ${c.details}` : ''}`
    ).join('\n');
    
    return `Backend Diagnostics - ${timestamp}\n\n${summary}\n\nSupport ID: ${supabase.auth.getSession()}`;
  };

  const copyIncidentReport = () => {
    const snippet = generateIncidentSnippet();
    navigator.clipboard.writeText(snippet);
    toast.success('Incident rapport gekopieerd naar klembord');
  };

  const allSuccess = checks.every(c => c.status === 'success');
  const hasError = checks.some(c => c.status === 'error');

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Activity className="h-8 w-8" />
              Backend Diagnostics
            </h1>
            <p className="text-muted-foreground mt-2">
              Controleer de bereikbaarheid van alle backend services
            </p>
          </div>
          <Button 
            onClick={runAllChecks} 
            disabled={isRunning}
            size="lg"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Bezig met testen...
              </>
            ) : (
              'Run Diagnostics'
            )}
          </Button>
        </div>

        {lastRun && (
          <Alert variant={allSuccess ? 'default' : 'destructive'}>
            {allSuccess ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <AlertTitle>
              {allSuccess ? 'Alle checks geslaagd!' : 'Er zijn problemen gedetecteerd'}
            </AlertTitle>
            <AlertDescription>
              Laatste run: {lastRun.toLocaleString('nl-NL')}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          {checks.map((check, index) => (
            <Card key={check.name}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(check.status)}
                    <CardTitle className="text-lg">{check.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {check.latency && (
                      <span className="text-sm text-muted-foreground">
                        {check.latency}ms
                      </span>
                    )}
                    {getStatusBadge(check.status)}
                  </div>
                </div>
              </CardHeader>
              {check.details && (
                <CardContent>
                  <p className="text-sm text-muted-foreground font-mono">
                    {check.details}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {hasError && (
          <Card>
            <CardHeader>
              <CardTitle>Incident Rapport</CardTitle>
              <CardDescription>
                Kopieer dit rapport voor support of troubleshooting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={copyIncidentReport}
                  className="w-full"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Kopieer Incident Rapport
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
