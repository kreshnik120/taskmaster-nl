import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Agenda item structuur (uit JSONB)
export interface AgendaItem {
  id: string;
  order: number;
  title: string;
  duration_min: number;
  discussed: boolean;
}

// Decision structuur (uit JSONB)
export interface Decision {
  id: string;
  text: string;
  decided_at: string;
  decided_by: string | null;
  linked_task_id?: string | null;
}

// Betrokkene structuur (Fase 7D)
export interface Betrokkene {
  naam: string;
  rol?: string;
  relatie: 'assignee' | 'uitleg_ontvanger' | 'stakeholder';
}

// Externe partij structuur (Fase 7D)
export interface ExternePartij {
  naam: string;
  type: 'klant' | 'zzper' | 'locatie' | 'leverancier';
}

// Action Item structuur (uit JSONB) - Fase 7C + 7D uitbreiding
export interface ActionItem {
  // Fase 7C - Basis
  action: string;
  assignee: string | null;
  deadline: string | null;
  classification?: 'TAAK' | 'IDEE' | 'INFORMATIE';
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  source_quote?: string;
  confidence?: number;
  
  // Fase 7D - Enterprise context
  onderwerp?: string;
  doelgroep?: string;
  actie_type?: 'Communicatie' | 'Administratie' | 'Planning' | 'Onderzoek' | 'Beslissing' | 'Overig';
  achtergrond?: string;
  betrokkenen?: Betrokkene[];
  externe_partij?: ExternePartij;
  actieplan?: string[];
  suggestie?: string;
}

// Meeting Minutes met gekoppelde data
export interface MeetingMinute {
  id: string;
  task_id: string;
  org_id: string;
  meeting_type: 'team' | 'board' | 'project' | 'klant' | 'overig' | null;
  location: string | null;
  meeting_link: string | null;
  agenda_items: AgendaItem[];
  decisions: Decision[];
  action_items: ActionItem[]; // Fase 7C
  content: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'archived' | null;
  approved_by: string | null;
  approved_at: string | null;
  next_meeting_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Joined data
  tasks: {
    id: string;
    title: string;
    start_at: string | null;
    due_at: string | null;
  } | null;
  meeting_attendees: Array<{
    id: string;
    role: string | null;
    attended: boolean | null;
    user_id: string | null;
    external_name: string | null;
    profiles: { name: string | null } | null;
  }>;
}

export const MEETING_MINUTES_QUERY_KEY = ['meeting-minutes'] as const;

async function fetchMeetingMinutes(): Promise<MeetingMinute[]> {
  const { data, error } = await supabase
    .from("meeting_minutes")
    .select(`
      *,
      tasks!meeting_minutes_task_id_fkey(id, title, start_at, due_at),
      meeting_attendees(
        id,
        role,
        attended,
        user_id,
        external_name,
        profiles:user_id(name)
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch meeting minutes", { error });
    throw error;
  }

  // Transform the data to match our interface
  return (data || []).map((item) => ({
    id: item.id,
    task_id: item.task_id,
    org_id: item.org_id,
    meeting_type: item.meeting_type as MeetingMinute['meeting_type'],
    location: item.location,
    meeting_link: item.meeting_link,
    agenda_items: (item.agenda_items as unknown as AgendaItem[]) || [],
    decisions: (item.decisions as unknown as Decision[]) || [],
    action_items: (item.action_items as unknown as ActionItem[]) || [], // Fase 7C
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
  }));
}

export function useMeetingMinutes() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: MEETING_MINUTES_QUERY_KEY,
    queryFn: fetchMeetingMinutes,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Realtime subscription with debounce
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout | null = null;

    const channel = supabase
      .channel('notulen-realtime-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_minutes',
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
          }, 200);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    minutes: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
