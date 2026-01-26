import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PENDING_MINUTES_COUNT_KEY = ['pending-minutes-count'] as const;

export function usePendingMinutesCount() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PENDING_MINUTES_COUNT_KEY,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('meeting_minutes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_approval');

      if (error) {
        console.error('Failed to fetch pending minutes count:', error);
        throw error;
      }
      return count || 0;
    },
    staleTime: 1000 * 30, // 30 sec cache
    refetchInterval: 1000 * 60, // Refetch every minute
  });

  // Realtime subscription for instant updates
  useEffect(() => {
    const channel = supabase
      .channel('pending-minutes-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_minutes',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: PENDING_MINUTES_COUNT_KEY });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    pendingCount: query.data || 0,
    isLoading: query.isLoading,
  };
}
