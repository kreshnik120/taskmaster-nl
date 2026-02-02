import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, AlertCircle, Calendar, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function TodayFocusCard() {
  const navigate = useNavigate();

  const { data: focusItems, isLoading } = useQuery({
    queryKey: ["today-focus"],
    queryFn: async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [stuckApplicationsRes, urgentTasksRes, upcomingInterviewsRes] = await Promise.all([
        supabase
          .from("professional_applications")
          .select("id, extracted_data, pipeline_stage, updated_at")
          .is("deleted_at", null)
          .in("pipeline_stage", ["nieuw", "screening"])
          .lte("updated_at", threeDaysAgo.toISOString())
          .limit(3),
        supabase
          .from("tasks")
          .select("id, title, due_at, priority")
          .is("completed_at", null)
          .is("deleted_at", null)
          .lte("due_at", tomorrow.toISOString())
          .order("due_at", { ascending: true })
          .limit(3),
        supabase
          .from("interview_appointments")
          .select("id, scheduled_at, professional_id")
          .gte("scheduled_at", new Date().toISOString())
          .lte("scheduled_at", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
          .eq("status", "gepland")
          .limit(3),
      ]);

      return {
        stuckApplications: stuckApplicationsRes.data || [],
        urgentTasks: urgentTasksRes.data || [],
        upcomingInterviews: upcomingInterviewsRes.data || [],
      };
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  if (isLoading || !focusItems) {
    return (
      <Card className="glass-card-indigo glass-light-bleed-indigo">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-tab-mijn-werk-500" />
            Vandaag Focus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-6 bg-muted/50 animate-pulse rounded" />
            <div className="h-6 bg-muted/50 animate-pulse rounded" />
            <div className="h-6 bg-muted/50 animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalItems =
    focusItems.stuckApplications.length +
    focusItems.urgentTasks.length +
    focusItems.upcomingInterviews.length;

  if (totalItems === 0) {
    return (
      <Card className="glass-card-indigo glass-light-bleed-indigo">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-tab-mijn-werk-500" />
            Vandaag Focus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-tab-mijn-werk-600 dark:text-tab-mijn-werk-400">
            <TrendingUp className="h-4 w-4" />
            <p className="text-sm">Alles loopt op schema! 🎉</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card-indigo glass-light-bleed-indigo">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-tab-mijn-werk-500" />
          Vandaag Focus
          <Badge className="ml-auto bg-tab-mijn-werk-100 text-tab-mijn-werk-700 border border-tab-mijn-werk-200 dark:bg-tab-mijn-werk-900/40 dark:text-tab-mijn-werk-300 dark:border-tab-mijn-werk-700">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {focusItems.stuckApplications.length > 0 && (
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-tab-mijn-werk-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {focusItems.stuckApplications.length} sollicitatie{focusItems.stuckApplications.length !== 1 ? "s" : ""} wacht{focusItems.stuckApplications.length === 1 ? "" : "en"} op screening
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-tab-mijn-werk-600 hover:text-tab-mijn-werk-700 dark:text-tab-mijn-werk-400 dark:hover:text-tab-mijn-werk-300"
                onClick={() => navigate("/sollicitaties")}
              >
                Bekijk sollicitaties →
              </Button>
            </div>
          </div>
        )}

        {focusItems.urgentTasks.length > 0 && (
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-tab-mijn-werk-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {focusItems.urgentTasks.length} taak{focusItems.urgentTasks.length !== 1 ? " taken" : ""} met deadline vandaag/morgen
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-tab-mijn-werk-600 hover:text-tab-mijn-werk-700 dark:text-tab-mijn-werk-400 dark:hover:text-tab-mijn-werk-300"
                onClick={() => navigate("/dashboard?tab=lijst")}
              >
                Bekijk taken →
              </Button>
            </div>
          </div>
        )}

        {focusItems.upcomingInterviews.length > 0 && (
          <div className="flex items-start gap-2">
            <Users className="h-4 w-4 text-tab-mijn-werk-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {focusItems.upcomingInterviews.length} interview{focusItems.upcomingInterviews.length !== 1 ? "s" : ""} gepland deze week
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-tab-mijn-werk-600 hover:text-tab-mijn-werk-700 dark:text-tab-mijn-werk-400 dark:hover:text-tab-mijn-werk-300"
                onClick={() => navigate("/sollicitaties")}
              >
                Bekijk interviews →
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
