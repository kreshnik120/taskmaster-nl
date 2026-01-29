import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateContactNotesParams {
  contactId: string;
  notes: string | null;
}

export function useUpdateContactNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, notes }: UpdateContactNotesParams) => {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({ contact_notes: notes })
        .eq('id', contactId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contact'] });
      // No toast here - feedback via save indicator
    },
    onError: (error) => {
      console.error('Failed to update notes:', error);
      toast.error('Kon notities niet opslaan');
    },
  });
}
