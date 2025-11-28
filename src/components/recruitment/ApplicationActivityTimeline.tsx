import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock, CheckCircle2, FileEdit, Calendar, User, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface TimelineEvent {
  id: string;
  type: 'stage_change' | 'task_created' | 'profile_updated';
  timestamp: string;
  description: string;
  metadata?: {
    old_stage?: string;
    new_stage?: string;
    user_id?: string;
    user_name?: string;
    duration_in_stage?: string;
    recruitment_action_type?: string;
  };
}

interface ApplicationActivityTimelineProps {
  applicationId: string;
}

const getStageLabel = (stage: string) => {
  const labels: Record<string, string> = {
    'nieuw': 'Nieuw',
    'screening': 'Screening',
    'interview': 'Interview',
    'goedgekeurd': 'Goedgekeurd',
    'geplaatst': 'Geplaatst'
  };
  return labels[stage] || stage;
};

const getStageColor = (stage: string) => {
  const colors: Record<string, string> = {
    'nieuw': 'bg-blue-100 text-blue-700',
    'screening': 'bg-yellow-100 text-yellow-700',
    'interview': 'bg-purple-100 text-purple-700',
    'goedgekeurd': 'bg-green-100 text-green-700',
    'geplaatst': 'bg-emerald-100 text-emerald-700'
  };
  return colors[stage] || 'bg-muted text-muted-foreground';
};

const calculateDuration = (currentTimestamp: string, previousTimestamp: string) => {
  const diff = new Date(currentTimestamp).getTime() - new Date(previousTimestamp).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return hours > 0 ? `${days} dag${days > 1 ? 'en' : ''}, ${hours} uur` : `${days} dag${days > 1 ? 'en' : ''}`;
  }
  return hours > 0 ? `${hours} uur` : 'Minder dan 1 uur';
};

export function ApplicationActivityTimeline({ applicationId }: ApplicationActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivityTimeline();
  }, [applicationId]);

  const loadActivityTimeline = async () => {
    try {
      // Load system events related to this application
      const { data: systemEvents } = await supabase
        .from('system_events')
        .select('*')
        .eq('event_type', 'application_stage_changed')
        .order('created_at', { ascending: false })
        .limit(20);

      // Filter events for this application
      const appEvents = systemEvents?.filter(event => {
        const metadata = event.event_data as any;
        return metadata?.application_id === applicationId;
      }) || [];

      // Get unique user IDs from events
      const userIds = [...new Set(appEvents.map(e => e.user_id).filter(Boolean))];
      
      // Fetch user profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Load linked tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, created_at, recruitment_action_type')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false });

      // Combine events with enriched metadata
      const timeline: TimelineEvent[] = appEvents.map((event, index) => {
        const eventData = event.event_data as any;
        const profile = profileMap.get(event.user_id);
        
        // Calculate duration in previous stage
        let duration: string | undefined;
        if (index < appEvents.length - 1) {
          const previousEvent = appEvents[index + 1];
          duration = calculateDuration(event.created_at, previousEvent.created_at);
        }

        return {
          id: event.id,
          type: 'stage_change' as const,
          timestamp: event.created_at,
          description: `Stage veranderd`,
          metadata: {
            old_stage: eventData?.old_stage,
            new_stage: eventData?.new_stage,
            user_id: event.user_id,
            user_name: profile?.name || profile?.email,
            duration_in_stage: duration
          }
        };
      });

      // Add task events
      const taskEvents: TimelineEvent[] = tasks?.map(task => ({
        id: task.id,
        type: 'task_created' as const,
        timestamp: task.created_at,
        description: `Actie aangemaakt: ${task.title}`,
        metadata: { recruitment_action_type: task.recruitment_action_type }
      })) || [];

      // Combine and sort by timestamp descending
      const allEvents = [...timeline, ...taskEvents];
      allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setEvents(allEvents);
    } catch (error) {
      console.error('Error loading activity timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'stage_change':
        return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case 'task_created':
        return <Calendar className="h-4 w-4 text-purple-600" />;
      case 'profile_updated':
        return <FileEdit className="h-4 w-4 text-blue-600" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'stage_change':
        return 'bg-primary/10 text-primary';
      case 'task_created':
        return 'bg-purple-500/10 text-purple-700';
      case 'profile_updated':
        return 'bg-blue-500/10 text-blue-700';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Activiteiten laden...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <Clock className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Nog geen activiteiten</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event, index) => (
        <div key={event.id}>
          <div className="flex gap-3">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${getEventColor(event.type)}`}>
              {getEventIcon(event.type)}
            </div>
            
            <div className="flex-1 space-y-2">
              {event.type === 'stage_change' && event.metadata?.old_stage && event.metadata?.new_stage ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={getStageColor(event.metadata.old_stage)}>
                      {getStageLabel(event.metadata.old_stage)}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge className={getStageColor(event.metadata.new_stage)}>
                      {getStageLabel(event.metadata.new_stage)}
                    </Badge>
                  </div>
                  
                  {event.metadata.duration_in_stage && (
                    <Badge variant="outline" className="text-xs">
                      {event.metadata.duration_in_stage} in {getStageLabel(event.metadata.old_stage)}
                    </Badge>
                  )}
                </>
              ) : (
                <p className="text-sm font-medium">{event.description}</p>
              )}
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <User className="h-3 w-3" />
                <span>Door: {event.metadata?.user_name || 'Systeem'}</span>
                <span>•</span>
                <Clock className="h-3 w-3" />
                <span>{format(new Date(event.timestamp), "d MMM 'om' HH:mm", { locale: nl })}</span>
              </div>
            </div>
          </div>
          
          {index < events.length - 1 && (
            <Separator className="my-3 ml-4" />
          )}
        </div>
      ))}
    </div>
  );
}
