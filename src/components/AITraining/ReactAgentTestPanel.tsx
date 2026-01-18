import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Play, Brain, Zap, Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ReActStep {
  step_number: number;
  thought: string;
  action: string | null;
  action_input: Record<string, unknown> | null;
  observation: string | null;
  timestamp: string;
  execution_ms?: number;
}

interface ReActResponse {
  success: boolean;
  answer: string | null;
  steps_count: number;
  tokens_used: number;
  duration_ms: number;
  tools_used: string[];
  error?: string;
  steps?: ReActStep[];
  fallback_to_legacy?: boolean;
}

interface ExecutionTrace {
  id: string;
  session_id: string;
  goal_description: string;
  outcome: string;
  total_duration_ms: number;
  total_tokens_used: number;
  tools_executed: string[];
  created_at: string;
  steps: ReActStep[];
}

export function ReactAgentTestPanel() {
  const [goal, setGoal] = useState("");
  const [orgId, setOrgId] = useState("");
  const [includeSteps, setIncludeSteps] = useState(true);
  const [response, setResponse] = useState<ReActResponse | null>(null);
  const [isStepsOpen, setIsStepsOpen] = useState(true);
  const queryClient = useQueryClient();

  // Check if multi-agent feature flag is enabled
  const { data: featureFlag } = useQuery({
    queryKey: ["multi-agent-feature-flag-deprecation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_feature_flags")
        .select("is_enabled, rollout_percentage")
        .eq("feature_name", "multi_agent_architecture")
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  const isMultiAgentActive = featureFlag?.is_enabled || (featureFlag?.rollout_percentage ?? 0) > 0;

  // Fetch recent execution traces
  const { data: traces, isLoading: tracesLoading } = useQuery({
    queryKey: ["react-agent-traces"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_execution_traces")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      // Map JSON steps to ReActStep array with proper typing
      return (data || []).map((trace: any) => ({
        ...trace,
        steps: Array.isArray(trace.steps) ? trace.steps as ReActStep[] : [],
      })) as ExecutionTrace[];
    },
    refetchInterval: 10000,
  });

  // Fetch tool stability scores
  const { data: toolStats } = useQuery({
    queryKey: ["tool-stability-scores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tool_stability_scores")
        .select("*")
        .order("success_count", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch pending approvals
  const { data: pendingApprovals } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_approvals")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data;
    },
  });

  // Execute ReAct agent
  const executeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("react-agent", {
        body: {
          goal,
          context: {
            org_id: orgId || undefined,
          },
          include_steps: includeSteps,
        },
      });
      
      if (error) throw error;
      return data as ReActResponse;
    },
    onSuccess: (data) => {
      setResponse(data);
      if (data.success) {
        toast.success("ReAct agent voltooid!");
      } else if (data.fallback_to_legacy) {
        toast.warning("ReAct agent uitgeschakeld, fallback naar legacy");
      } else {
        toast.error(`Agent fout: ${data.error}`);
      }
      queryClient.invalidateQueries({ queryKey: ["react-agent-traces"] });
      queryClient.invalidateQueries({ queryKey: ["tool-stability-scores"] });
    },
    onError: (err: Error) => {
      toast.error(`Fout: ${err.message}`);
    },
  });

  const getOutcomeBadge = (outcome: string) => {
    switch (outcome) {
      case "success":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" /> Succes</Badge>;
      case "failure":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" /> Mislukt</Badge>;
      case "partial":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><AlertTriangle className="h-3 w-3 mr-1" /> Gedeeltelijk</Badge>;
      default:
        return <Badge variant="secondary">{outcome}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Deprecation Warning Banner */}
      {isMultiAgentActive && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-400 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Legacy ReAct Agent - Deprecated
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-Agent architectuur is actief ({featureFlag?.rollout_percentage || 100}% rollout). 
            Dit panel is alleen voor debugging van legacy issues. 
            Gebruik <strong>MultiAgentStatusPanel</strong> voor het nieuwe systeem.
          </p>
        </div>
      )}

      {/* Test Panel */}
      <Card className={isMultiAgentActive ? "opacity-75" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            ReAct Agent Test Panel
            {isMultiAgentActive && <Badge variant="secondary" className="ml-2">Legacy</Badge>}
          </CardTitle>
          <CardDescription>
            Test de Enterprise ReAct Agent met Observe → Reason → Act → Reflect loop
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Goal Input */}
          <div className="space-y-2">
            <Label htmlFor="goal">Goal (Natural Language)</Label>
            <Textarea
              id="goal"
              placeholder="Bijv: Hoeveel open sollicitaties zijn er? Of: Vind professionals voor de vacature bij ABCzorg Rotterdam"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
            />
          </div>

          {/* Context Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org_id">Organization ID (optioneel)</Label>
              <Input
                id="org_id"
                placeholder="UUID van organisatie"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Switch
                id="include_steps"
                checked={includeSteps}
                onCheckedChange={setIncludeSteps}
              />
              <Label htmlFor="include_steps">Include Steps (debugging)</Label>
            </div>
          </div>

          {/* Execute Button */}
          <Button
            onClick={() => executeMutation.mutate()}
            disabled={!goal.trim() || executeMutation.isPending}
            className="w-full"
          >
            {executeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Agent uitvoeren...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Voer ReAct Agent uit
              </>
            )}
          </Button>

          {/* Response Display */}
          {response && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Response</h3>
                {response.success ? (
                  <Badge className="bg-green-500/20 text-green-400"><CheckCircle className="h-3 w-3 mr-1" /> Succes</Badge>
                ) : (
                  <Badge className="bg-red-500/20 text-red-400"><XCircle className="h-3 w-3 mr-1" /> Fout</Badge>
                )}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-xs text-muted-foreground">Steps</div>
                  <div className="text-lg font-bold">{response.steps_count}</div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-xs text-muted-foreground">Tokens</div>
                  <div className="text-lg font-bold">{response.tokens_used}</div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-xs text-muted-foreground">Duration</div>
                  <div className="text-lg font-bold">{(response.duration_ms / 1000).toFixed(2)}s</div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-xs text-muted-foreground">Tools</div>
                  <div className="text-lg font-bold">{response.tools_used?.length || 0}</div>
                </div>
              </div>

              {/* Answer */}
              {response.answer && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-2">Final Answer</div>
                  <p className="text-sm">{response.answer}</p>
                </div>
              )}

              {/* Error */}
              {response.error && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="text-xs text-destructive mb-2">Error</div>
                  <p className="text-sm font-mono">{response.error}</p>
                </div>
              )}

              {/* Tools Used */}
              {response.tools_used && response.tools_used.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {response.tools_used.map((tool, idx) => (
                    <Badge key={idx} variant="outline" className="gap-1">
                      <Zap className="h-3 w-3" /> {tool}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Steps Table */}
              {response.steps && response.steps.length > 0 && (
                <Collapsible open={isStepsOpen} onOpenChange={setIsStepsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between">
                      <span>Reasoning Steps ({response.steps.length})</span>
                      {isStepsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border rounded-lg overflow-hidden mt-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Thought</TableHead>
                            <TableHead className="w-32">Action</TableHead>
                            <TableHead>Observation</TableHead>
                            <TableHead className="w-20">Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {response.steps.map((step) => (
                            <TableRow key={step.step_number}>
                              <TableCell className="font-mono">{step.step_number}</TableCell>
                              <TableCell className="max-w-xs truncate text-xs">{step.thought}</TableCell>
                              <TableCell>
                                {step.action ? (
                                  <Badge variant="secondary" className="font-mono text-xs">{step.action}</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-xs truncate text-xs font-mono">{step.observation || "-"}</TableCell>
                              <TableCell className="text-xs">{step.execution_ms ? `${step.execution_ms}ms` : "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tool Stability Stats */}
      {toolStats && toolStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Tool Stability Scores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {toolStats.slice(0, 8).map((tool: any) => {
                const successRate = tool.success_count + tool.failure_count > 0
                  ? (tool.success_count / (tool.success_count + tool.failure_count) * 100).toFixed(0)
                  : 0;
                return (
                  <div key={tool.tool_name} className="p-3 bg-muted rounded-lg">
                    <div className="text-xs font-mono truncate">{tool.tool_name}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-lg font-bold">{successRate}%</span>
                      <span className="text-xs text-muted-foreground">
                        {tool.success_count}✓ / {tool.failure_count}✗
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Approvals */}
      {pendingApprovals && pendingApprovals.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              Pending Approvals ({pendingApprovals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingApprovals.map((approval: any) => (
                <div key={approval.id} className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{approval.tool_name}</Badge>
                    <Badge className="bg-yellow-500/20 text-yellow-400">{approval.risk_level}</Badge>
                  </div>
                  <p className="text-sm mt-2">{approval.reason}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Execution Traces */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recente Execution Traces
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tracesLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : traces && traces.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Goal</TableHead>
                    <TableHead className="w-24">Outcome</TableHead>
                    <TableHead className="w-24">Duration</TableHead>
                    <TableHead className="w-24">Tokens</TableHead>
                    <TableHead className="w-32">Tools</TableHead>
                    <TableHead className="w-32">Tijd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {traces.map((trace) => (
                    <TableRow key={trace.id}>
                      <TableCell className="max-w-xs truncate text-sm">{trace.goal_description}</TableCell>
                      <TableCell>{getOutcomeBadge(trace.outcome || 'unknown')}</TableCell>
                      <TableCell className="text-sm">{((trace.total_duration_ms || 0) / 1000).toFixed(1)}s</TableCell>
                      <TableCell className="text-sm">{trace.total_tokens_used || 0}</TableCell>
                      <TableCell className="text-xs">{(trace.tools_executed || []).length} tools</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(trace.created_at).toLocaleTimeString("nl-NL")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center p-8 text-muted-foreground">
              Nog geen execution traces. Voer een test uit om te beginnen.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
