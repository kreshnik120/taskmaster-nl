import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays, format, eachDayOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek } from 'date-fns';

interface WeeklyMetrics {
  weekLabel: string;
  startDate: string;
  endDate: string;
  accuracy: number;
  autoResolveRate: number;
  avgConfidence: number;
  totalEvents: number;
  eventsByType: {
    feedback: number;
    conflict_resolution: number;
    auto_resolved: number;
  };
}

export const useLearningProgress = () => {
  return useQuery({
    queryKey: ['learning-progress'],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = subDays(endDate, 30);

      // Fetch learning events grouped by date
      const { data: events, error: eventsError } = await supabase
        .from('ai_learning_events')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: true });

      if (eventsError) throw eventsError;

      // Fetch daily avg confidence scores
      const { data: confidenceData, error: confidenceError } = await supabase
        .from('ai_knowledge_base')
        .select('confidence_score, created_at, updated_at')
        .gte('created_at', startDate.toISOString())
        .is('deleted_at', null);

      if (confidenceError) throw confidenceError;

      // Generate weeks in range
      const weeks = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });
      
      // Process data by week
      const weeklyMetrics: WeeklyMetrics[] = weeks.map((weekStart, index) => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const weekLabel = `Week ${index + 1}`;
        
        // Filter events within this week
        const weekEvents = events?.filter(e => {
          const eventDate = new Date(e.created_at);
          return eventDate >= weekStart && eventDate <= weekEnd;
        }) || [];
        
        const totalEvents = weekEvents.length;
        const successfulEvents = weekEvents.filter(e => 
          e.outcome === 'success' || 
          e.outcome === 'applied' || 
          e.outcome === 'facts_learned' || 
          e.outcome === 'learned'
        ).length;
        
        const autoResolved = weekEvents.filter(e => {
          if (e.event_type !== 'conflict_resolution') return false;
          const context = e.context as Record<string, any> | null;
          return context?.auto_resolved === true;
        }).length;
        
        const conflictEvents = weekEvents.filter(e => 
          e.event_type === 'conflict_resolution'
        ).length;
        
        // Confidence: items created/updated in this week
        const weekConfidenceItems = confidenceData?.filter(c => {
          const itemDate = new Date(c.updated_at || c.created_at);
          return itemDate >= weekStart && itemDate <= weekEnd;
        }) || [];
        
        const avgConfidence = weekConfidenceItems.length > 0
          ? weekConfidenceItems.reduce((sum, item) => sum + Number(item.confidence_score), 0) / weekConfidenceItems.length
          : 0;
        
        const accuracy = totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0;
        const autoResolveRate = conflictEvents > 0 ? (autoResolved / conflictEvents) * 100 : 0;

        return {
          weekLabel,
          startDate: format(weekStart, 'yyyy-MM-dd'),
          endDate: format(weekEnd, 'yyyy-MM-dd'),
          accuracy,
          autoResolveRate,
          avgConfidence,
          totalEvents,
          eventsByType: {
            feedback: weekEvents.filter(e => e.event_type === 'feedback').length,
            conflict_resolution: conflictEvents,
            auto_resolved: autoResolved,
          }
        };
      });

      return weeklyMetrics;
    },
  });
};
