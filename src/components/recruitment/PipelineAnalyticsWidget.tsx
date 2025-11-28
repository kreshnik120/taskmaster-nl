import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { differenceInDays } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useEffect } from "react";

interface Application {
  id: string;
  pipeline_stage: string;
  created_at: string;
  updated_at: string | null;
}

interface PipelineAnalyticsWidgetProps {
  applications: Application[];
}

export function PipelineAnalyticsWidget({ applications }: PipelineAnalyticsWidgetProps) {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('pipeline-analytics-open');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('pipeline-analytics-open', JSON.stringify(isOpen));
  }, [isOpen]);

  // Count applications per stage
  const stageCounts = {
    nieuw: applications.filter(a => a.pipeline_stage === 'nieuw').length,
    screening: applications.filter(a => a.pipeline_stage === 'screening').length,
    interview: applications.filter(a => a.pipeline_stage === 'interview').length,
    goedgekeurd: applications.filter(a => a.pipeline_stage === 'goedgekeurd').length,
    geplaatst: applications.filter(a => a.pipeline_stage === 'geplaatst').length,
  };

  const totalApps = applications.length;
  const placedCount = stageCounts.geplaatst;
  
  // Calculate conversion rates
  const conversionToScreening = totalApps > 0 ? Math.round((stageCounts.screening + stageCounts.interview + stageCounts.goedgekeurd + stageCounts.geplaatst) / totalApps * 100) : 0;
  const conversionToInterview = totalApps > 0 ? Math.round((stageCounts.interview + stageCounts.goedgekeurd + stageCounts.geplaatst) / totalApps * 100) : 0;
  const conversionToPlaced = totalApps > 0 ? Math.round(stageCounts.geplaatst / totalApps * 100) : 0;

  // Calculate average time in pipeline
  const avgDaysInPipeline = applications.length > 0
    ? Math.round(
        applications.reduce((sum, app) => {
          const created = new Date(app.created_at);
          const now = new Date();
          const days = differenceInDays(now, created);
          return sum + days;
        }, 0) / applications.length
      )
    : 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-muted">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-semibold">Pipeline Analytics</span>
              <span className="text-xs text-muted-foreground">
                ({placedCount}/{totalApps} geplaatst)
              </span>
            </div>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-6">
            {/* Conversion Funnel */}
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Nieuw → Screening</span>
                  <span className="text-muted-foreground">{conversionToScreening}%</span>
                </div>
                <Progress value={conversionToScreening} className="h-3" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Screening → Interview</span>
                  <span className="text-muted-foreground">{conversionToInterview}%</span>
                </div>
                <Progress value={conversionToInterview} className="h-3" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Interview → Geplaatst</span>
                  <span className="text-muted-foreground">{conversionToPlaced}%</span>
                </div>
                <Progress value={conversionToPlaced} className="h-3" />
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wide">Gemiddelde doorlooptijd</span>
                </div>
                <p className="text-2xl font-bold text-primary">
                  {avgDaysInPipeline} <span className="text-sm font-normal text-muted-foreground">dagen</span>
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wide">Plaatsingsratio</span>
                </div>
                <p className="text-2xl font-bold text-primary">
                  {Math.round((placedCount / Math.max(totalApps, 1)) * 100)}%
                </p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
