import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays, format, eachDayOfInterval } from 'date-fns';

interface DailyMetrics {
  date: string;
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

      // Generate all dates in range
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      
      // Process data by date
      const dailyMetrics: DailyMetrics[] = dateRange.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayEvents = events?.filter(e => 
          format(new Date(e.created_at), 'yyyy-MM-dd') === dateStr
        ) || [];

        const totalEvents = dayEvents.length;
        const successfulEvents = dayEvents.filter(e => 
          e.outcome === 'approved' || e.outcome === 'applied'
        ).length;
        const autoResolved = dayEvents.filter(e => {
          if (e.event_type !== 'conflict_resolution') return false;
          const context = e.context as Record<string, any> | null;
          return context?.auto_resolved === true;
        }).length;

        // Calculate confidence for items created/updated on this day
        const dayConfidenceItems = confidenceData?.filter(c => {
          const itemDate = format(new Date(c.updated_at || c.created_at), 'yyyy-MM-dd');
          return itemDate === dateStr;
        }) || [];
        
        const avgConfidence = dayConfidenceItems.length > 0
          ? dayConfidenceItems.reduce((sum, item) => sum + Number(item.confidence_score), 0) / dayConfidenceItems.length
          : 0;

        return {
          date: dateStr,
          accuracy: totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0,
          autoResolveRate: totalEvents > 0 ? (autoResolved / totalEvents) * 100 : 0,
          avgConfidence: avgConfidence,
          totalEvents,
          eventsByType: {
            feedback: dayEvents.filter(e => e.event_type === 'feedback').length,
            conflict_resolution: dayEvents.filter(e => e.event_type === 'conflict_resolution').length,
            auto_resolved: autoResolved,
          }
        };
      });

      return dailyMetrics;
    },
  });
};
