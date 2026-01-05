import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Calendar, Users, Target } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Button } from "@/components/ui/button";

interface CitoZorgStats {
  total_count: number;
  today_count: number;
  week_count: number;
  avg_completeness: number;
  interview_eligible: number;
  with_regio: number;
  with_beschikbaarheid: number;
  with_opleiding: number;
  with_ervaring: number;
  last_application_at: string | null;
}

interface DirectStats {
  avg_completeness: number;
  total_count: number;
}

export function CitoZorgIntegrationMonitor() {
  const { data: citoStats, isLoading: citoLoading, refetch } = useQuery({
    queryKey: ['citozorg-integration-stats'],
    queryFn: async (): Promise<CitoZorgStats> => {
      const { data, error } = await supabase
        .from('professional_applications')
        .select('completeness_score, extracted_data, created_at')
        .eq('source_project', 'citozorg')
        .is('deleted_at', null);

      if (error) throw error;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const apps = data || [];
      
      const getExtractedField = (app: typeof apps[0], field: string): boolean => {
        const extracted = app.extracted_data as Record<string, unknown> | null;
        return extracted ? Boolean(extracted[field]) : false;
      };
      
      return {
        total_count: apps.length,
        today_count: apps.filter(a => new Date(a.created_at) >= todayStart).length,
        week_count: apps.filter(a => new Date(a.created_at) >= weekStart).length,
        avg_completeness: apps.length > 0 
          ? Math.round(apps.reduce((sum, a) => sum + (a.completeness_score || 0), 0) / apps.length)
          : 0,
        interview_eligible: apps.filter(a => (a.completeness_score || 0) >= 85).length,
        with_regio: apps.filter(a => getExtractedField(a, 'gewenste_regio')).length,
        with_beschikbaarheid: apps.filter(a => getExtractedField(a, 'beschikbaarheid')).length,
        with_opleiding: apps.filter(a => getExtractedField(a, 'opleiding')).length,
        with_ervaring: apps.filter(a => getExtractedField(a, 'ervaring')).length,
        last_application_at: apps.length > 0 
          ? apps.reduce((latest, a) => 
              new Date(a.created_at) > new Date(latest) ? a.created_at : latest, 
              apps[0].created_at
            )
          : null
      };
    },
    refetchInterval: 60000, // Auto-refresh every 60 seconds
  });

  const { data: directStats, isLoading: directLoading } = useQuery({
    queryKey: ['direct-applications-stats'],
    queryFn: async (): Promise<DirectStats> => {
      const { data, error } = await supabase
        .from('professional_applications')
        .select('completeness_score')
        .or('source_project.is.null,source_project.neq.citozorg')
        .is('deleted_at', null);

      if (error) throw error;

      const apps = data || [];
      return {
        total_count: apps.length,
        avg_completeness: apps.length > 0 
          ? Math.round(apps.reduce((sum, a) => sum + (a.completeness_score || 0), 0) / apps.length)
          : 0
      };
    },
  });

  const isLoading = citoLoading || directLoading;

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const stats = citoStats || {
    total_count: 0,
    today_count: 0,
    week_count: 0,
    avg_completeness: 0,
    interview_eligible: 0,
    with_regio: 0,
    with_beschikbaarheid: 0,
    with_opleiding: 0,
    with_ervaring: 0,
    last_application_at: null
  };

  const direct = directStats || { avg_completeness: 0, total_count: 0 };
  const scoreDiff = stats.avg_completeness - direct.avg_completeness;
  const interviewRate = stats.week_count > 0 
    ? Math.round((stats.interview_eligible / stats.total_count) * 100) 
    : 0;

  const getFieldPercentage = (filled: number) => 
    stats.total_count > 0 ? Math.round((filled / stats.total_count) * 100) : 0;

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "bg-emerald-500";
    if (percentage >= 50) return "bg-amber-500";
    return "bg-destructive";
  };

  const FieldProgress = ({ label, filled }: { label: string; filled: number }) => {
    const percentage = getFieldPercentage(filled);
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{percentage}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${getProgressColor(percentage)}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">CitoZorg Integratie</span>
            <Badge 
              variant={stats.total_count > 0 ? "default" : "secondary"}
              className="h-5 text-[10px]"
            >
              {stats.total_count > 0 ? "Actief" : "Geen data"}
            </Badge>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="text-lg font-semibold">{stats.today_count}</div>
            <div className="text-[10px] text-muted-foreground">Vandaag</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="text-lg font-semibold">{stats.week_count}</div>
            <div className="text-[10px] text-muted-foreground">Week</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="text-lg font-semibold">{stats.total_count}</div>
            <div className="text-[10px] text-muted-foreground">Totaal</div>
          </div>
        </div>

        {/* Last Application */}
        {stats.last_application_at && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>
              Laatste: {formatDistanceToNow(new Date(stats.last_application_at), { 
                addSuffix: true, 
                locale: nl 
              })}
            </span>
          </div>
        )}

        {/* Field Quality */}
        {stats.total_count > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Veldkwaliteit (na upgrade)
            </div>
            <div className="space-y-2">
              <FieldProgress label="Gewenste regio" filled={stats.with_regio} />
              <FieldProgress label="Beschikbaarheid" filled={stats.with_beschikbaarheid} />
              <FieldProgress label="Opleiding" filled={stats.with_opleiding} />
              <FieldProgress label="Ervaring" filled={stats.with_ervaring} />
            </div>
          </div>
        )}

        {/* Score Comparison */}
        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Score Analyse</div>
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-lg font-semibold">{stats.avg_completeness}%</div>
              <div className="text-[10px] text-muted-foreground">CitoZorg</div>
            </div>
            <div className="flex items-center gap-1">
              {scoreDiff > 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : scoreDiff < 0 ? (
                <TrendingDown className="h-4 w-4 text-destructive" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={`text-sm font-medium ${
                scoreDiff > 0 ? 'text-emerald-500' : 
                scoreDiff < 0 ? 'text-destructive' : 
                'text-muted-foreground'
              }`}>
                {scoreDiff > 0 ? '+' : ''}{scoreDiff}%
              </span>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{direct.avg_completeness}%</div>
              <div className="text-[10px] text-muted-foreground">Direct</div>
            </div>
          </div>
        </div>

        {/* Interview Triggers */}
        {stats.total_count > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                Interview Triggers (≥85%)
              </span>
              <span className="font-medium">
                {stats.interview_eligible} van {stats.total_count} ({interviewRate}%)
              </span>
            </div>
            <Progress value={interviewRate} size="sm" className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
