import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_MINUTES_QUERY_KEY, Decision } from "@/hooks/useMeetingMinutes";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export function useManageDecisions() {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchCurrentDecisions = async (minuteId: string): Promise<Decision[]> => {
    const { data, error } = await supabase
      .from('meeting_minutes')
      .select('decisions')
      .eq('id', minuteId)
      .single();

    if (error) throw error;
    return (data?.decisions as unknown as Decision[]) || [];
  };

  const updateDecisions = async (minuteId: string, decisions: Decision[]): Promise<void> => {
    const { error } = await supabase
      .from('meeting_minutes')
      .update({ decisions: decisions as unknown as Json })
      .eq('id', minuteId);

    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: MEETING_MINUTES_QUERY_KEY });
  };

  const addDecision = async (minuteId: string, text: string): Promise<void> => {
    setIsUpdating(true);
    try {
      // Haal huidige user op voor decided_by
      const { data: { user } } = await supabase.auth.getUser();
      let decidedByName: string | null = null;

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', user.id)
          .single();
        decidedByName = profile?.name || null;
      }

      const currentDecisions = await fetchCurrentDecisions(minuteId);

      const newDecision: Decision = {
        id: crypto.randomUUID(),
        text,
        decided_at: new Date().toISOString(),
        decided_by: decidedByName,
      };

      await updateDecisions(minuteId, [...currentDecisions, newDecision]);
      toast.success("Beslissing toegevoegd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon beslissing niet toevoegen", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const removeDecision = async (minuteId: string, decisionId: string): Promise<void> => {
    setIsUpdating(true);
    try {
      const currentDecisions = await fetchCurrentDecisions(minuteId);
      const filteredDecisions = currentDecisions.filter((d) => d.id !== decisionId);

      await updateDecisions(minuteId, filteredDecisions);
      toast.success("Beslissing verwijderd");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast.error("Kon beslissing niet verwijderen", { description: message });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    addDecision,
    removeDecision,
    isUpdating,
  };
}
