import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock, CheckCircle2, FileEdit, Calendar, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface TimelineEvent {
  id: string;
  type: 'stage_change' | 'task_created' | 'profile_updated';
  timestamp: string;
  description: string;
  metadata?: any;
}

interface ApplicationActivityTimelineProps {
  applicationId: string;
}

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

      // Load linked tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, created_at, recruitment_action_type')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false });

      // Combine events
      const timeline: TimelineEvent[] = [
        ...appEvents.map(event => ({
          id: event.id,
          type: 'stage_change' as const,
          timestamp: event.created_at,
          description: `Stage veranderd naar ${(event.event_data as any)?.new_stage || 'onbekend'}`,
          metadata: event.event_data
        })),
        ...(tasks?.map(task => ({
          id: task.id,
          type: 'task_created' as const,
          timestamp: task.created_at,
          description: `Actie aangemaakt: ${task.title}`,
          metadata: { recruitment_action_type: task.recruitment_action_type }
        })) || [])
      ];

      // Sort by timestamp descending
      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setEvents(timeline);
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
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${getEventColor(event.type)}`}>
              {getEventIcon(event.type)}
            </div>
            
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">{event.description}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{format(new Date(event.timestamp), "d MMM yyyy 'om' HH:mm", { locale: nl })}</span>
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
