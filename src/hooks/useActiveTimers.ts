import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ActiveTimerInfo {
  task_id: string;
  user_id: string;
  start: string;
  profiles: { name: string | null } | null;
}

/**
 * Globale hook voor actieve timers - gedeeld over alle pagina's
 * - Single realtime channel: 'global-active-timers'
 * - Voorkomt duplicate queries bij navigatie
 * - Bevat getRunningTime helper voor consistente formatting
 */
export function useActiveTimers() {
  const [activeTimers, setActiveTimers] = useState<Record<string, ActiveTimerInfo>>({});
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const loadActiveTimers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("time_entries")
        .select("task_id, user_id, start, profiles:profiles!time_entries_user_id_fkey(name)")
        .is("end", null);

      if (error) throw error;

      const timersMap: Record<string, ActiveTimerInfo> = {};
      data?.forEach((entry) => {
        timersMap[entry.task_id] = entry as ActiveTimerInfo;
      });
      setActiveTimers(timersMap);
    } catch (error) {
      console.error('[useActiveTimers] Load failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveTimers();

    // Single global realtime channel
    const channel = supabase
      .channel('global-active-timers')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'time_entries',
      }, () => {
        loadActiveTimers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadActiveTimers]);

  // Update currentTime every second when there are active timers
  useEffect(() => {
    if (Object.keys(activeTimers).length === 0) return;

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimers]);

  const getRunningTime = useCallback((start: string): string => {
    const now = currentTime;
    const startTime = new Date(start);
    const totalSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}u ${minutes}m ${seconds}s`;
  }, [currentTime]);

  const hasActiveTimer = useCallback((taskId: string): boolean => {
    return taskId in activeTimers;
  }, [activeTimers]);

  const getTimerForTask = useCallback((taskId: string): ActiveTimerInfo | null => {
    return activeTimers[taskId] || null;
  }, [activeTimers]);

  return {
    activeTimers,
    loading,
    refetch: loadActiveTimers,
    getRunningTime,
    hasActiveTimer,
    getTimerForTask,
    currentTime,
  };
}
