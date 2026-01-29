import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateContactNameParams {
  contactId: string;
  displayName: string | null;
}

export function useUpdateContactName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, displayName }: UpdateContactNameParams) => {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({ display_name: displayName })
        .eq('id', contactId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contact'] });
      toast.success('Naam bijgewerkt');
    },
    onError: (error) => {
      console.error('Failed to update contact name:', error);
      toast.error('Kon naam niet bijwerken');
    },
  });
}
