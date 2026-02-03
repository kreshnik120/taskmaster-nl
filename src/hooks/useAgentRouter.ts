import { useState, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getPageAgentConfig,
  detectIntentFromText,
  type IntentDefinition,
  type PageAgentConfig,
} from "@/lib/agentIntents";

export interface AgentResult {
  success: boolean;
  agent?: string;
  action_taken?: string;
  result?: Record<string, unknown>;
  suggestions?: string[];
  execution_id?: string;
  error?: string;
}

export interface UseAgentRouterOptions {
  onSuccess?: (result: AgentResult) => void;
  onError?: (error: string) => void;
  pageContext?: Record<string, unknown>;
}

export function useAgentRouter(options: UseAgentRouterOptions = {}) {
  const location = useLocation();
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<AgentResult | null>(null);
  const [executionHistory, setExecutionHistory] = useState<AgentResult[]>([]);

  // Get page-specific configuration (supports dashboard tabs via search params)
  const pageConfig: PageAgentConfig = useMemo(
    () => getPageAgentConfig(location.pathname, location.search),
    [location.pathname, location.search]
  );

  // Available intents for current page
  const availableIntents = useMemo(() => pageConfig.intents, [pageConfig]);

  /**
   * Execute an intent via the VPS Agent Router
   * @param intentId - The intent to execute
   * @param payload - Additional data to send
   * @param message - Optional natural language message
   * @param executeOptions - Execution options (e.g., silent mode)
   */
  const executeIntent = useCallback(
    async (
      intentId: string,
      payload: Record<string, unknown> = {},
      message?: string,
      executeOptions?: { silent?: boolean }
    ): Promise<AgentResult> => {
      setIsExecuting(true);
      setLastResult(null);

      const isSilent = executeOptions?.silent ?? false;

      try {
        const { data, error } = await supabase.functions.invoke("agent-router-proxy", {
          body: {
            intent: intentId,
            payload: {
              ...payload,
              ...options.pageContext,
            },
            page_context: location.pathname,
            message,
          },
        });

        if (error) {
          const errorResult: AgentResult = {
            success: false,
            error: error.message || "Failed to execute intent",
          };
          setLastResult(errorResult);
          if (!isSilent) {
            options.onError?.(errorResult.error!);
            toast.error("Agent fout", { description: errorResult.error });
          }
          return errorResult;
        }

        const result = data as AgentResult;
        setLastResult(result);
        setExecutionHistory((prev) => [result, ...prev.slice(0, 9)]); // Keep last 10

        if (result.success) {
          if (!isSilent) {
            options.onSuccess?.(result);
            toast.success("Actie uitgevoerd", {
              description: result.action_taken || `${result.agent} heeft de taak voltooid`,
            });
          }
        } else {
          if (!isSilent) {
            options.onError?.(result.error || "Unknown error");
            toast.error("Agent kon actie niet uitvoeren", { description: result.error });
          }
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unexpected error";
        const errorResult: AgentResult = { success: false, error: errorMessage };
        setLastResult(errorResult);
        if (!isSilent) {
          options.onError?.(errorMessage);
          toast.error("Verbindingsfout", { description: "Kon geen verbinding maken met Agent Router" });
        }
        return errorResult;
      } finally {
        setIsExecuting(false);
      }
    },
    [location.pathname, options]
  );

  /**
   * Execute from natural language message
   */
  const executeFromMessage = useCallback(
    async (message: string, payload: Record<string, unknown> = {}): Promise<AgentResult> => {
      const detectedIntent = detectIntentFromText(message, pageConfig);
      const intentId = detectedIntent?.id || "general_query";
      
      return executeIntent(intentId, payload, message);
    },
    [executeIntent, pageConfig]
  );

  /**
   * Detect intent from text without executing
   */
  const detectIntent = useCallback(
    (text: string): IntentDefinition | null => {
      return detectIntentFromText(text, pageConfig);
    },
    [pageConfig]
  );

  /**
   * Submit feedback for a previous execution
   */
  const submitFeedback = useCallback(
    async (
      executionId: string,
      rating: "positive" | "negative" | "correction",
      correctionData?: Record<string, unknown>
    ): Promise<boolean> => {
      try {
        const { data, error } = await supabase.functions.invoke("agent-router-proxy", {
          body: {
            action: "feedback",
            execution_id: executionId,
            rating,
            correction_data: correctionData,
          },
        });

        if (error) {
          console.error("Feedback submission failed:", error);
          return false;
        }

        const feedbackText =
          rating === "positive"
            ? "Bedankt voor je feedback! 👍"
            : rating === "negative"
              ? "Bedankt, we leren hiervan"
              : "Correctie opgeslagen";

        toast.success(feedbackText);
        return data?.success ?? false;
      } catch (err) {
        console.error("Feedback error:", err);
        return false;
      }
    },
    []
  );

  /**
   * Get quick action for an intent
   */
  const getQuickAction = useCallback(
    (intentId: string) => {
      const intent = availableIntents.find((i) => i.id === intentId);
      if (!intent) return null;

      return {
        ...intent,
        execute: (payload?: Record<string, unknown>) => executeIntent(intentId, payload),
      };
    },
    [availableIntents, executeIntent]
  );

  return {
    // State
    isExecuting,
    lastResult,
    executionHistory,
    
    // Configuration
    pageConfig,
    availableIntents,
    primaryAgent: pageConfig.primaryAgent,
    
    // Actions
    executeIntent,
    executeFromMessage,
    detectIntent,
    submitFeedback,
    getQuickAction,
    
    // Utilities
    clearHistory: () => setExecutionHistory([]),
  };
}

export default useAgentRouter;
