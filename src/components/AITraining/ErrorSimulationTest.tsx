import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface PatternMetrics {
  id: string;
  keywords: string[];
  error_count: number;
  consecutive_errors: number;
  last_error: string | null;
  last_error_at: string | null;
  success_count: number;
  usage_count: number;
}

export function ErrorSimulationTest() {
  const { toast } = useToast();
  const [testing, setTesting] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    type: string;
    success: boolean;
    message: string;
  } | null>(null);

  const { data: patternsWithErrors, refetch } = useQuery({
    queryKey: ['patterns-with-errors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fast_path_patterns')
        .select('id, keywords, error_count, consecutive_errors, last_error, last_error_at, success_count, usage_count')
        .or('error_count.gt.0,last_error.neq.null')
        .order('last_error_at', { ascending: false, nullsFirst: false })
        .limit(10);
      
      if (error) throw error;
      return data as PatternMetrics[];
    },
    refetchInterval: 5000
  });

  const { data: allPatternStats } = useQuery({
    queryKey: ['all-pattern-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fast_path_patterns')
        .select('error_count, consecutive_errors, success_count')
        .eq('is_active', true);
      
      if (error) throw error;
      
      const totalErrors = data?.reduce((sum, p) => sum + (p.error_count || 0), 0) || 0;
      const totalSuccesses = data?.reduce((sum, p) => sum + (p.success_count || 0), 0) || 0;
      const patternsWithConsecutiveErrors = data?.filter(p => (p.consecutive_errors || 0) > 0).length || 0;
      
      return { totalErrors, totalSuccesses, patternsWithConsecutiveErrors, totalPatterns: data?.length || 0 };
    },
    refetchInterval: 5000
  });

  const triggerError = async (errorType: 'dynamic_pattern' | 'hardcoded_pattern' | 'hardcoded_count_error') => {
    setTesting(errorType);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [{ role: 'user', content: 'hoeveel organisaties zijn er' }],
          simulate_error: errorType
        }
      });

      // The function should fail intentionally
      if (error) {
        setLastResult({
          type: errorType,
          success: true,
          message: `Error simulation triggered successfully: ${error.message}`
        });
        toast({
          title: "Error Simulation Triggered",
          description: `${errorType} error was simulated. Check pattern metrics.`,
        });
      } else {
        // If we got a response, check if it contains error info
        setLastResult({
          type: errorType,
          success: true,
          message: `Simulation completed. Response received.`
        });
      }

      // Refetch to see updated metrics
      await refetch();
    } catch (err) {
      setLastResult({
        type: errorType,
        success: true,
        message: `Error simulation triggered: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
      toast({
        title: "Error Simulation Completed",
        description: "Error was simulated. Refreshing pattern metrics...",
      });
      await refetch();
    } finally {
      setTesting(null);
    }
  };

  const triggerSuccess = async () => {
    setTesting('success');
    setLastResult(null);

    try {
      const { error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [{ role: 'user', content: 'hoeveel organisaties zijn er' }]
        }
      });

      if (error) {
        setLastResult({
          type: 'success',
          success: false,
          message: `Failed: ${error.message}`
        });
      } else {
        setLastResult({
          type: 'success',
          success: true,
          message: 'Success query completed - consecutive_errors should reset to 0'
        });
        toast({
          title: "Success Query Completed",
          description: "consecutive_errors should be reset to 0",
        });
      }

      await refetch();
    } catch (err) {
      setLastResult({
        type: 'success',
        success: false,
        message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setTesting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Error Handling Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Overview */}
        {allPatternStats && (
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="text-2xl font-bold text-destructive">{allPatternStats.totalErrors}</div>
              <div className="text-xs text-muted-foreground">Total Errors</div>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-600">{allPatternStats.totalSuccesses}</div>
              <div className="text-xs text-muted-foreground">Total Successes</div>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="text-2xl font-bold text-amber-600">{allPatternStats.patternsWithConsecutiveErrors}</div>
              <div className="text-xs text-muted-foreground">With Consecutive Errors</div>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="text-2xl font-bold">{allPatternStats.totalPatterns}</div>
              <div className="text-xs text-muted-foreground">Active Patterns</div>
            </div>
          </div>
        )}

        {/* Test Buttons */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Trigger Simulated Errors</h4>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerError('dynamic_pattern')}
              disabled={testing !== null}
              className="border-amber-500/50 hover:bg-amber-500/10"
            >
              {testing === 'dynamic_pattern' && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
              Test Dynamic Pattern Error
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerError('hardcoded_pattern')}
              disabled={testing !== null}
              className="border-amber-500/50 hover:bg-amber-500/10"
            >
              {testing === 'hardcoded_pattern' && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
              Test Hardcoded Pattern Error
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerError('hardcoded_count_error')}
              disabled={testing !== null}
              className="border-amber-500/50 hover:bg-amber-500/10"
            >
              {testing === 'hardcoded_count_error' && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
              Test Hardcoded Count Error
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={triggerSuccess}
              disabled={testing !== null}
              className="border-emerald-500/50 hover:bg-emerald-500/10"
            >
              {testing === 'success' && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
              Test Success (Reset Consecutive)
            </Button>
          </div>
        </div>

        {/* Last Result */}
        {lastResult && (
          <div className={`p-3 rounded-lg border ${lastResult.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-destructive/10 border-destructive/30'}`}>
            <div className="flex items-center gap-2">
              {lastResult.success ? (
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm font-medium">{lastResult.type}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{lastResult.message}</p>
          </div>
        )}

        {/* Patterns with Errors */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Patterns with Errors</h4>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          </div>

          {patternsWithErrors && patternsWithErrors.length > 0 ? (
            <div className="space-y-2">
              {patternsWithErrors.map((pattern) => (
                <div key={pattern.id} className="p-3 bg-muted/50 rounded-lg text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {pattern.keywords?.slice(0, 3).join(', ')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">
                        Errors: {pattern.error_count}
                      </Badge>
                      {(pattern.consecutive_errors || 0) > 0 && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                          Consecutive: {pattern.consecutive_errors}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        Success: {pattern.success_count || 0}
                      </Badge>
                    </div>
                  </div>
                  {pattern.last_error && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Last Error:</span> {pattern.last_error}
                      {pattern.last_error_at && (
                        <span className="ml-2">
                          ({new Date(pattern.last_error_at).toLocaleString('nl-NL')})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              No patterns with errors yet. Click a test button above to simulate errors.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
