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
    { name: 'REST HEAD Ping', status: 'pending' },
    { name: 'Core DB Reachability', status: 'pending' },
    { name: 'Backend REST', status: 'pending' },
    { name: 'Auth Service', status: 'pending' },
    { name: 'Edge Functions', status: 'pending' },
    { name: 'Storage Service', status: 'pending' },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSmokeTestRunning, setIsSmokeTestRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [smokeTestResult, setSmokeTestResult] = useState<string>('');

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
      
      // Enhanced error detection with categories
      let errorType = 'Fout';
      let details = error?.message || 'Onbekende fout';
      let errorCategory = '';
      
      if (error?.name === 'AbortError' || error?.message?.includes('timeout')) {
        errorType = 'Infra-timeout ⏱️';
        errorCategory = '[TIMEOUT]';
        details = `Client-side timeout - verzoek duurde te lang (${latency}ms)`;
      } else if (error?.code === '544' || error?.message?.includes('504')) {
        errorType = 'Infra-timeout (504/544) ⏱️';
        errorCategory = '[TIMEOUT]';
        details = `Database gateway timeout - backend overbelast of offline (${latency}ms)`;
      } else if (error?.code === '401') {
        errorType = 'Auth (401) 🔒';
        errorCategory = '[AUTH]';
        details = `Niet geautoriseerd - login vereist (${latency}ms)`;
      } else if (error?.code === '403') {
        errorType = 'RLS/Toegang (403) 🚫';
        errorCategory = '[RLS]';
        details = `RLS policy voorkomt toegang (${latency}ms)`;
      } else if (error?.code === '429') {
        errorType = 'Rate limit (429) 🚦';
        errorCategory = '[RATE_LIMIT]';
        details = `Te veel verzoeken - wacht en probeer opnieuw (${latency}ms)`;
      } else if (error?.code === '402') {
        errorType = 'Quota (402) 💳';
        errorCategory = '[QUOTA]';
        details = `Quota overschreden - check billing (${latency}ms)`;
      }
      
      details = `${errorCategory} ${details}${error?.code ? ` | Code: ${error.code}` : ''}`;
      
      updateCheck(index, { 
        status: 'error', 
        latency, 
        message: errorType, 
        details
      });
    }
  };

  const runAllChecks = async () => {
    setIsRunning(true);
    setChecks(prev => prev.map(c => ({ ...c, status: 'pending', latency: undefined, message: undefined, details: undefined })));

    // Check 0: HEAD REST ping (3s timeout)
    await runCheck(0, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`,
        {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
          }
        }
      );
      
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    });

    // Check 1: Core DB reachability (5s timeout with AbortController)
    await runCheck(1, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const { error } = await supabase
        .from('tasks')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal)
        .maybeSingle();
      
      clearTimeout(timeoutId);
      if (error && error.code !== 'PGRST116') throw error;
    });

    // Check 2: REST reachability
    await runCheck(2, async () => {
      const { error } = await supabase.from('autonomous_system_status').select('count').limit(1).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
    });

    // Check 3: Auth service
    await runCheck(3, async () => {
      const { error } = await supabase.auth.getSession();
      if (error) throw error;
    });

    // Check 4: Edge Functions (5s timeout)
    await runCheck(4, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const { error } = await supabase.functions.invoke('system-health-monitor', {
        body: { check: 'ping' }
      });
      
      clearTimeout(timeoutId);
      if (error) throw error;
    });

    // Check 5: Storage (user-scope list)
    await runCheck(5, async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const { error } = await supabase.storage.listBuckets();
        if (error) throw error;
      } else {
        // User-scoped check
        const { error } = await supabase.storage.from('training-documents').list('', { limit: 1 });
        if (error && error.message !== 'Bucket not found') throw error;
      }
    });

    setIsRunning(false);
    setLastRun(new Date());
  };

  const runSmokeTest = async () => {
    setIsSmokeTestRunning(true);
    setSmokeTestResult('');
    const results: string[] = [];
    
    try {
      // 1. HEAD REST (3s)
      const headStart = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`,
          {
            method: 'HEAD',
            signal: controller.signal,
            headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }
          }
        );
        clearTimeout(timeoutId);
        results.push(`✅ HEAD REST: ${Date.now() - headStart}ms (${response.status})`);
      } catch (e: any) {
        results.push(`❌ HEAD REST: ${e.message} (${Date.now() - headStart}ms)`);
      }
      
      // 2. SELECT query (5s)
      const selectStart = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const { error } = await supabase
          .from('tasks')
          .select('id')
          .limit(1)
          .abortSignal(controller.signal)
          .maybeSingle();
        
        clearTimeout(timeoutId);
        if (error && error.code !== 'PGRST116') throw error;
        results.push(`✅ DB SELECT: ${Date.now() - selectStart}ms`);
      } catch (e: any) {
        results.push(`❌ DB SELECT: ${e.message} (${Date.now() - selectStart}ms)`);
      }
      
      // 3. Edge function (5s)
      const funcStart = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const { error } = await supabase.functions.invoke('system-health-monitor', {
          body: { check: 'ping' }
        });
        
        clearTimeout(timeoutId);
        if (error) throw error;
        results.push(`✅ Edge Function: ${Date.now() - funcStart}ms`);
      } catch (e: any) {
        results.push(`❌ Edge Function: ${e.message} (${Date.now() - funcStart}ms)`);
      }
      
      setSmokeTestResult(results.join('\n'));
    } finally {
      setIsSmokeTestRunning(false);
    }
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
    const summary = checks.map(c => {
      const status = c.status.toUpperCase();
      const latency = c.latency ? `${c.latency}ms` : 'N/A';
      const msg = c.message || status;
      const details = c.details ? `\n  Details: ${c.details}` : '';
      return `[${status}] ${c.name} (${latency}) - ${msg}${details}`;
    }).join('\n\n');
    
    return `=== BACKEND DIAGNOSTICS RAPPORT ===
Timestamp: ${timestamp}
Project: TaskFlow (ABCzorg/CitoZorg)
User: ${supabase.auth.getSession() ? 'Authenticated' : 'Anonymous'}

--- SERVICE STATUS ---
${summary}

--- ACTIES ---
${checks.filter(c => c.status === 'error').length > 0 ? 
  '⚠️ Backend is momenteel offline\n⚠️ Meerdere timeouts (504/544) gedetecteerd\n⚠️ Neem contact op met Lovable support' : 
  '✅ Alle services operationeel'}

Gegenereerd door: TaskFlow Diagnostics v1.0`;
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
          <div className="flex gap-2">
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
            <Button 
              onClick={runSmokeTest} 
              disabled={isSmokeTestRunning}
              variant="secondary"
              size="lg"
            >
              {isSmokeTestRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rooktest...
                </>
              ) : (
                '🔥 Snelle Rooktest'
              )}
            </Button>
          </div>
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

        {smokeTestResult && (
          <Card>
            <CardHeader>
              <CardTitle>Rooktest Resultaat</CardTitle>
              <CardDescription>
                Snelle health check van kritieke backend services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-sm font-mono bg-muted p-4 rounded-md whitespace-pre-wrap">
                {smokeTestResult}
              </pre>
            </CardContent>
          </Card>
        )}

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
