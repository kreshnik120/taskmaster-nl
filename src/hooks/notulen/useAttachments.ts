import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface MeetingAttachment {
  id: string;
  meeting_minute_id: string;
  org_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
}

export const MEETING_ATTACHMENTS_QUERY_KEY = ['meeting-attachments'] as const;

async function fetchAttachments(meetingMinuteId: string): Promise<MeetingAttachment[]> {
  const { data, error } = await supabase
    .from("meeting_minute_attachments")
    .select(`
      *,
      profiles:uploaded_by(name)
    `)
    .eq('meeting_minute_id', meetingMinuteId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch meeting attachments", { error });
    throw error;
  }

  return (data || []).map((item) => ({
    id: item.id,
    meeting_minute_id: item.meeting_minute_id,
    org_id: item.org_id,
    file_name: item.file_name,
    file_path: item.file_path,
    file_size: item.file_size,
    file_type: item.file_type,
    uploaded_by: item.uploaded_by,
    uploaded_by_name: (item.profiles as { name: string | null } | null)?.name || 'Onbekend',
    created_at: item.created_at,
  }));
}

export function useAttachments(meetingMinuteId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...MEETING_ATTACHMENTS_QUERY_KEY, meetingMinuteId],
    queryFn: () => fetchAttachments(meetingMinuteId!),
    enabled: !!meetingMinuteId,
    staleTime: 1000 * 60, // 1 minute
  });

  // Realtime subscription for updates
  useEffect(() => {
    if (!meetingMinuteId) return;

    const channel = supabase
      .channel(`meeting-attachments-${meetingMinuteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_minute_attachments',
          filter: `meeting_minute_id=eq.${meetingMinuteId}`,
        },
        () => {
          queryClient.invalidateQueries({ 
            queryKey: [...MEETING_ATTACHMENTS_QUERY_KEY, meetingMinuteId] 
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingMinuteId, queryClient]);

  return {
    attachments: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
