import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { toast } from "sonner";
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Mail, 
  Reply, 
  Globe, 
  Rocket,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Lock,
  Key,
  TrendingUp,
  AlertTriangle
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface WebhookSecurityDashboardProps {
  compact?: boolean;
}

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details?: string;
}

interface PentestResult {
  summary: {
    total_tests: number;
    passed: number;
    failed: number;
    pass_rate: string;
  };
  results: TestResult[];
  vulnerabilities: string[];
  timestamp: string;
}

interface SystemEvent {
  event_data: PentestResult;
  created_at: string;
}

const endpoints = [
  {
    name: 'process-application-email',
    label: 'Inbound Email Processing',
    securityType: 'Svix Signature',
    icon: Mail,
    description: 'Verwerkt inkomende sollicitatie emails via Resend',
  },
  {
    name: 'handle-application-reply',
    label: 'Email Reply Handler',
    securityType: 'Svix Signature',
    icon: Reply,
    description: 'Verwerkt antwoorden van kandidaten',
  },
  {
    name: 'receive-external-application',
    label: 'External Applications API',
    securityType: 'API Key + Rate Limit',
    icon: Globe,
    description: 'Ontvangt sollicitaties van externe bronnen',
  },
  {
    name: 'deploy-test-webhook',
    label: 'Deploy Webhook',
    securityType: 'HMAC-SHA256',
    icon: Rocket,
    description: 'Ontvangt deployment notificaties',
  },
];

