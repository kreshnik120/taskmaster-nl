import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AIFeedbackButtonsProps {
  suggestionId: string;
  entityType: string;
  entityId?: string;
  matchScore?: number;
  onFeedback?: (isPositive: boolean) => void;
  className?: string;
  size?: "sm" | "default";
}

export function AIFeedbackButtons({
  suggestionId,
  entityType,
  entityId,
  matchScore,
  onFeedback,
  className,
  size = "sm",
}: AIFeedbackButtonsProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFeedback = async (isPositive: boolean) => {
    if (feedback) return; // Already gave feedback
    
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        toast.error("Je moet ingelogd zijn om feedback te geven");
        return;
      }

      const { data: userOrg } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      // Log to ai_learning_events for implicit feedback tracking
      await supabase.from("ai_learning_events").insert({
        org_id: userOrg?.org_id || "550e8400-e29b-41d4-a716-446655440000",
        user_id: user.id,
        event_type: isPositive ? "ai_suggestion_accepted" : "ai_suggestion_rejected",
        context: {
          suggestion_id: suggestionId,
          entity_type: entityType,
          entity_id: entityId,
          match_score: matchScore,
          feedback_type: isPositive ? "positive" : "negative",
        },
        outcome: isPositive ? "accepted" : "rejected",
        confidence_score: matchScore ? matchScore / 100 : null,
      });

      // Also update ai_recommendation_audit if exists
      if (entityId) {
        await supabase
          .from("ai_recommendation_audit")
          .update({
            user_action: isPositive ? "accepted" : "rejected",
            action_taken_at: new Date().toISOString(),
          })
          .eq("entity_id", entityId)
          .eq("entity_type", entityType);
      }

      setFeedback(isPositive ? "positive" : "negative");
      onFeedback?.(isPositive);
      
      toast.success(
        isPositive 
          ? "Bedankt! Dit helpt de AI beter te worden" 
          : "Bedankt voor je feedback"
      );
    } catch (err) {
      console.error("Error logging feedback:", err);
      // Silent fail - don't disrupt UX for analytics
    } finally {
      setIsLoading(false);
    }
  };

  const buttonSize = size === "sm" ? "h-6 w-6 p-0" : "h-8 w-8 p-0";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          buttonSize,
          "hover:bg-green-100 dark:hover:bg-green-900/30",
          feedback === "positive" && "bg-green-100 dark:bg-green-900/30 text-green-600"
        )}
        onClick={() => handleFeedback(true)}
        disabled={isLoading || feedback !== null}
        title="Goede suggestie"
      >
        <ThumbsUp className={cn(
          iconSize,
          feedback === "positive" && "fill-current"
        )} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          buttonSize,
          "hover:bg-red-100 dark:hover:bg-red-900/30",
          feedback === "negative" && "bg-red-100 dark:bg-red-900/30 text-red-600"
        )}
        onClick={() => handleFeedback(false)}
        disabled={isLoading || feedback !== null}
        title="Geen goede suggestie"
      >
        <ThumbsDown className={cn(
          iconSize,
          feedback === "negative" && "fill-current"
        )} />
      </Button>
    </div>
  );
}
