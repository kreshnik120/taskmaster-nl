import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateContactTagsParams {
  contactId: string;
  tags: string[];
}

export function useUpdateContactTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, tags }: UpdateContactTagsParams) => {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({ tags })
        .eq('id', contactId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contact'] });
      toast.success('Labels bijgewerkt');
    },
    onError: (error) => {
      console.error('Failed to update tags:', error);
      toast.error('Kon labels niet bijwerken');
    },
  });
}
