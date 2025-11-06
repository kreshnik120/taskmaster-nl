import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, XCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const ConflictMonitor = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: conflicts, isLoading, refetch } = useQuery({
    queryKey: ['data-conflicts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_conflicts' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as any[];
    }
  });

  const { data: stats } = useQuery({
    queryKey: ['conflict-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_conflicts' as any)
        .select('resolution_status, severity');

      return {
        total: data?.length || 0,
        pending: data?.filter((c: any) => c.resolution_status === 'pending').length || 0,
        auto_resolved: data?.filter((c: any) => c.resolution_status === 'auto_resolved').length || 0,
        critical: data?.filter((c: any) => c.severity === 'critical').length || 0,
        high: data?.filter((c: any) => c.severity === 'high').length || 0,
      };
    }
  });

  const handleResolve = async (conflictId: string, action: string) => {
    try {
      const { error } = await supabase
        .from('data_conflicts' as any)
        .update({
          resolution_status: 'manually_resolved',
          resolution_action: action,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', conflictId);

      if (error) throw error;
      toast.success('Conflict opgelost');
      refetch();
    } catch (error) {
      toast.error('Kon conflict niet oplossen');
    }
  };

  if (isLoading) {
    return <div className="text-center p-4">Conflicten laden...</div>;
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'auto_resolved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'manually_resolved': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'pending': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <XCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Totaal Conflicten</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Auto-Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.auto_resolved || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.critical || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">High</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats?.high || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Conflicts List */}
      <Card>
        <CardHeader>
          <CardTitle>Gedetecteerde Conflicten</CardTitle>
          <CardDescription>
            AI heeft geprobeerd data te wijzigen maar dit werd geblokkeerd door intelligent conflict detection
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {conflicts && conflicts.length > 0 ? (
              conflicts.map((conflict: any) => (
                <Card key={conflict.id} className="border-l-4" style={{
                  borderLeftColor: conflict.severity === 'critical' ? '#ef4444' : 
                                  conflict.severity === 'high' ? '#f97316' : '#3b82f6'
                }}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(conflict.resolution_status)}
                        <div>
                          <div className="font-semibold">
                            {conflict.existing_knowledge?.key || 'Unknown'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(conflict.created_at).toLocaleString('nl-NL')}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={getSeverityColor(conflict.severity)}>
                          {conflict.severity}
                        </Badge>
                        <Badge variant={
                          conflict.resolution_status === 'pending' ? 'default' : 'secondary'
                        }>
                          {conflict.resolution_status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-sm font-medium mb-1">Conflict Type:</div>
                      <Badge variant="outline">{conflict.conflict_type}</Badge>
                    </div>

                    {conflict.resolution_action && (
                      <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                        <strong>Actie:</strong> {conflict.resolution_action}
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(expandedId === conflict.id ? null : conflict.id)}
                      className="w-full"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {expandedId === conflict.id ? 'Verberg Details' : 'Toon Details'}
                    </Button>

                    {expandedId === conflict.id && (
                      <div className="space-y-3 border-t pt-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="font-medium text-sm">Bestaande Waarde:</div>
                            <div className="text-xs bg-green-50 dark:bg-green-950 p-2 rounded border border-green-200 dark:border-green-800">
                              <div className="mb-1">
                                <Badge variant="outline" className="mr-2">
                                  {conflict.existing_knowledge?.source_type}
                                </Badge>
                                <span className="text-muted-foreground">
                                  Stability: {(conflict.existing_knowledge?.stability_score * 100).toFixed(0)}%
                                </span>
                              </div>
                              <pre className="whitespace-pre-wrap">
                                {JSON.stringify(conflict.metadata?.existing_value, null, 2)}
                              </pre>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="font-medium text-sm">Voorgestelde Wijziging:</div>
                            <div className="text-xs bg-red-50 dark:bg-red-950 p-2 rounded border border-red-200 dark:border-red-800">
                              <pre className="whitespace-pre-wrap">
                                {JSON.stringify(conflict.metadata?.suggested_value, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>

                        {conflict.resolution_status === 'pending' && (
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleResolve(conflict.id, 'keep_existing')}
                            >
                              Behoud Bestaand
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleResolve(conflict.id, 'accept_new')}
                            >
                              Accepteer Nieuw
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleResolve(conflict.id, 'ignore')}
                            >
                              Negeer
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Geen conflicten gedetecteerd
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};