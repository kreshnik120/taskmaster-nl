import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bot, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { logger } from "@/lib/logger";

const log = logger.create('AIFollowupButton');

interface AIFollowupButtonProps {
  applicationId: string;
  completenessScore: number | null;
  candidateEmail: string;
  candidateName: string;
}

export function AIFollowupButton({
  applicationId,
  completenessScore,
  candidateEmail,
  candidateName,
}: AIFollowupButtonProps) {
  const [triggering, setTriggering] = useState(false);

  // Check if there's already an active AI goal for this application
  // Check for ANY relevant AI goal types for this application
  const { data: existingGoal, refetch } = useQuery({
    queryKey: ["ai-goal", applicationId],
    queryFn: async () => {
      // Check all relevant goal types that could be active for this application
      const { data } = await supabase
        .from("agent_goals")
        .select("id, status, goal_type, created_at")
        .filter("input_data->>application_id", "eq", applicationId)
        .in("goal_type", [
          "send_welcome_and_intake",
          "application_intake_completion", 
          "send_reply_response",
          "request_documents"
        ])
        .in("status", ["pending", "planning", "executing", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const score = completenessScore || 0;
  const needsFollowup = score < 80;

  const handleTriggerFollowup = async () => {
    if (!needsFollowup) {
      toast.info("Profiel is al compleet genoeg (80%+)");
      return;
    }

    if (existingGoal) {
      toast.info("AI Agent is al bezig met deze kandidaat");
      return;
    }

    setTriggering(true);
    try {
      // Get org_id AND missing_info from application
      const { data: appData } = await supabase
        .from("professional_applications")
        .select("org_id, missing_info, extracted_data")
        .eq("id", applicationId)
        .single();

      if (!appData?.org_id) {
        throw new Error("Applicatie heeft geen organisatie");
      }

      // Get missing_info - either from column or derive from extracted_data
      let missingInfo: string[] = [];
      
      if (Array.isArray(appData.missing_info)) {
        missingInfo = appData.missing_info as string[];
      }
      
      // If no missing_info stored, derive from extracted_data completeness
      if (missingInfo.length === 0 && appData.extracted_data) {
        const extractedData = appData.extracted_data as Record<string, unknown>;
        const criticalFields = ['functie_niveau', 'werkvorm', 'regio', 'beschikbaarheid', 'telefoonnummer'];
        missingInfo = criticalFields.filter(field => !extractedData[field]);
      }

      log.log('🤖 Creating goal with missing_info:', missingInfo);

      // Create AI Agent goal with missing_info included
      const { error } = await supabase.from("agent_goals").insert({
        org_id: appData.org_id,
        goal_type: "application_intake_completion",
        goal_description: `Verzamel ontbrekende informatie van kandidaat ${candidateName} via email`,
        priority: 5,
        status: "pending",
        input_data: {
          application_id: applicationId,
          candidate_email: candidateEmail,
          candidate_name: candidateName,
          current_completeness: score,
          target_completeness: 80,
          missing_info: missingInfo,
        },
      });

      if (error) throw error;

      toast.success("🤖 AI Agent geactiveerd", {
        description: `Follow-up email wordt voorbereid voor ${candidateName} (${missingInfo.length} ontbrekende velden)`,
      });

      refetch();
    } catch (error: any) {
      log.error("Error triggering AI followup:", error);
      toast.error("Fout bij activeren AI Agent", {
        description: error.message,
      });
    } finally {
      setTriggering(false);
    }
  };

  // Don't show if completeness is already good
  if (!needsFollowup) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            <span>Profiel compleet</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Geen AI follow-up nodig (score ≥80%)</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Show active status if goal exists
  if (existingGoal) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 rounded text-xs text-blue-600">
            <Bot className="h-3 w-3 animate-pulse" />
            <span>AI Agent actief</span>
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {existingGoal.status}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>AI verzamelt ontbrekende informatie</p>
          <p className="text-xs text-muted-foreground">
            Gestart: {new Date(existingGoal.created_at).toLocaleString("nl-NL")}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTriggerFollowup}
          disabled={triggering}
          className="gap-1.5 h-7 text-xs border-primary/30 hover:bg-primary/5"
        >
          {triggering ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Bot className="h-3 w-3" />
          )}
          AI Follow-up
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Start AI Agent om ontbrekende info te verzamelen</p>
        <p className="text-xs text-muted-foreground">
          Huidige score: {score}% (doel: 80%)
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
