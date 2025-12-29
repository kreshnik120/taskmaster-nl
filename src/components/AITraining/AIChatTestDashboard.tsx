import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, CheckCircle, XCircle, Clock, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface TestRun {
  id: string;
  status: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  avg_response_time_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  deployment_id: string | null;
  deployment_source: string | null;
  alert_sent: boolean | null;
}

interface TestResult {
  id: string;
  test_run_id: string;
  scenario_id: string;
  question: string;
  response: string | null;
  passed: boolean;
  expected_tool: string | null;
  actual_tool_used: string | null;
  response_time_ms: number | null;
  error_message: string | null;
  validation_details: any;
  created_at: string | null;
}

export function AIChatTestDashboard() {
  const queryClient = useQueryClient();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  // Fetch recent test runs
  const { data: testRuns, isLoading: runsLoading, refetch: refetchRuns } = useQuery({
    queryKey: ["ai-chat-test-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_chat_test_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as TestRun[];
    },
    refetchInterval: 10000, // Poll every 10s for updates
  });

  // Fetch results for expanded run
  const { data: testResults, isLoading: resultsLoading } = useQuery({
    queryKey: ["ai-chat-test-results", expandedRun],
    queryFn: async () => {
      if (!expandedRun) return [];
      const { data, error } = await supabase
        .from("ai_chat_test_results")
        .select("*")
        .eq("test_run_id", expandedRun)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data as TestResult[];
    },
    enabled: !!expandedRun,
  });

  // Mutation to trigger tests manually
  const triggerTests = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("deploy-test-webhook", {
        body: {
          deployment_id: `manual-${Date.now()}`,
          deployment_source: "manual",
          commit_message: "Manual test trigger from dashboard",
        },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Tests gestart! Run ID: ${data.test_run_id?.slice(0, 8)}...`);
      refetchRuns();
    },
    onError: (error: any) => {
      toast.error(`Test trigger mislukt: ${error.message}`);
    },
  });

  // Calculate stats
  const latestRun = testRuns?.[0];
  const passRate = latestRun 
    ? Math.round((latestRun.passed_tests / latestRun.total_tests) * 100) 
    : 0;
  const avgResponseTime = latestRun?.avg_response_time_ms 
    ? Math.round(latestRun.avg_response_time_ms) 
    : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-500">Voltooid</Badge>;
      case "running":
        return <Badge variant="secondary" className="animate-pulse">Bezig...</Badge>;
      case "failed":
        return <Badge variant="destructive">Mislukt</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Run Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                AI Chat Test Suite
              </CardTitle>
              <CardDescription>
                Automatische tests voor AI-chat functionaliteit na elke deployment
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchRuns()}
                disabled={runsLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${runsLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                onClick={() => triggerTests.mutate()}
                disabled={triggerTests.isPending}
              >
                {triggerTests.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Run Tests Nu
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pass Rate</p>
                <p className="text-2xl font-bold">{passRate}%</p>
              </div>
              {passRate >= 80 ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : passRate >= 50 ? (
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              ) : (
                <XCircle className="h-8 w-8 text-red-500" />
              )}
            </div>
            <Progress value={passRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gem. Response</p>
                <p className="text-2xl font-bold">{avgResponseTime}ms</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Totaal Runs</p>
                <p className="text-2xl font-bold">{testRuns?.length || 0}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Laatste Run</p>
                <p className="text-lg font-medium">
                  {latestRun?.started_at 
                    ? formatDistanceToNow(new Date(latestRun.started_at), { locale: nl, addSuffix: true })
                    : "Geen data"
                  }
                </p>
              </div>
              {latestRun && getStatusBadge(latestRun.status)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Runs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recente Test Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : testRuns?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nog geen test runs uitgevoerd.</p>
              <p className="text-sm">Klik op "Run Tests Nu" om te beginnen.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Gestart</TableHead>
                  <TableHead>Tests</TableHead>
                  <TableHead>Geslaagd</TableHead>
                  <TableHead>Mislukt</TableHead>
                  <TableHead>Gem. Tijd</TableHead>
                  <TableHead>Bron</TableHead>
                  <TableHead>Alert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testRuns?.map((run) => (
                  <>
                    <TableRow 
                      key={run.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                    >
                      <TableCell>{getStatusBadge(run.status)}</TableCell>
                      <TableCell>
                        {run.started_at 
                          ? format(new Date(run.started_at), "dd MMM HH:mm", { locale: nl })
                          : "-"
                        }
                      </TableCell>
                      <TableCell>{run.total_tests}</TableCell>
                      <TableCell className="text-green-600">{run.passed_tests}</TableCell>
                      <TableCell className="text-red-600">{run.failed_tests}</TableCell>
                      <TableCell>{run.avg_response_time_ms ? `${Math.round(run.avg_response_time_ms)}ms` : "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {run.deployment_source || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {run.alert_sent ? (
                          <Badge variant="destructive" className="text-xs">Verstuurd</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded Results */}
                    {expandedRun === run.id && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30 p-4">
                          {resultsLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="font-medium text-sm mb-3">Test Resultaten:</p>
                              {testResults?.map((result) => (
                                <div 
                                  key={result.id}
                                  className={`p-3 rounded-lg border ${
                                    result.passed 
                                      ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" 
                                      : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                                  }`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        {result.passed ? (
                                          <CheckCircle className="h-4 w-4 text-green-600" />
                                        ) : (
                                          <XCircle className="h-4 w-4 text-red-600" />
                                        )}
                                        <span className="font-medium text-sm">{result.scenario_id}</span>
                                        {result.response_time_ms && (
                                          <Badge variant="outline" className="text-xs">
                                            {result.response_time_ms}ms
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        Q: {result.question}
                                      </p>
                                      {result.error_message && (
                                        <p className="text-sm text-red-600 mt-1">
                                          ❌ {result.error_message}
                                        </p>
                                      )}
                                      {result.response && !result.passed && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                          A: {result.response.slice(0, 200)}...
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
