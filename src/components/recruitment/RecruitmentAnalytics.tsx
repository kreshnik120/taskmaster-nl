import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Clock, Target } from "lucide-react";

interface Application {
  pipeline_stage: string;
  created_at: string;
  updated_at: string | null;
}

interface RecruitmentAnalyticsProps {
  applications: Application[];
}

export function RecruitmentAnalytics({ applications }: RecruitmentAnalyticsProps) {
  // Conversion rates per stage
  const stageOrder = ["nieuw", "screening", "interview", "goedgekeurd", "geplaatst"];
  
  const getStageCount = (stage: string) => {
    return applications.filter(app => app.pipeline_stage === stage).length;
  };

  const getConversionRate = (fromStage: string, toStage: string) => {
    const fromCount = applications.filter(app => {
      const stageIndex = stageOrder.indexOf(app.pipeline_stage);
      const fromIndex = stageOrder.indexOf(fromStage);
      return stageIndex >= fromIndex;
    }).length;
    
    const toCount = applications.filter(app => {
      const stageIndex = stageOrder.indexOf(app.pipeline_stage);
      const toIndex = stageOrder.indexOf(toStage);
      return stageIndex >= toIndex;
    }).length;
    
    return fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0;
  };

  // Average days per stage
  const getAverageDaysInStage = (stage: string) => {
    const stageApps = applications.filter(app => app.pipeline_stage === stage);
    
    if (stageApps.length === 0) return 0;
    
    const totalDays = stageApps.reduce((sum, app) => {
      const lastUpdate = new Date(app.updated_at || app.created_at);
      const now = new Date();
      const days = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
      return sum + days;
    }, 0);
    
    return Math.round(totalDays / stageApps.length);
  };

  // Identify bottleneck stage (longest average time)
  const bottleneckStage = stageOrder.reduce((max, stage) => {
    const days = getAverageDaysInStage(stage);
    return days > getAverageDaysInStage(max) ? stage : max;
  }, stageOrder[0]);

  const bottleneckDays = getAverageDaysInStage(bottleneckStage);

  const stageNames: Record<string, string> = {
    nieuw: "Nieuw",
    screening: "Screening",
    interview: "Interview",
    goedgekeurd: "Goedgekeurd",
    geplaatst: "Geplaatst",
  };

  // Recent placements (this week)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const placementsThisWeek = applications.filter(app => 
    app.pipeline_stage === 'geplaatst' && 
    new Date(app.updated_at || app.created_at) >= weekAgo
  ).length;

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  
  const placementsThisMonth = applications.filter(app => 
    app.pipeline_stage === 'geplaatst' && 
    new Date(app.updated_at || app.created_at) >= monthAgo
  ).length;

  // Overall conversion rate (nieuw → geplaatst)
  const overallConversion = getConversionRate("nieuw", "geplaatst");

  return (
    <div className="space-y-6">
      {/* Conversion Funnel */}
      <div>
        <h3 className="text-sm font-medium mb-3">Conversie Funnel</h3>
        <div className="space-y-3">
          {[
            { from: "nieuw", to: "screening", label: "Nieuw → Screening" },
            { from: "screening", to: "interview", label: "Screening → Interview" },
            { from: "interview", to: "goedgekeurd", label: "Interview → Goedgekeurd" },
            { from: "goedgekeurd", to: "geplaatst", label: "Goedgekeurd → Geplaatst" },
          ].map(({ from, to, label }) => {
            const rate = getConversionRate(from, to);
            return (
              <div key={label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{rate}%</span>
                </div>
                <Progress value={rate} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Average Lead Time */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Doorlooptijd</span>
            </div>
            <p className="text-2xl font-semibold">
              {Math.round(stageOrder.reduce((sum, stage) => sum + getAverageDaysInStage(stage), 0) / stageOrder.length)} d
            </p>
            <p className="text-xs text-muted-foreground mt-1">Gemiddeld per stage</p>
          </CardContent>
        </Card>

        {/* Bottleneck */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Bottleneck</span>
            </div>
            <p className="text-2xl font-semibold">{stageNames[bottleneckStage]}</p>
            <p className="text-xs text-muted-foreground mt-1">{bottleneckDays} dagen gemiddeld</p>
          </CardContent>
        </Card>

        {/* Placements This Week */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Deze Week</span>
            </div>
            <p className="text-2xl font-semibold">{placementsThisWeek}</p>
            <p className="text-xs text-muted-foreground mt-1">Plaatsingen</p>
          </CardContent>
        </Card>

        {/* Placements This Month */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Deze Maand</span>
            </div>
            <p className="text-2xl font-semibold">{placementsThisMonth}</p>
            <p className="text-xs text-muted-foreground mt-1">Plaatsingen</p>
          </CardContent>
        </Card>
      </div>

      {/* Overall Conversion */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Totale Conversie</p>
              <p className="text-3xl font-bold">{overallConversion}%</p>
              <p className="text-xs text-muted-foreground mt-1">Van aanmelding tot plaatsing</p>
            </div>
            <div className={`flex items-center gap-1 ${overallConversion >= 20 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {overallConversion >= 20 ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
