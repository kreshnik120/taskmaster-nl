import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OrgMember {
  id: string;
  name: string;
  email: string;
}

export function useOrgMembers() {
  return useQuery({
    queryKey: ['org-members'],
    queryFn: async (): Promise<OrgMember[]> => {
      // 1. Haal org_id van huidige user
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .limit(1)
        .maybeSingle();

      if (!userOrg?.org_id) return [];

      // 2. Haal alle user_ids van org
      const { data: orgUsers } = await supabase
        .from('user_organizations')
        .select('user_id')
        .eq('org_id', userOrg.org_id);

      const userIds = orgUsers?.map((u) => u.user_id).filter(Boolean) as string[] || [];
      if (userIds.length === 0) return [];

      // 3. Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds);

      return (profiles || []).map((p) => ({
        id: p.id,
        name: p.name || 'Onbekend',
        email: p.email || '',
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 min cache
  });
}
