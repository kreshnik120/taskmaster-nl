import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brain, CheckCircle2, Clock, Sparkles, TrendingUp, Play } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";

export const SystemLearningDashboard = () => {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch recent system events
  const { data: recentEvents, isLoading } = useQuery({
    queryKey: ['system-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchIntervalInBackground: false,
  });

  // Calculate stats
  const processedEvents = recentEvents?.filter(e => e.processed_at) || [];
  const pendingEvents = recentEvents?.filter(e => !e.processed_at) || [];
  const knowledgeCreatedCount = processedEvents.filter(e => {
    const outcome = e.learning_outcome as any;
    return outcome?.shouldCreateKnowledge === true;
  }).length;

  // Group events by type
  const eventsByType = recentEvents?.reduce((acc, event) => {
    const type = event.event_type;
    if (!acc[type]) acc[type] = 0;
    acc[type]++;
    return acc;
  }, {} as Record<string, number>) || {};

  const getEventTypeIcon = (eventType: string) => {
    if (eventType === 'task_completed') return '✅';
    if (eventType === 'task_created') return '📝';
    if (eventType === 'time_entry_created') return '⏱️';
    return '📊';
  };

  const getEventTypeBadgeVariant = (eventType: string) => {
    if (eventType === 'task_completed') return 'default';
    if (eventType === 'task_created') return 'secondary';
    return 'outline';
  };

  const handleProcessEvents = async () => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-system-events', {
        body: {}
      });

      if (error) throw error;

      toast.success(
        `✅ Events verwerkt: ${data.processed}/${data.total}`, 
        {
          description: data.knowledgeCreated 
            ? `${data.knowledgeCreated} kennis items aangemaakt`
            : 'Geen nieuwe kennis aangemaakt'
        }
      );

      // Refresh the events list
      queryClient.invalidateQueries({ queryKey: ['system-events'] });
    } catch (error) {
      console.error('Error processing events:', error);
      toast.error('❌ Fout bij verwerken events', {
        description: error instanceof Error ? error.message : 'Onbekende fout'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{recentEvents?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Totaal Events</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{processedEvents.length}</p>
                <p className="text-xs text-muted-foreground">Verwerkt</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingEvents.length}</p>
                <p className="text-xs text-muted-foreground">In Wachtrij</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Sparkles className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{knowledgeCreatedCount}</p>
                <p className="text-xs text-muted-foreground">Kennis Geleerd</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Event Types Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Event Types
          </CardTitle>
          <CardDescription>
            Distributie van systeem gebeurtenissen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(eventsByType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="text-lg">{getEventTypeIcon(type)}</span>
                <Badge variant={getEventTypeBadgeVariant(type as any)}>
                  {type}: {count}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Events Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Recente Systeem Learning Events
              </CardTitle>
              <CardDescription>
                AI leert automatisch van acties in het systeem
              </CardDescription>
            </div>
            <Button
              onClick={handleProcessEvents}
              disabled={isProcessing || pendingEvents.length === 0}
              size="sm"
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              {isProcessing ? 'Verwerken...' : 'Process Nu'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : !recentEvents || recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nog geen events gevonden. Het systeem zal automatisch leren van toekomstige acties.
            </p>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {recentEvents.map((event) => (
                  <div key={event.id} className="border-l-2 border-primary pl-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{getEventTypeIcon(event.event_type)}</span>
                          <Badge variant={getEventTypeBadgeVariant(event.event_type)}>
                            {event.event_type}
                          </Badge>
                          {event.processed_at ? (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Verwerkt
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="h-3 w-3 mr-1" />
                              In wachtrij
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-2">
                          {format(new Date(event.created_at), "PPpp", { locale: nl })}
                        </p>

                        {/* Event Data Summary */}
                        {event.event_data && (
                          <div className="text-sm mb-2">
                            {(event.event_data as any).title && (
                              <p><strong>Taak:</strong> {(event.event_data as any).title}</p>
                            )}
                            {(event.metadata as any)?.on_time !== undefined && (
                              <p>
                                <strong>Status:</strong>{' '}
                                {(event.metadata as any).on_time ? (
                                  <span className="text-green-600">✅ Tijdig afgerond</span>
                                ) : (
                                  <span className="text-orange-600">⚠️ Te laat ({(event.metadata as any).days_late} dagen)</span>
                                )}
                              </p>
                            )}
                            {(event.metadata as any)?.hours_worked && (
                              <p>
                                <strong>Uren besteed:</strong> {((event.metadata as any).hours_worked as number).toFixed(1)}h
                              </p>
                            )}
                          </div>
                        )}

                        {/* Learning Outcome */}
                        {event.learning_outcome && (
                          <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                            {(event.learning_outcome as any).shouldCreateKnowledge ? (
                              <div>
                                <p className="text-sm font-medium text-green-600 mb-1">
                                  ✨ Kennis Aangemaakt
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  <strong>Reden:</strong> {(event.learning_outcome as any).reasoning}
                                </p>
                                {(event.learning_outcome as any).confidence && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    <strong>Zekerheid:</strong> {((event.learning_outcome as any).confidence * 100).toFixed(0)}%
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                ℹ️ Geen kennis aangemaakt: {(event.learning_outcome as any)?.reasoning || 'Niet significant genoeg'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
