import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

const log = logger.create('useTasksQuery');

// Subtask interface for inline display
interface Subtask {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  order: number;
  due_at: string | null;
  assignee_id: string | null;
  profiles: {
    name: string | null;
  } | null;
}

// Complete Task interface supporting both Dashboard and Opvolging
export interface Task {
  id: string;
  title: string;
  description: string | null; // Required (not optional) for compatibility
  priority: string;
  start_at: string | null;
  due_at: string | null;
  next_action: string | null;
  completed_at: string | null;
  estimate_min: number | null;
  application_id: string | null;
  recruitment_action_type: string | null;
  assignee_id: string | null;
  reporter_id: string | null;
  org_id: string;
  // Dashboard fields
  profiles: { 
    name: string | null; 
    email: string | null; 
  } | null;
  reporter: {
    name: string | null;
    email: string | null;
  } | null;
  subtasks?: Subtask[];
  subtask_count?: number;
  completed_subtask_count?: number;
  // Recurrence fields
  recurrence_rule: string | null;
  recurrence_assignee_id: string | null;
  recurrence_end_at: string | null;
  recurrence_parent_id: string | null;
  // Opvolging fields
  organizations: { name: string } | null;
  task_scoring_metadata?: {
    estimated_value_eur: number | null;
    complexity_score: number | null;
    business_impact_score: number | null;
    market_demand_factor: number | null;
  } | null;
}

// Query key constant for cache sharing
export const ACTIVE_TASKS_QUERY_KEY = ['active-tasks'] as const;

// Debounce timing constant (200ms uniform across all views)
const REALTIME_DEBOUNCE_MS = 200;

// Stale time constant (5 minutes)
const STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Shared TanStack Query hook for active tasks.
 * Used by Dashboard, Opvolging, and other views that need task data.
 * 
 * Features:
 * - Shared cache via ['active-tasks'] queryKey
 * - 5 minute staleTime for performance
 * - Realtime sync with 200ms debounce
 * - Includes all JOINs needed by all consuming views
 */
export function useTasksQuery() {
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Query active tasks with all necessary JOINs
  const query = useQuery({
    queryKey: ACTIVE_TASKS_QUERY_KEY,
    queryFn: async () => {
      log.log('Fetching active tasks from database');

      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *,
          profiles:profiles!tasks_assignee_id_fkey(name, email),
          reporter:profiles!tasks_reporter_id_fkey(name, email),
          organizations(name),
          task_scoring_metadata(
            estimated_value_eur,
            complexity_score,
            business_impact_score,
            market_demand_factor
          ),
          subtasks(
            id,
            title,
            status,
            order,
            due_at,
            assignee_id,
            profiles:profiles!subtasks_assignee_id_fkey(name)
          )
        `)
        .is("completed_at", null)
        .is("deleted_at", null)
        .order("due_at", { ascending: true });

      if (error) {
        log.error('Failed to fetch tasks:', error);
        throw error;
      }

      // Calculate subtask counts (completed + skipped count as done)
      const tasksWithCounts = (data || []).map(task => ({
        ...task,
        subtasks: task.subtasks?.sort((a: Subtask, b: Subtask) => a.order - b.order) || [],
        subtask_count: task.subtasks?.length || 0,
        completed_subtask_count: task.subtasks?.filter(
          (s: Subtask) => s.status === 'completed' || s.status === 'skipped'
        ).length || 0
      }));

      log.log(`Fetched ${tasksWithCounts.length} active tasks`);
      return tasksWithCounts as Task[];
    },
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });

  // Realtime subscription with 200ms debounce
  useEffect(() => {
    const channel = supabase
      .channel('shared-tasks-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        (payload) => {
          log.log('Realtime task change:', payload.eventType);

          // Debounce invalidation to prevent cascade updates
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }

          debounceTimerRef.current = setTimeout(() => {
            log.log('Invalidating active-tasks cache');
            queryClient.invalidateQueries({ queryKey: ACTIVE_TASKS_QUERY_KEY });
          }, REALTIME_DEBOUNCE_MS);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log.log('Realtime channel subscribed');
        }
        if (status === 'CHANNEL_ERROR') {
          log.error('Realtime channel error');
        }
      });

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      log.log('Unsubscribing realtime channel');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export default useTasksQuery;
