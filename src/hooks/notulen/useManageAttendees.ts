import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_MINUTES_QUERY_KEY } from "@/hooks/useMeetingMinutes";
import { toast } from "sonner";

export type AttendeeRole = 'voorzitter' | 'notulist' | 'deelnemer' | 'afwezig';

export interface AddInternalAttendeeInput {
  meeting_id: string;
  user_id: string;
  role?: AttendeeRole;
}

export interface AddExternalAttendeeInput {
  meeting_id: string;
  external_name: string;
  external_email?: string;
  role?: AttendeeRole;
}

export function useManageAttendees() {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const addInternalAttendee = async (input: AddInternalAttendeeInput): Promise<void> => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('meeting_attendees')
        .insert({
          meeting_id: input.meeting_id,
          user_id: input.user_id,
          role: input.role || 'deelnemer',
          attended: true,
        });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
      toast.success("Deelnemer toegevoegd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon deelnemer niet toevoegen", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const addExternalAttendee = async (input: AddExternalAttendeeInput): Promise<void> => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('meeting_attendees')
        .insert({
          meeting_id: input.meeting_id,
          external_name: input.external_name,
          external_email: input.external_email || null,
          role: input.role || 'gast',
          attended: true,
        });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
      toast.success("Externe deelnemer toegevoegd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon externe deelnemer niet toevoegen", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const updateAttendee = async (
    attendeeId: string,
    updates: { role?: string; attended?: boolean }
  ): Promise<void> => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('meeting_attendees')
        .update(updates)
        .eq('id', attendeeId);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
      toast.success("Deelnemer bijgewerkt");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon deelnemer niet bijwerken", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const removeAttendee = async (attendeeId: string): Promise<void> => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('meeting_attendees')
        .delete()
        .eq('id', attendeeId);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
      toast.success("Deelnemer verwijderd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon deelnemer niet verwijderen", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    addInternalAttendee,
    addExternalAttendee,
    updateAttendee,
    removeAttendee,
    isUpdating,
  };
}
