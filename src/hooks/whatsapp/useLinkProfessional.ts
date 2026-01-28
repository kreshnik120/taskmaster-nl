import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LinkProfessionalParams {
  chatId: string;
  professionalId: string | null;
}

export function useLinkProfessional() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, professionalId }: LinkProfessionalParams) => {
      const { error } = await supabase
        .from('whatsapp_chats')
        .update({ linked_professional_id: professionalId })
        .eq('id', chatId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      
      if (variables.professionalId) {
        toast.success('Professional gekoppeld aan chat');
      } else {
        toast.success('Professional ontkoppeld van chat');
      }
    },
    onError: (error) => {
      console.error('Failed to link professional:', error);
      toast.error('Kon professional niet koppelen');
    },
  });
}
