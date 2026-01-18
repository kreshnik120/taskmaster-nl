import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { 
  Workflow, 
  Hand, 
  FileCheck, 
  CalendarCheck, 
  UserCheck, 
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface FeatureFlagData {
  feature_name: string;
  is_enabled: boolean;
  rollout_percentage: number;
  updated_at: string;
}

interface SpecialistAgent {
  id: string;
  agent_name: string;
  handles_stage: string;
  target_stage: string;
  is_active: boolean;
  email_types: string[];
}

interface AgentActivity {
  function_name: string;
  last_call: string;
  success_count: number;
  error_count: number;
}

const PIPELINE_STAGES = [
  { stage: 'nieuw', label: 'Nieuw', agent: 'agent-welkom', icon: Hand },
  { stage: 'intake_verstuurd', label: 'Intake Verstuurd', agent: 'agent-document', icon: FileCheck },
  { stage: 'docs_compleet', label: 'Docs Compleet', agent: 'agent-planning', icon: CalendarCheck },
  { stage: 'gesprek_gepland', label: 'Gesprek Gepland', agent: 'agent-screening', icon: UserCheck },
  { stage: 'screening', label: 'Screening', agent: 'agent-placement', icon: Award },
  { stage: 'goedgekeurd', label: 'Goedgekeurd', agent: null, icon: CheckCircle2 },
  { stage: 'afgewezen', label: 'Afgewezen', agent: null, icon: XCircle },
];

export function MultiAgentStatusPanel() {
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch feature flag status
  const { data: featureFlag, isLoading: flagLoading, refetch: refetchFlag } = useQuery({
    queryKey: ["multi-agent-feature-flag"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_feature_flags")
        .select("*")
        .eq("feature_name", "multi_agent_architecture")
        .maybeSingle();
      
      if (error) throw error;
      return data as FeatureFlagData | null;
    },
  });

  // Fetch specialist agents config
  const { data: specialists, isLoading: specialistsLoading } = useQuery({
    queryKey: ["specialist-agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_specialists")
        .select("*")
        .order("handles_stage");
      
      if (error) throw error;
      return data as SpecialistAgent[];
    },
  });

  // Fetch recent agent activity from function_call_logs
  const { data: agentActivity, isLoading: activityLoading, refetch: refetchActivity } = useQuery({
    queryKey: ["multi-agent-activity"],
    queryFn: async () => {
      const agentNames = ['pipeline-stage-controller', 'agent-welkom', 'agent-document', 'agent-planning', 'agent-screening', 'agent-placement'];
      
      const results: AgentActivity[] = [];
      
      for (const name of agentNames) {
        const { data: logs } = await supabase
          .from("function_call_logs")
          .select("function_name, success, created_at")
          .eq("function_name", name)
          .order("created_at", { ascending: false })
          .limit(50);
        
        if (logs && logs.length > 0) {
          const successCount = logs.filter(l => l.success === true).length;
          const errorCount = logs.filter(l => l.success === false).length;
          
          results.push({
            function_name: name,
            last_call: logs[0].created_at,
            success_count: successCount,
            error_count: errorCount,
          });
        }
      }
      
      return results;
    },
    refetchInterval: 30000,
  });

  const handleToggleFeatureFlag = async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("system_feature_flags")
        .update({ 
          is_enabled: enabled,
          updated_at: new Date().toISOString()
        })
        .eq("feature_name", "multi_agent_architecture");
      
      if (error) throw error;
      
      toast.success(enabled ? "Multi-Agent systeem geactiveerd" : "Multi-Agent systeem uitgeschakeld");
      refetchFlag();
    } catch (error: any) {
      toast.error(`Fout: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateRollout = async (percentage: number[]) => {
    try {
      const { error } = await supabase
        .from("system_feature_flags")
        .update({ 
          rollout_percentage: percentage[0],
          updated_at: new Date().toISOString()
        })
        .eq("feature_name", "multi_agent_architecture");
      
      if (error) throw error;
      refetchFlag();
    } catch (error: any) {
      toast.error(`Fout: ${error.message}`);
    }
  };

  const getAgentActivity = (agentName: string) => {
    return agentActivity?.find(a => a.function_name === agentName);
  };

  const getAgentStatusBadge = (agentName: string | null) => {
    if (!agentName) return null;
    
    const activity = getAgentActivity(agentName);
    if (!activity) {
      return <Badge variant="secondary" className="text-xs"><Clock className="h-3 w-3 mr-1" /> Geen activiteit</Badge>;
    }
    
    const successRate = activity.success_count + activity.error_count > 0
      ? (activity.success_count / (activity.success_count + activity.error_count) * 100)
      : 0;
    
    if (successRate >= 90) {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> {successRate.toFixed(0)}%</Badge>;
    } else if (successRate >= 70) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs"><AlertTriangle className="h-3 w-3 mr-1" /> {successRate.toFixed(0)}%</Badge>;
    } else {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs"><XCircle className="h-3 w-3 mr-1" /> {successRate.toFixed(0)}%</Badge>;
    }
  };

  const isLoading = flagLoading || specialistsLoading || activityLoading;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" />
              Multi-Agent Architectuur Status
            </CardTitle>
            <CardDescription>
              Pipeline Stage Controller en Specialist Agents monitoring
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { refetchFlag(); refetchActivity(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Feature Flag Status */}
            <div className="p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-1">
                  <h3 className="font-medium">Feature Flag: multi_agent_architecture</h3>
                  <p className="text-xs text-muted-foreground">
                    Laatst bijgewerkt: {featureFlag?.updated_at 
                      ? format(new Date(featureFlag.updated_at), "d MMM yyyy HH:mm", { locale: nl })
                      : "Nooit"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="feature-flag"
                      checked={featureFlag?.is_enabled || false}
                      onCheckedChange={handleToggleFeatureFlag}
                      disabled={isUpdating}
                    />
                    <Label htmlFor="feature-flag">
                      {featureFlag?.is_enabled ? "Actief" : "Inactief"}
                    </Label>
                  </div>
                  {featureFlag?.is_enabled ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <Activity className="h-3 w-3 mr-1" /> Multi-Agent
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Clock className="h-3 w-3 mr-1" /> Legacy
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Rollout Percentage Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <Label>Rollout Percentage</Label>
                  <span className="font-mono text-primary">{featureFlag?.rollout_percentage || 0}%</span>
                </div>
                <Slider
                  value={[featureFlag?.rollout_percentage || 0]}
                  onValueCommit={handleUpdateRollout}
                  max={100}
                  step={10}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  {featureFlag?.rollout_percentage === 0 && "Geen traffic naar multi-agent systeem"}
                  {featureFlag?.rollout_percentage && featureFlag.rollout_percentage > 0 && featureFlag.rollout_percentage < 100 && 
                    `${featureFlag.rollout_percentage}% van requests gaat naar multi-agent systeem`}
                  {featureFlag?.rollout_percentage === 100 && "Alle requests gaan naar multi-agent systeem"}
                </p>
              </div>
            </div>

            <Separator />

            {/* Pipeline Flow Diagram */}
            <div>
              <h3 className="font-medium mb-4">Pipeline Flow</h3>
              <div className="flex items-center gap-2 overflow-x-auto pb-4">
                {PIPELINE_STAGES.map((stage, index) => {
                  const Icon = stage.icon;
                  const isTerminal = !stage.agent;
                  const activity = stage.agent ? getAgentActivity(stage.agent) : null;
                  
                  return (
                    <div key={stage.stage} className="flex items-center gap-2">
                      <div className={`flex flex-col items-center p-3 rounded-lg border min-w-[120px] ${
                        isTerminal 
                          ? stage.stage === 'goedgekeurd' 
                            ? 'bg-green-500/10 border-green-500/30' 
                            : 'bg-red-500/10 border-red-500/30'
                          : 'bg-muted/50'
                      }`}>
                        <Icon className={`h-5 w-5 mb-1 ${
                          isTerminal 
                            ? stage.stage === 'goedgekeurd' ? 'text-green-500' : 'text-red-500'
                            : 'text-primary'
                        }`} />
                        <span className="text-xs font-medium text-center">{stage.label}</span>
                        {stage.agent && (
                          <span className="text-[10px] text-muted-foreground mt-1">{stage.agent}</span>
                        )}
                        {stage.agent && getAgentStatusBadge(stage.agent)}
                        {activity && (
                          <span className="text-[10px] text-muted-foreground mt-1">
                            {activity.success_count}✓ / {activity.error_count}✗
                          </span>
                        )}
                      </div>
                      {index < PIPELINE_STAGES.length - 1 && (
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Agent Details Grid */}
            <div>
              <h3 className="font-medium mb-4">Specialist Agents Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {specialists?.map((specialist) => {
                  const activity = getAgentActivity(specialist.agent_name);
                  const stageInfo = PIPELINE_STAGES.find(s => s.agent === specialist.agent_name);
                  const Icon = stageInfo?.icon || Activity;
                  
                  return (
                    <div 
                      key={specialist.id} 
                      className={`p-4 rounded-lg border ${
                        specialist.is_active ? 'bg-muted/30' : 'bg-muted/10 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{specialist.agent_name}</span>
                        </div>
                        {specialist.is_active ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Actief</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Inactief</Badge>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>{specialist.handles_stage} → {specialist.target_stage}</p>
                        <p>Email types: {specialist.email_types?.join(', ') || 'geen'}</p>
                        {activity && (
                          <>
                            <p className="text-primary">
                              Laatste call: {format(new Date(activity.last_call), "HH:mm", { locale: nl })}
                            </p>
                            <p>Success: {activity.success_count} | Errors: {activity.error_count}</p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}