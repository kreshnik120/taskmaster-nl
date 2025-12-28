import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const log = logger.create('useFeedbackStats');

interface FeedbackStats {
  weeklyCount: number;
  monthlyCount: number;
  streak: number;
  lastFeedbackDate: string | null;
  isLoading: boolean;
}

export const useFeedbackStats = () => {
  const [stats, setStats] = useState<FeedbackStats>({
    weeklyCount: 0,
    monthlyCount: 0,
    streak: 0,
    lastFeedbackDate: null,
    isLoading: true,
  });

  const fetchStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStats(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Get feedback from the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: feedbackData, error } = await supabase
        .from('message_feedback')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        log.error('Error fetching feedback stats:', error);
        setStats(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Calculate weekly count
      const weeklyCount = feedbackData?.filter(f => 
        new Date(f.created_at) >= sevenDaysAgo
      ).length || 0;

      // Calculate monthly count
      const monthlyCount = feedbackData?.length || 0;

      // Calculate streak (consecutive days with feedback)
      let streak = 0;
      if (feedbackData && feedbackData.length > 0) {
        const uniqueDays = new Set(
          feedbackData.map(f => new Date(f.created_at).toDateString())
        );
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Check if user gave feedback today or yesterday to start streak
        const todayStr = today.toDateString();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();
        
        if (uniqueDays.has(todayStr) || uniqueDays.has(yesterdayStr)) {
          // Count consecutive days backwards
          let checkDate = uniqueDays.has(todayStr) ? today : yesterday;
          
          while (uniqueDays.has(checkDate.toDateString())) {
            streak++;
            checkDate = new Date(checkDate);
            checkDate.setDate(checkDate.getDate() - 1);
          }
        }
      }

      const lastFeedbackDate = feedbackData?.[0]?.created_at || null;

      setStats({
        weeklyCount,
        monthlyCount,
        streak,
        lastFeedbackDate,
        isLoading: false,
      });

      log.log('Feedback stats loaded:', { weeklyCount, monthlyCount, streak });
    } catch (error) {
      log.error('Error in fetchStats:', error);
      setStats(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const refresh = useCallback(() => {
    setStats(prev => ({ ...prev, isLoading: true }));
    fetchStats();
  }, [fetchStats]);

  return { ...stats, refresh };
};
