import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FacturatieInstellingen, UpdateFacturatieInstellingenInput } from '@/types/facturatie';
import { STALE_TIME_MS } from './constants';

const QUERY_KEY = ['facturatie-instellingen'] as const;

export function useFacturatieInstellingen() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<FacturatieInstellingen | null> => {
      // Get user's organization first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');

      const { data: userOrg, error: orgError } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!userOrg) return null;

      // Fetch instellingen for the organization
      const { data, error } = await supabase
        .from('facturatie_instellingen')
        .select('*')
        .eq('tenant_id', userOrg.org_id)
        .maybeSingle();

      if (error) throw error;
      return data as FacturatieInstellingen | null;
    },
    staleTime: STALE_TIME_MS,
  });
}

export function useUpdateFacturatieInstellingen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateFacturatieInstellingenInput): Promise<FacturatieInstellingen> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');

      const { data: userOrg, error: orgError } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!userOrg) throw new Error('Geen organisatie gevonden');

      const tenant_id = userOrg.org_id;

      // Check if record exists
      const { data: existing } = await supabase
        .from('facturatie_instellingen')
        .select('id')
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      let result;

      if (existing) {
        // Update existing record
        const { data, error } = await supabase
          .from('facturatie_instellingen')
          .update({
            ...input,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenant_id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('facturatie_instellingen')
          .insert({
            tenant_id,
            ...input,
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return result as FacturatieInstellingen;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Instellingen opgeslagen');
    },
    onError: (error) => {
      console.error('Error saving instellingen:', error);
      toast.error('Fout bij opslaan instellingen');
    },
  });
}
