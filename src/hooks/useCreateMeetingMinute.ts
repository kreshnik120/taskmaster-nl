import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_MINUTES_QUERY_KEY } from "./useMeetingMinutes";

export interface CreateMeetingMinuteInput {
  title: string;
  meeting_type: 'team' | 'board' | 'project' | 'klant' | 'overig';
  start_at: Date;
  location?: string;
  meeting_link?: string;
  linkedTaskId?: string;
  // Extracted data fields
  agenda_items?: Array<{ item: string; discussed: boolean }>;
  decisions?: Array<{ decision: string; owner?: string | null; deadline?: string | null }>;
  content?: string;
  participants?: Array<{ name: string; role?: string | null; present?: boolean }>;
}

export function useCreateMeetingMinute() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const createMeetingMinute = async (input: CreateMeetingMinuteInput): Promise<string> => {
    setIsCreating(true);
    
    try {
      // 1. Haal org_id op via user_organizations
      const { data: userOrg, error: orgError } = await supabase
        .from("user_organizations")
        .select("org_id")
        .limit(1)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!userOrg?.org_id) throw new Error("Geen organisatie gevonden");

      let taskId = input.linkedTaskId;

      // 2. Maak alleen nieuwe task als geen linkedTaskId meegegeven
      if (!taskId) {
        const { data: task, error: taskError } = await supabase
          .from("tasks")
          .insert({
            title: input.title,
            org_id: userOrg.org_id,
            category: 'meeting',
            start_at: input.start_at.toISOString(),
            is_all_day: false,
          })
          .select('id')
          .single();

        if (taskError) throw taskError;
        taskId = task.id;
      }

      // 3. Transform extracted data to database format
      const formattedAgendaItems = (input.agenda_items || []).map((item, index) => ({
        id: crypto.randomUUID(),
        order: index + 1,
        title: item.item,
        duration_min: 15,
        discussed: item.discussed || false,
      }));

      const formattedDecisions = (input.decisions || []).map(d => ({
        id: crypto.randomUUID(),
        text: d.decision,
        decided_by: d.owner || null,
        decided_at: d.deadline || new Date().toISOString(),
        linked_task_id: null,
      }));

      // 4. Maak meeting_minutes aan gekoppeld aan task
      const { data: minute, error: minuteError } = await supabase
        .from("meeting_minutes")
        .insert({
          task_id: taskId,
          org_id: userOrg.org_id,
          meeting_type: input.meeting_type,
          location: input.location || null,
          meeting_link: input.meeting_link || null,
          status: 'draft',
          agenda_items: formattedAgendaItems,
          decisions: formattedDecisions,
          content: input.content || null,
        })
        .select('id')
        .single();

      if (minuteError) {
        // Cleanup: verwijder task als minute creation failed (alleen als we de task aangemaakt hebben)
        if (!input.linkedTaskId && taskId) {
          await supabase.from("tasks").delete().eq("id", taskId);
        }
        throw minuteError;
      }

      // 5. Insert participants as meeting_attendees
      if (input.participants && input.participants.length > 0) {
        const attendeesToInsert = input.participants.map(p => ({
          meeting_id: minute.id,
          external_name: p.name,
          role: (p.role as 'voorzitter' | 'notulist' | 'deelnemer' | 'gast') || 'deelnemer',
          attended: p.present ?? true,
          user_id: null,
        }));
        
        await supabase
          .from('meeting_attendees')
          .insert(attendeesToInsert);
      }

      // 6. Invalidate query cache
      queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['task-meeting-minutes', taskId] });

      return minute.id;
    } finally {
      setIsCreating(false);
    }
  };

  return { createMeetingMinute, isCreating };
}
