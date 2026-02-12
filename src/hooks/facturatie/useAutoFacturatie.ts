import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { FACTURATIE_QUERY_KEYS } from "./constants";

interface OpdrachtgeverPreview {
  id: string;
  naam: string;
  diensten_count: number;
  toewijzingen_count: number;
  totaal_uren: number;
  totaal_bedrag: number;
  toewijzingen: {
    toewijzing_id: string;
    dienst_titel: string;
    datum: string;
    professional_naam: string;
    uren: number;
    tarief: number;
    bedrag: number;
  }[];
}

interface PreviewTotalen {
  opdrachtgevers: number;
  diensten: number;
  toewijzingen: number;
  uren: number;
  bedrag: number;
}

interface CreatedFactuur {
  id: string;
  factuur_nummer: string;
  opdrachtgever_naam: string;
  regels_count: number;
  totaal: number;
}

interface PreviewResult {
  opdrachtgevers: OpdrachtgeverPreview[];
  totalen: PreviewTotalen;
}

interface GenerateResult {
  created_facturen: CreatedFactuur[];
  totalen: { facturen: number; regels: number; bedrag: number };
}

export function useAutoFacturatie() {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async (periodStart: string, periodEnd: string) => {
    setIsLoading(true);
    setError(null);
    setPreview(null);

    try {
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .limit(1)
        .maybeSingle();

      if (!userOrg?.org_id) throw new Error('Geen organisatie gevonden');

      const { data, error: invokeError } = await supabase.functions.invoke('agent-auto-facturatie', {
        body: {
          org_id: userOrg.org_id,
          period_start: periodStart,
          period_end: periodEnd,
          action: 'preview',
        },
      });

      if (invokeError) throw invokeError;
      if (!data.success) throw new Error(data.error ?? 'Preview mislukt');

      setPreview({
        opdrachtgevers: data.opdrachtgevers,
        totalen: data.totalen,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview ophalen mislukt');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateFacturen = useCallback(async (
    periodStart: string,
    periodEnd: string,
    selectedOpdrachtgeverIds?: string[]
  ) => {
    setIsLoading(true);
    setError(null);
    setGenerateResult(null);

    try {
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .limit(1)
        .maybeSingle();

      if (!userOrg?.org_id) throw new Error('Geen organisatie gevonden');

      const { data, error: invokeError } = await supabase.functions.invoke('agent-auto-facturatie', {
        body: {
          org_id: userOrg.org_id,
          period_start: periodStart,
          period_end: periodEnd,
          action: 'generate',
          selected_opdrachtgever_ids: selectedOpdrachtgeverIds,
        },
      });

      if (invokeError) throw invokeError;
      if (!data.success) throw new Error(data.error ?? 'Genereren mislukt');

      setGenerateResult({
        created_facturen: data.created_facturen,
        totalen: data.totalen,
      });

      await queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.facturen });
      await queryClient.invalidateQueries({ queryKey: FACTURATIE_QUERY_KEYS.stats });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Facturen genereren mislukt');
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  const reset = useCallback(() => {
    setPreview(null);
    setGenerateResult(null);
    setError(null);
  }, []);

  return { isLoading, preview, generateResult, error, fetchPreview, generateFacturen, reset };
}
