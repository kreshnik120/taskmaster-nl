import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bot, MessageSquare, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AIIntakeStatusWidget() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["ai-intake-stats"],
    queryFn: async () => {
      // Active AI goals for intake completion
      const { count: activeGoals } = await supabase
        .from("agent_goals")
        .select("*", { count: "exact", head: true })
        .eq("goal_type", "application_intake_completion")
        .in("status", ["pending", "in_progress"]);

      // Pending actions (waiting for callback)
      const { count: pendingActions } = await supabase
        .from("agent_actions")
        .select("*", { count: "exact", head: true })
        .eq("action_type", "send_followup_question")
        .eq("status", "pending");

      // Completed today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: completedToday } = await supabase
        .from("agent_goals")
        .select("*", { count: "exact", head: true })
        .eq("goal_type", "application_intake_completion")
        .eq("status", "completed")
        .gte("completed_at", today.toISOString());

      return {
        activeGoals: activeGoals || 0,
        pendingActions: pendingActions || 0,
        completedToday: completedToday || 0,
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">AI Agent laden...</span>
      </div>
    );
  }

  const hasActivity = (stats?.activeGoals || 0) > 0 || (stats?.pendingActions || 0) > 0;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/50 rounded-lg border border-border/50">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            <Bot className={`h-4 w-4 ${hasActivity ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
            <span className="text-xs font-medium text-foreground">AI Agent</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Autonome AI intake assistent</p>
        </TooltipContent>
      </Tooltip>

      <div className="h-4 w-px bg-border" />

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
              {stats?.activeGoals || 0}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Actieve intake conversations</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
              {stats?.pendingActions || 0}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Wachtend op antwoord kandidaat</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
              {stats?.completedToday || 0}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Voltooid vandaag</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
