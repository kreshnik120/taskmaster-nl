import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle, X, TrendingUp, Loader2, AlertCircle, Info, Database } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';
type AlertStatus = 'active' | 'resolved' | 'dismissed';

interface Alert {
  id: string;
  title: string;
  description: string;
  type: string;
  severity: SeverityLevel;
  status: AlertStatus;
  detected_at: string;
  impact_score: number;
  data: any;
}

const severityColors: Record<SeverityLevel, string> = {
  critical: "text-red-500 bg-red-50 dark:bg-red-950",
  high: "text-orange-500 bg-orange-50 dark:bg-orange-950",
  medium: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950",
  low: "text-blue-500 bg-blue-50 dark:bg-blue-950"
};

const severityIcons: Record<SeverityLevel, any> = {
  critical: AlertTriangle,
  high: AlertCircle,
  medium: AlertTriangle,
  low: Info
};

export function AlertTriageSystem() {
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityLevel | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<AlertStatus | 'all'>('active');
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Separate query for stats (unfiltered)
  const { data: statsData } = useQuery({
    queryKey: ['alert-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_intelligence')
        .select('severity, status')
        .eq('status', 'active');
      
      if (error) throw error;
      
      return {
        critical: data?.filter(a => a.severity === 'critical').length || 0,
        high: data?.filter(a => a.severity === 'high').length || 0,
        medium: data?.filter(a => a.severity === 'medium').length || 0,
        low: data?.filter(a => a.severity === 'low').length || 0,
      };
    }
  });

  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['alert-triage', selectedSeverity, selectedStatus],
    queryFn: async () => {
      let query = supabase
        .from('business_intelligence')
        .select('*')
        .order('detected_at', { ascending: false });

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      if (selectedSeverity !== 'all') {
        query = query.eq('severity', selectedSeverity);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Alert[];
    }
  });

  const updateAlertsMutation = useMutation({
    mutationFn: async ({ alertIds, updates }: { alertIds: string[], updates: Partial<Alert> }) => {
      const { error } = await supabase
        .from('business_intelligence')
        .update({
          ...updates,
          last_updated_at: new Date().toISOString()
        })
        .in('id', alertIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-triage'] });
      setSelectedAlerts(new Set());
      toast.success('Alerts bijgewerkt');
    },
    onError: () => {
      toast.error('Fout bij bijwerken alerts');
    }
  });

  const handleResolve = (alertIds: string[]) => {
    updateAlertsMutation.mutate({
      alertIds,
      updates: { status: 'resolved' }
    });
  };

  const handleDismiss = (alertIds: string[]) => {
    updateAlertsMutation.mutate({
      alertIds,
      updates: { status: 'dismissed' }
    });
  };

  const handleEscalateSeverity = (alertIds: string[], newSeverity: SeverityLevel) => {
    updateAlertsMutation.mutate({
      alertIds,
      updates: { severity: newSeverity }
    });
  };

  const [bulkResolving, setBulkResolving] = useState(false);

  const handleBulkResolveDataQuality = async () => {
    if (selectedAlerts.size === 0) {
      toast.error("Geen alerts geselecteerd");
      return;
    }
    
    const dataQualityAlerts = alerts?.filter(a => 
      selectedAlerts.has(a.id) && (a.type === 'data_quality' || a.data?.conflicting_items)
    ) || [];
    
    if (dataQualityAlerts.length === 0) {
      toast.error("Geen data quality alerts geselecteerd");
      return;
    }
    
    setBulkResolving(true);
    const BATCH_SIZE = 50;
    let resolved = 0;
    
    try {
      const alertIds = dataQualityAlerts.map(a => a.id);
      
      for (let i = 0; i < alertIds.length; i += BATCH_SIZE) {
        const batch = alertIds.slice(i, i + BATCH_SIZE);
        
        const { error } = await supabase
          .from('business_intelligence')
          .update({ status: 'resolved' })
          .in('id', batch);
        
        if (error) throw error;
        
        resolved += batch.length;
        if (alertIds.length > BATCH_SIZE) {
          toast.info(`Resolved ${resolved}/${alertIds.length} alerts...`);
        }
      }
      
      toast.success(`✅ ${resolved} alerts resolved`);
      setSelectedAlerts(new Set());
      refetch();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setBulkResolving(false);
    }
  };

  const toggleSelectAlert = (alertId: string) => {
    const newSelected = new Set(selectedAlerts);
    if (newSelected.has(alertId)) {
      newSelected.delete(alertId);
    } else {
      newSelected.add(alertId);
    }
    setSelectedAlerts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedAlerts.size === alerts?.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(alerts?.map(a => a.id) || []));
    }
  };

  const stats = {
    total: alerts?.length || 0,
    critical: statsData?.critical || 0,
    high: statsData?.high || 0,
    medium: statsData?.medium || 0,
    low: statsData?.low || 0,
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Totaal Actief</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className={severityColors.critical}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card className={severityColors.high}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">High</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.high}</div>
          </CardContent>
        </Card>
        <Card className={severityColors.medium}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Medium</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.medium}</div>
          </CardContent>
        </Card>
        <Card className={severityColors.low}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Low</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.low}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Bulk Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Triage Dashboard</CardTitle>
          <CardDescription>Beheer en prioriteer system alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Severity</label>
              <Select value={selectedSeverity} onValueChange={(v) => setSelectedSeverity(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter op severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter op status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedAlerts.size > 0 && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{selectedAlerts.size} geselecteerd</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleResolve(Array.from(selectedAlerts))}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDismiss(Array.from(selectedAlerts))}
                >
                  <X className="h-4 w-4 mr-2" />
                  Dismiss
                </Button>
                <Select onValueChange={(v) => handleEscalateSeverity(Array.from(selectedAlerts), v as SeverityLevel)}>
                  <SelectTrigger className="w-[180px]">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Wijzig severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleBulkResolveDataQuality}
                  className="ml-auto"
                >
                  <Database className="h-4 w-4 mr-2" />
                  Resolve Data Quality
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Alerts ({alerts?.length || 0})</CardTitle>
            {alerts && alerts.length > 0 && (
              <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                {selectedAlerts.size === alerts.length ? 'Deselecteer alles' : 'Selecteer alles'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            {!alerts || alerts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Geen alerts gevonden voor de geselecteerde filters
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const SeverityIcon = severityIcons[alert.severity];
                  return (
                    <Card key={alert.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedAlerts.has(alert.id)}
                            onCheckedChange={() => toggleSelectAlert(alert.id)}
                          />
                          <div className="flex-1 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <SeverityIcon className={`h-5 w-5 ${severityColors[alert.severity].split(' ')[0]}`} />
                                <h4 className="font-semibold">{alert.title}</h4>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={severityColors[alert.severity]}>
                                  {alert.severity.toUpperCase()}
                                </Badge>
                                <Badge variant="outline">{alert.type}</Badge>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">{alert.description}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Impact: {alert.impact_score?.toFixed(2) || 'N/A'}</span>
                              <span>•</span>
                              <span>{new Date(alert.detected_at).toLocaleString('nl-NL')}</span>
                            </div>
                            <div className="flex gap-2 pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleResolve([alert.id])}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDismiss([alert.id])}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Dismiss
                              </Button>
                              <Select onValueChange={(v) => handleEscalateSeverity([alert.id], v as SeverityLevel)}>
                                <SelectTrigger className="w-[140px] h-8">
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                  <SelectValue placeholder="Severity" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="critical">Critical</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
