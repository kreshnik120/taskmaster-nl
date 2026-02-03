import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FACTURATIE_QUERY_KEYS, STALE_TIME_MS, REALTIME_DEBOUNCE_MS } from "./constants";
import type { Factuur, FactuurFilters } from "@/types/facturatie";

interface UseFacturenOptions extends FactuurFilters {
  page?: number;
  pageSize?: number;
  sortBy?: 'factuurdatum' | 'vervaldatum' | 'totaal' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

export function useFacturen(options: UseFacturenOptions = {}) {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    status, type, opdrachtgever_id,
    factuurdatum_van, factuurdatum_tot,
    search, alleen_openstaand,
    page = 1, pageSize = 25,
    sortBy = 'factuurdatum', sortOrder = 'desc',
    enabled = true,
  } = options;

  const queryKey = [...FACTURATIE_QUERY_KEYS.facturen, options];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from('factuur')
        .select(`
          *,
          opdrachtgever:client_organizations!factuur_opdrachtgever_id_fkey(id, name)
        `, { count: 'exact' })
        .is('deleted_at', null);

      if (status) {
        if (Array.isArray(status)) {
          q = q.in('status', status);
        } else {
          q = q.eq('status', status);
        }
      }

      if (type) {
        if (Array.isArray(type)) {
          q = q.in('type', type);
        } else {
          q = q.eq('type', type);
        }
      }

      if (opdrachtgever_id) q = q.eq('opdrachtgever_id', opdrachtgever_id);
      if (factuurdatum_van) q = q.gte('factuurdatum', factuurdatum_van);
      if (factuurdatum_tot) q = q.lte('factuurdatum', factuurdatum_tot);
      if (alleen_openstaand) q = q.gt('openstaand_bedrag', 0);
      if (search) q = q.ilike('factuur_nummer', `%${search}%`);

      q = q.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;

      return {
        facturen: data as unknown as Factuur[],
        count: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    },
    staleTime: STALE_TIME_MS,
    enabled,
  });

  // Realtime subscription
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('facturen-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'factuur' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen });
        }, REALTIME_DEBOUNCE_MS);
      })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient, enabled]);

  return {
    facturen: query.data?.facturen ?? [],
    count: query.data?.count ?? 0,
    totalPages: query.data?.totalPages ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
