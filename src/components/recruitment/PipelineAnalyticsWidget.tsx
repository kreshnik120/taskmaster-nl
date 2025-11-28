import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Clock, Target } from "lucide-react";

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
  // Count applications per stage
  const stageCounts = {
    nieuw: applications.filter(a => a.pipeline_stage === 'nieuw').length,
    screening: applications.filter(a => a.pipeline_stage === 'screening').length,
    interview: applications.filter(a => a.pipeline_stage === 'interview').length,
    goedgekeurd: applications.filter(a => a.pipeline_stage === 'goedgekeurd').length,
    geplaatst: applications.filter(a => a.pipeline_stage === 'geplaatst').length,
  };

  const total = applications.length;
  
  // Calculate conversion rates
  const conversionToScreening = total > 0 ? Math.round((stageCounts.screening + stageCounts.interview + stageCounts.goedgekeurd + stageCounts.geplaatst) / total * 100) : 0;
  const conversionToInterview = total > 0 ? Math.round((stageCounts.interview + stageCounts.goedgekeurd + stageCounts.geplaatst) / total * 100) : 0;
  const conversionToPlaced = total > 0 ? Math.round(stageCounts.geplaatst / total * 100) : 0;

  // Calculate average time in pipeline (days since created)
  const avgDaysInPipeline = applications.length > 0
    ? Math.round(
        applications.reduce((sum, app) => {
          const created = new Date(app.created_at);
          const now = new Date();
          const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0) / applications.length
      )
    : 0;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Pipeline Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Conversion Funnel */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Nieuw → Screening</span>
            <Badge variant="outline" className="text-xs">
              {conversionToScreening}%
            </Badge>
          </div>
          <Progress value={conversionToScreening} className="h-2" />
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Screening → Interview</span>
            <Badge variant="outline" className="text-xs">
              {conversionToInterview}%
            </Badge>
          </div>
          <Progress value={conversionToInterview} className="h-2" />
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Interview → Geplaatst</span>
            <Badge variant="outline" className="text-xs">
              {conversionToPlaced}%
            </Badge>
          </div>
          <Progress value={conversionToPlaced} className="h-2" />
        </div>

        {/* Average Time */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Gem. doorlooptijd</span>
          </div>
          <Badge variant="secondary">
            {avgDaysInPipeline} dagen
          </Badge>
        </div>

        {/* Success Rate */}
        <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">Plaatsingsratio</span>
          </div>
          <Badge variant="secondary" className="bg-green-500/20 text-green-700">
            {conversionToPlaced}%
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
