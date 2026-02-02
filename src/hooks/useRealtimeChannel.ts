import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimeConfig {
  /** Unique channel name for this subscription */
  channelName: string;
  /** Database table to subscribe to */
  table: string;
  /** Event type to listen for (default: '*' for all) */
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  /** Optional filter (e.g., 'assignee_id=eq.uuid') */
  filter?: string;
  /** Callback function when event occurs */
  onEvent: () => void;
  /** Debounce delay in ms (default: 200ms) */
  debounceMs?: number;
  /** Whether subscription is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Standardized realtime subscription hook
 * 
 * Features:
 * - Automatic CHANNEL_ERROR handling with logging
 * - Configurable debounce (default 200ms) to prevent cascade updates
 * - Proper cleanup on unmount
 * - Consistent status logging
 * 
 * @example
 * ```tsx
 * useRealtimeChannel({
 *   channelName: 'my-tasks-updates',
 *   table: 'tasks',
 *   filter: `assignee_id=eq.${userId}`,
 *   onEvent: refetch,
 *   debounceMs: 200
 * });
 * ```
 */
export function useRealtimeChannel({
  channelName,
  table,
  event = '*',
  filter,
  onEvent,
  debounceMs = 200,
  enabled = true
}: RealtimeConfig) {
  const log = logger.create(channelName);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Keep callback ref up to date
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      log.log('Channel disabled, skipping subscription');
      return;
    }

    const handleChange = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        log.log('Event received, triggering callback');
        onEventRef.current();
      }, debounceMs);
    };

    const handleStatus = (status: string) => {
      if (status === 'SUBSCRIBED') {
        log.log('Channel subscribed successfully');
      } else if (status === 'CHANNEL_ERROR') {
        log.error('Channel error - realtime updates may be unavailable');
      } else if (status === 'TIMED_OUT') {
        log.warn('Channel subscription timed out');
      }
    };

    // Build subscription - exact pattern from working code
    if (filter) {
      channelRef.current = supabase.channel(channelName).on(
        'postgres_changes' as const,
        { event, schema: 'public', table, filter } as any,
        handleChange
      ).subscribe(handleStatus);
    } else {
      channelRef.current = supabase.channel(channelName).on(
        'postgres_changes' as const,
        { event, schema: 'public', table } as any,
        handleChange
      ).subscribe(handleStatus);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      log.log('Cleaning up channel subscription');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [channelName, table, event, filter, debounceMs, enabled]);
}

export default useRealtimeChannel;
