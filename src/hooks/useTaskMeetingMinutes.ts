import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MeetingMinute, AgendaItem, Decision } from "./useMeetingMinutes";

export function useTaskMeetingMinutes(taskId: string | null) {
  const query = useQuery({
    queryKey: ['task-meeting-minutes', taskId],
    queryFn: async () => {
      if (!taskId) return [];

      const { data, error } = await supabase
        .from("meeting_minutes")
        .select(`
          *,
          tasks!inner(id, title, start_at, due_at),
          meeting_attendees(
            id,
            role,
            attended,
            user_id,
            external_name,
            profiles:user_id(name)
          )
        `)
        .eq('task_id', taskId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((item) => ({
        id: item.id,
        task_id: item.task_id,
        org_id: item.org_id,
        meeting_type: item.meeting_type as MeetingMinute['meeting_type'],
        location: item.location,
        meeting_link: item.meeting_link,
        agenda_items: (item.agenda_items as unknown as AgendaItem[]) || [],
        decisions: (item.decisions as unknown as Decision[]) || [],
        content: item.content,
        status: item.status as MeetingMinute['status'],
        approved_by: item.approved_by,
        approved_at: item.approved_at,
        next_meeting_date: item.next_meeting_date,
        created_at: item.created_at,
        updated_at: item.updated_at,
        tasks: item.tasks,
        meeting_attendees: (item.meeting_attendees || []).map((att: {
          id: string;
          role: string | null;
          attended: boolean | null;
          user_id: string | null;
          external_name: string | null;
          profiles: { name: string | null } | null;
        }) => ({
          id: att.id,
          role: att.role,
          attended: att.attended,
          user_id: att.user_id,
          external_name: att.external_name,
          profiles: att.profiles,
        })),
      })) as MeetingMinute[];
    },
    enabled: !!taskId,
    staleTime: 1000 * 60 * 2,
  });

  return {
    minutes: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
