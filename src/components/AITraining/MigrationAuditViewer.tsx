import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  GitCompare, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Clock,
  Loader2,
  ArrowRight
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Json } from "@/integrations/supabase/types";

interface MigrationAuditEntry {
  id: string;
  application_id: string;
  trigger_source: string;
  old_system_action: Json;
  new_system_action: Json;
  matched: boolean;
  discrepancy_notes: string | null;
  execution_time_ms: number | null;
  created_at: string;
}

export function MigrationAuditViewer() {
  // Check if feature flag is enabled
  const { data: featureFlag } = useQuery({
    queryKey: ["multi-agent-feature-flag-check"],
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

  // Fetch migration audit logs
  const { data: auditLogs, isLoading, refetch } = useQuery({
    queryKey: ["migration-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("migration_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as MigrationAuditEntry[];
    },
    enabled: !!featureFlag?.is_enabled || (featureFlag?.rollout_percentage ?? 0) > 0,
    refetchInterval: 30000,
  });

  // Calculate stats
  const stats = auditLogs ? {
    total: auditLogs.length,
    discrepancies: auditLogs.filter(l => !l.matched).length,
    matches: auditLogs.filter(l => l.matched).length,
    matchRate: auditLogs.length > 0 
      ? ((auditLogs.filter(l => l.matched).length / auditLogs.length) * 100).toFixed(1)
      : '0',
  } : { total: 0, discrepancies: 0, matches: 0, matchRate: '0' };

  // Don't render if feature flag is off
  if (!featureFlag?.is_enabled && (featureFlag?.rollout_percentage ?? 0) === 0) {
    return null;
  }

  const formatAction = (action: Json): string => {
    if (!action) return 'Geen actie';
    if (typeof action === 'string') return action;
    if (typeof action === 'object') {
      const obj = action as Record<string, unknown>;
      if (obj.action) return String(obj.action);
      if (obj.email_type) return `Email: ${obj.email_type}`;
      if (obj.stage) return `Stage: ${obj.stage}`;
      return JSON.stringify(action).slice(0, 50) + '...';
    }
    return String(action);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-primary" />
              Migration Audit Log
            </CardTitle>
            <CardDescription>
              Vergelijking tussen legacy en multi-agent systeem tijdens rollout
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Totaal</div>
          </div>
          <div className="p-4 bg-green-500/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">{stats.matches}</div>
            <div className="text-xs text-muted-foreground">Matches</div>
          </div>
          <div className="p-4 bg-red-500/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-600">{stats.discrepancies}</div>
            <div className="text-xs text-muted-foreground">Discrepancies</div>
          </div>
          <div className="p-4 bg-primary/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-primary">{stats.matchRate}%</div>
            <div className="text-xs text-muted-foreground">Match Rate</div>
          </div>
        </div>

        <Separator />

        {/* Audit Log List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : auditLogs && auditLogs.length > 0 ? (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {auditLogs.map((entry) => (
                <div 
                  key={entry.id} 
                  className={`p-4 rounded-lg border ${
                    !entry.matched 
                      ? 'bg-red-500/5 border-red-500/30' 
                      : 'bg-green-500/5 border-green-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {!entry.matched ? (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      <span className="font-mono text-xs text-muted-foreground">
                        {entry.application_id ? `${entry.application_id.slice(0, 8)}...` : 'N/A'}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {entry.trigger_source}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {!entry.matched ? (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                          Discrepancy
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                          Match
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {format(new Date(entry.created_at), "HH:mm:ss", { locale: nl })}
                      </span>
                    </div>
                  </div>

                  {/* Side-by-side comparison */}
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="p-2 bg-muted/50 rounded text-xs">
                      <div className="text-muted-foreground mb-1">Legacy System</div>
                      <code className="text-xs font-mono">
                        {formatAction(entry.old_system_action)}
                      </code>
                    </div>
                    <div className="p-2 bg-primary/5 rounded text-xs">
                      <div className="text-muted-foreground mb-1">Multi-Agent System</div>
                      <code className="text-xs font-mono">
                        {formatAction(entry.new_system_action)}
                      </code>
                    </div>
                  </div>
                  
                  {/* Discrepancy notes */}
                  {entry.discrepancy_notes && (
                    <div className="mt-2 p-2 bg-yellow-500/10 rounded text-xs text-yellow-400">
                      {entry.discrepancy_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <GitCompare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nog geen migration audit entries</p>
            <p className="text-xs mt-1">Entries verschijnen zodra applicaties worden verwerkt tijdens rollout</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}