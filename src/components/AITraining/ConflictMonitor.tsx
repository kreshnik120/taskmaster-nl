import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, XCircle, Eye, EyeOff, Lightbulb, Edit, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { ConflictDiffView } from "./ConflictDiffView";
import { ConflictEditDialog } from "./ConflictEditDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { deepMerge, detectDuplicateFields, cleanupDuplicateFields } from "@/lib/deepMerge";

export const ConflictMonitor = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [editingConflict, setEditingConflict] = useState<any | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, Record<string, any>>>({});

  const { data: conflicts, isLoading, refetch } = useQuery({
    queryKey: ['data-conflicts', showResolved],
    queryFn: async () => {
      let query = supabase
        .from('data_conflicts' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      // Filter on pending status unless showResolved is true
      if (!showResolved) {
        query = query.eq('resolution_status', 'pending');
      }

      const { data, error } = await query;

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

  const handleFieldEdit = (conflictId: string, fieldName: string, newValue: any) => {
    setEditedFields(prev => ({
      ...prev,
      [conflictId]: {
        ...(prev[conflictId] || {}),
        [fieldName]: newValue
      }
    }));
  };

  const handleSaveEdits = async (conflictId: string) => {
    const conflict = conflicts?.find(c => c.id === conflictId);
    if (!conflict) return;

    const edits = editedFields[conflictId];
    if (!edits || Object.keys(edits).length === 0) {
      toast.error("Geen wijzigingen om op te slaan");
      return;
    }

    // Deep merge de edits met de bestaande waarde
    // Wrap edits in { value: {...} } structuur als conflicting_suggestion een value property heeft
    let mergedValue;
    if (conflict.conflicting_suggestion?.value && typeof conflict.conflicting_suggestion.value === 'object') {
      // Edits zijn voor nested fields binnen 'value'
      mergedValue = deepMerge(conflict.conflicting_suggestion, {
        value: edits
      });
    } else {
      // Direct merge op top-level
      mergedValue = deepMerge(conflict.conflicting_suggestion, edits);
    }

    // Detecteer en verwijder duplicate velden
    const duplicates = detectDuplicateFields(mergedValue);
    if (duplicates.length > 0) {
      console.warn('[ConflictMonitor] Duplicate fields detected:', duplicates);
      mergedValue = cleanupDuplicateFields(mergedValue);
      toast.warning(`Duplicate velden gedetecteerd en opgeschoond: ${duplicates.join(', ')}`);
    }

    try {
      const { data, error } = await supabase.functions.invoke('update-knowledge-from-conflict', {
        body: {
          conflict_id: conflictId,
          edited_value: mergedValue,
          resolution_action: 'edited'
        }
      });

      if (error) throw error;

      toast.success("Wijzigingen opgeslagen en conflict opgelost");
      setEditedFields(prev => {
        const newEdits = { ...prev };
        delete newEdits[conflictId];
        return newEdits;
      });
      refetch();
    } catch (error: any) {
      console.error('Error saving edits:', error);
      toast.error(error.message || "Fout bij opslaan wijzigingen");
    }
  };

  const handleResolve = async (conflictId: string, action: string) => {
    try {
      const resolutionStatus = action === 'ignore' ? 'ignored' : 'resolved';
      
      const { error } = await supabase
        .from('data_conflicts' as any)
        .update({
          resolution_status: resolutionStatus,
          resolution_action: action,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', conflictId);

      if (error) {
        console.error('Error resolving conflict:', error);
        throw error;
      }
      
      toast.success('Conflict opgelost');
      refetch();
    } catch (error) {
      console.error('Kon conflict niet oplossen', error);
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
      case 'resolved': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'ignored': return <XCircle className="h-4 w-4 text-gray-400" />;
      case 'pending': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'merged': return <CheckCircle className="h-4 w-4 text-purple-500" />;
      default: return <XCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getAIRecommendation = (conflict: any) => {
    const metadata = conflict.metadata || {};
    const reason = metadata.reason || '';
    const conflictType = conflict.conflict_type || '';
    
    // Bepaal aanbeveling op basis van conflict type en metadata
    if (reason.includes('KVK API') || metadata.suggested_source_type === 'kvk_api') {
      return {
        action: 'accept_new',
        label: 'Accepteer Nieuwe Waarde',
        reason: 'KVK API data is betrouwbaar en actueel',
        confidence: 95
      };
    }
    
    if (conflictType === 'data_freshness' && metadata.existing_stability_score < 0.5) {
      return {
        action: 'accept_new',
        label: 'Accepteer Nieuwe Waarde',
        reason: 'Bestaande data heeft lage stabiliteit',
        confidence: 80
      };
    }
    
    if (conflictType === 'source_hierarchy' && metadata.existing_stability_score > 0.8) {
      return {
        action: 'keep_existing',
        label: 'Behoud Oude Waarde',
        reason: 'Bestaande data is zeer stabiel',
        confidence: 85
      };
    }
    
    if (reason.includes('placeholder') || reason.includes('incomplete')) {
      return {
        action: 'accept_new',
        label: 'Accepteer Nieuwe Waarde',
        reason: 'Vervangt incomplete/placeholder data',
        confidence: 90
      };
    }
    
    // Default: voorzichtig zijn
    return {
      action: 'keep_existing',
      label: 'Behoud Oude Waarde',
      reason: 'Bij twijfel: behoud bestaande data',
      confidence: 60
    };
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gedetecteerde Conflicten</CardTitle>
              <CardDescription>
                {showResolved 
                  ? "Alle conflicten (inclusief opgeloste)" 
                  : "AI heeft geprobeerd data te wijzigen maar dit werd geblokkeerd door intelligent conflict detection"}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResolved(!showResolved)}
              className="gap-2"
            >
              {showResolved ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Verberg opgeloste
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Toon opgeloste
                </>
              )}
            </Button>
          </div>
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
                      <div className="space-y-4 border-t pt-3">
                        {/* AI Aanbeveling */}
                        {conflict.resolution_status === 'pending' && (() => {
                          const recommendation = getAIRecommendation(conflict);
                          return (
                            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                              <div className="flex items-start gap-3">
                                <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                <div className="space-y-1 flex-1">
                                  <div className="font-medium text-sm text-foreground">
                                    🤖 AI Aanbeveling: {recommendation.label}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {recommendation.reason}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                    <Badge variant="secondary" className="text-xs">
                                      Vertrouwen: {recommendation.confidence}%
                                    </Badge>
                                    {recommendation.confidence >= 85 && (
                                      <CheckCircle className="h-3 w-3 text-green-600" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Diff View */}
                        <ConflictDiffView
                          existingValue={conflict.metadata?.existing_value}
                          suggestedValue={conflict.metadata?.suggested_value}
                          existingMetadata={{
                            source_type: conflict.metadata?.existing_source_type,
                            stability_score: conflict.metadata?.existing_stability_score
                          }}
                          reason={conflict.metadata?.reason}
                          onFieldEdit={(fieldName, newValue) => handleFieldEdit(conflict.id, fieldName, newValue)}
                          editedFields={editedFields[conflict.id] || {}}
                        />

                        {/* Action Buttons */}
                        {conflict.resolution_status === 'pending' && (
                          <div className="flex gap-2 pt-2 flex-wrap">
                            {editedFields[conflict.id] && Object.keys(editedFields[conflict.id]).length > 0 ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleSaveEdits(conflict.id)}
                                  className="flex-1 min-w-[220px]"
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  Opslaan Wijzigingen ({Object.keys(editedFields[conflict.id]).length})
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditedFields(prev => {
                                      const newEdits = { ...prev };
                                      delete newEdits[conflict.id];
                                      return newEdits;
                                    });
                                    toast.info("Wijzigingen verwijderd");
                                  }}
                                >
                                  <X className="h-4 w-4 mr-2" />
                                  Verwijder Wijzigingen
                                </Button>
                              </>
                            ) : (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      onClick={() => setEditingConflict(conflict)}
                                      className="flex-1 min-w-[200px]"
                                    >
                                      <Edit className="h-4 w-4 mr-2" />
                                      Bewerk JSON
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                      Bewerk de volledige JSON structuur handmatig
                                    </p>
                                  </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => handleResolve(conflict.id, 'accept_new')}
                                      className="flex-1 min-w-[200px]"
                                    >
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Vervang met Nieuwe Waarde
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                      Vervang de oude waarde volledig met de nieuwe voorgestelde waarde
                                    </p>
                                  </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleResolve(conflict.id, 'keep_existing')}
                                      className="flex-1 min-w-[180px]"
                                    >
                                      <XCircle className="h-4 w-4 mr-2" />
                                      Behoud Oude Waarde
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                      Behoud de huidige waarde in de kennisbank en verwerp de voorgestelde wijziging
                                    </p>
                                  </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleResolve(conflict.id, 'ignore')}
                                    >
                                      <EyeOff className="h-4 w-4 mr-2" />
                                      Negeer
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                      Markeer dit conflict als genegeerd zonder actie te ondernemen
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
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

      {/* Edit Dialog */}
      <ConflictEditDialog
        conflict={editingConflict}
        open={!!editingConflict}
        onOpenChange={(open) => !open && setEditingConflict(null)}
        onSuccess={() => {
          setEditingConflict(null);
          refetch();
        }}
      />
    </div>
  );
};