import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ClientOrganization {
  id: string;
  name: string;
  org_id: string | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  centrale_facturatie_email: string | null;
}

export function useClientOrganizations() {
  return useQuery({
    queryKey: ["client-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_organizations")
        .select("id, name, org_id, kvk_nummer, btw_nummer, centrale_facturatie_email")
        .order("name");

      if (error) throw error;
      return data as ClientOrganization[];
    },
    staleTime: 5 * 60 * 1000, // 5 minuten cache
  });
}