export function WebhookSecurityDashboard({ compact = false }: WebhookSecurityDashboardProps) {
  const queryClient = useQueryClient();
  const [isRunningTest, setIsRunningTest] = useState(false);

  // Fetch latest pentest results from system_events
  const { data: pentestHistory, isLoading } = useQuery({
    queryKey: ['webhook-security-tests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_events')
        .select('event_data, created_at')
        .eq('event_type', 'security_penetration_test')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return (data as unknown as SystemEvent[]) || [];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Run penetration test mutation
  const runTestMutation = useMutation({
    mutationFn: async () => {
      setIsRunningTest(true);
      const { data, error } = await supabase.functions.invoke('webhook-security-tester');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setIsRunningTest(false);
      queryClient.invalidateQueries({ queryKey: ['webhook-security-tests'] });
      
      const passRate = data?.summary?.pass_rate || '0%';
      const passed = data?.summary?.passed || 0;
      const total = data?.summary?.total_tests || 0;
      
      if (passed === total) {
        toast.success(`Penetratietest geslaagd: ${passRate}`, {
          description: `Alle ${total} tests succesvol uitgevoerd`,
        });
      } else {
        toast.warning(`Penetratietest: ${passRate}`, {
          description: `${passed}/${total} tests geslaagd`,
        });
      }
    },
    onError: (error) => {
      setIsRunningTest(false);
      toast.error('Penetratietest mislukt', {
        description: error instanceof Error ? error.message : 'Onbekende fout',
      });
    },
  });

  const latestTest = pentestHistory?.[0]?.event_data;
  const latestTestDate = pentestHistory?.[0]?.created_at;

  const getSecurityStatus = () => {
    if (!latestTest) return 'unknown';
    if (latestTest.summary.passed === latestTest.summary.total_tests) return 'secure';
    if (latestTest.summary.passed >= latestTest.summary.total_tests * 0.8) return 'warning';
    return 'vulnerable';
  };

  const securityStatus = getSecurityStatus();

  const statusConfig = {
    secure: {
      icon: ShieldCheck,
      label: 'Volledig Beveiligd',
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
    },
    warning: {
      icon: ShieldAlert,
      label: 'Waarschuwing',
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
    },
    vulnerable: {
      icon: ShieldAlert,
      label: 'Kwetsbaar',
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
    },
    unknown: {
      icon: Shield,
      label: 'Onbekend',
      color: 'text-muted-foreground',
      bg: 'bg-muted/10',
      border: 'border-muted/30',
    },
  };

  const currentStatus = statusConfig[securityStatus];
  const StatusIcon = currentStatus.icon;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className={`${currentStatus.border} border`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${currentStatus.bg}`}>
                <StatusIcon className={`h-5 w-5 ${currentStatus.color}`} />
              </div>
              <div>
                <p className="font-medium">Webhook Security</p>
                <p className="text-sm text-muted-foreground">
                  {latestTest ? `${latestTest.summary.passed}/${latestTest.summary.total_tests} tests OK` : 'Geen tests'}
                </p>
              </div>
            </div>
            <Badge variant={securityStatus === 'secure' ? 'default' : 'destructive'}>
              {currentStatus.label}
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="bg-gradient-to-r from-primary/5 via-primary/10 to-transparent border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${currentStatus.bg}`}>
              <StatusIcon className={`h-6 w-6 ${currentStatus.color}`} />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Webhook Security Dashboard
                <Badge variant={securityStatus === 'secure' ? 'default' : 'destructive'} className="ml-2">
                  {currentStatus.label}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Real-time status van alle beveiligde endpoints
              </p>
            </div>
          </div>
          <AdminOnly>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runTestMutation.mutate()}
              disabled={isRunningTest}
              className="gap-2"
            >
              {isRunningTest ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Testen...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Penetratietest
                </>
              )}
            </Button>
          </AdminOnly>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Security Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-primary">{endpoints.length}</div>
            <div className="text-xs text-muted-foreground">Endpoints Beveiligd</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-500">
              {latestTest?.summary?.pass_rate || '-'}
            </div>
            <div className="text-xs text-muted-foreground">Pass Rate</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {latestTest?.vulnerabilities?.length || 0}
            </div>
            <div className="text-xs text-muted-foreground">Vulnerabilities</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-muted-foreground">
              {latestTestDate 
                ? formatDistanceToNow(new Date(latestTestDate), { locale: nl, addSuffix: true })
                : '-'
              }
            </div>
            <div className="text-xs text-muted-foreground">Laatste Test</div>
          </div>
        </div>

        {/* Endpoint Status Cards */}
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Beveiligde Endpoints
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {endpoints.map((endpoint) => {
              const EndpointIcon = endpoint.icon;
              return (
                <div
                  key={endpoint.name}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="p-2 rounded-md bg-primary/10">
                    <EndpointIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{endpoint.label}</p>
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{endpoint.name}</p>
                    <Badge variant="outline" className="mt-1 text-xs">
                      <Key className="h-3 w-3 mr-1" />
                      {endpoint.securityType}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Latest Test Results */}
        {latestTest && (
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Laatste Penetratietest Resultaten
            </h3>
            <div className="space-y-2">
              {latestTest.results?.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-2 rounded-md ${
                    result.passed ? 'bg-green-500/5' : 'bg-red-500/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm">{result.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {result.duration}ms
                    </span>
                    <Badge variant={result.passed ? 'default' : 'destructive'} className="text-xs">
                      {result.passed ? 'PASS' : 'FAIL'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test History Timeline */}
        {pentestHistory && pentestHistory.length > 1 && (
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Test Geschiedenis
            </h3>
            <div className="space-y-2">
              {pentestHistory.slice(1).map((test, index) => {
                const testData = test.event_data;
                const allPassed = testData.summary.passed === testData.summary.total_tests;
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/20"
                  >
                    <div className="flex items-center gap-2">
                      {allPassed ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(test.created_at), 'dd MMM yyyy HH:mm', { locale: nl })}
                      </span>
                    </div>
                    <Badge variant={allPassed ? 'outline' : 'secondary'}>
                      {testData.summary.passed}/{testData.summary.total_tests} passed
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No tests yet message */}
        {!latestTest && (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nog geen penetratietests uitgevoerd</p>
            <p className="text-sm">Klik op "Run Penetratietest" om de security te valideren</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
