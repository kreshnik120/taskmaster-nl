import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DienstData } from "@/hooks/useDienstenPlanning";

interface AgentMatchResult {
  professional_id: string;
  full_name: string;
  functie_niveau: string;
  regio: string | null;
  total_score: number;
  breakdown: {
    functie_niveau: number;
    beschikbaarheid: number;
    certificeringen: number;
    regio: number;
    historie: number;
  };
  reasons: string[];
}

interface AgentMatchResponse {
  success: boolean;
  matches: AgentMatchResult[];
  meta?: {
    professionals_evaluated: number;
    disqualified: number;
    execution_time_ms: number;
  };
  error?: string;
}

export type { AgentMatchResult };

export function useAgentDienstMatching() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [agentMatches, setAgentMatches] = useState<AgentMatchResult[]>([]);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async (dienst: DienstData, action: "suggest" | "replacement" = "suggest") => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("agent-dienst-matching", {
        body: {
          dienst_id: dienst.id,
          org_id: dienst.org_id,
          action,
        },
      });

      if (invokeError) throw invokeError;

      const response = data as AgentMatchResponse;

      if (!response.success) {
        setError(response.error ?? "Onbekende fout");
        setAgentMatches([]);
        return;
      }

      setAgentMatches(response.matches);
      setExecutionTime(response.meta?.execution_time_ms ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse mislukt");
      setAgentMatches([]);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setAgentMatches([]);
    setExecutionTime(null);
    setError(null);
  }, []);

  return { isAnalyzing, agentMatches, executionTime, error, runAnalysis, clearResults };
}
