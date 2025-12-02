import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, Calendar, Star, CheckCircle2, XCircle, 
  Clock, TrendingUp, Award
} from "lucide-react";
import { format, differenceInWeeks, differenceInMonths } from "date-fns";
import { nl } from "date-fns/locale";

interface AssignmentEvaluation {
  rating: number;
  feedback: string | null;
  would_rehire: boolean;
  created_at: string;
}

interface PlacementWithEvaluation {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  completed_at: string | null;
  weekly_hours: number | null;
  ai_match_score: number | null;
  client_sublocations: {
    naam: string;
    plaats: string | null;
    client_locations: {
      naam: string;
      client_organizations: {
        name: string;
      } | null;
    } | null;
  } | null;
  assignment_evaluations: AssignmentEvaluation[];
}

interface PlacementHistoryProps {
  professionalId: string;
  /** Only load data when this becomes true (lazy loading) */
  isActive?: boolean;
}

export function PlacementHistory({ professionalId, isActive = true }: PlacementHistoryProps) {
  const [placements, setPlacements] = useState<PlacementWithEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // Lazy load: only fetch when tab becomes active for the first time
    if (isActive && !hasLoaded) {
      loadPlacements();
      setHasLoaded(true);
    }
  }, [professionalId, isActive, hasLoaded]);

  const loadPlacements = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("assignments")
        .select(`
          id,
          status,
          start_date,
          end_date,
          completed_at,
          weekly_hours,
          ai_match_score,
          client_sublocations (
            naam,
            plaats,
            client_locations (
              naam,
              client_organizations (
                name
              )
            )
          ),
          assignment_evaluations (
            rating,
            feedback,
            would_rehire,
            created_at
          )
        `)
        .eq("professional_id", professionalId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      if (error) throw error;
      // Normalize the data - assignment_evaluations can be object or array
      const normalizedData = (data || []).map((p: any) => ({
        ...p,
        assignment_evaluations: Array.isArray(p.assignment_evaluations) 
          ? p.assignment_evaluations 
          : p.assignment_evaluations ? [p.assignment_evaluations] : []
      }));
      setPlacements(normalizedData as PlacementWithEvaluation[]);
    } catch (error) {
      console.error("Error loading placements:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats
  const totalPlacements = placements.length;
  const ratingsWithValues = placements
    .filter(p => p.assignment_evaluations && p.assignment_evaluations.length > 0)
    .map(p => p.assignment_evaluations![0].rating);
  const avgRating = ratingsWithValues.length > 0 
    ? ratingsWithValues.reduce((a, b) => a + b, 0) / ratingsWithValues.length 
    : 0;
  const wouldRehireCount = placements.filter(
    p => p.assignment_evaluations && p.assignment_evaluations.length > 0 && p.assignment_evaluations[0].would_rehire
  ).length;
  const avgDurationWeeks = placements
    .filter(p => p.start_date && p.end_date)
    .reduce((acc, p) => {
      const weeks = differenceInWeeks(new Date(p.end_date!), new Date(p.start_date!));
      return acc + weeks;
    }, 0) / (placements.filter(p => p.start_date && p.end_date).length || 1);

  const formatDuration = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return "-";
    const weeks = differenceInWeeks(new Date(endDate), new Date(startDate));
    if (weeks >= 8) {
      const months = differenceInMonths(new Date(endDate), new Date(startDate));
      return `${months} maand${months !== 1 ? "en" : ""}`;
    }
    return `${weeks} ${weeks === 1 ? "week" : "weken"}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background border-blue-100 dark:border-blue-900/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{totalPlacements}</div>
            <div className="text-xs text-muted-foreground">Totaal plaatsingen</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-yellow-50/80 to-white/60 dark:from-yellow-950/30 dark:to-background border-yellow-100 dark:border-yellow-900/50">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <span className="text-2xl font-bold text-yellow-600">
                {avgRating > 0 ? avgRating.toFixed(1) : "-"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">Gem. rating</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-50/80 to-white/60 dark:from-green-950/30 dark:to-background border-green-100 dark:border-green-900/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {ratingsWithValues.length > 0 
                ? Math.round((wouldRehireCount / ratingsWithValues.length) * 100) 
                : 0}%
            </div>
            <div className="text-xs text-muted-foreground">Herplaatsbaar</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-50/80 to-white/60 dark:from-purple-950/30 dark:to-background border-purple-100 dark:border-purple-900/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {avgDurationWeeks > 0 ? Math.round(avgDurationWeeks) : "-"}
            </div>
            <div className="text-xs text-muted-foreground">Gem. weken</div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Placements List */}
      <div>
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Voltooide Plaatsingen ({totalPlacements})
        </h3>
        
        {placements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Nog geen voltooide plaatsingen</p>
          </div>
        ) : (
          <div className="space-y-3">
            {placements.map((placement) => {
              const evaluation = placement.assignment_evaluations?.[0];
              const sublocation = placement.client_sublocations;
              const location = sublocation?.client_locations;
              const organization = location?.client_organizations;
              
              return (
                <Card key={placement.id} className="hover:bg-muted/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Location Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium truncate">
                            {sublocation?.naam || "Onbekend"}
                          </span>
                        </div>
                        
                        <div className="text-sm text-muted-foreground mt-1">
                          {sublocation?.plaats && <span>{sublocation.plaats}</span>}
                          {organization?.name && (
                            <span className="ml-1">• {organization.name}</span>
                          )}
                        </div>

                        {/* Period */}
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {placement.start_date && (
                            <span>
                              {format(new Date(placement.start_date), "d MMM yy", { locale: nl })}
                            </span>
                          )}
                          {placement.end_date && (
                            <>
                              <span>→</span>
                              <span>
                                {format(new Date(placement.end_date), "d MMM yy", { locale: nl })}
                              </span>
                            </>
                          )}
                          <span className="text-muted-foreground/70">
                            ({formatDuration(placement.start_date, placement.end_date)})
                          </span>
                        </div>
                      </div>

                      {/* Rating & Rehire Indicator */}
                      <div className="flex flex-col items-end gap-2">
                        {evaluation ? (
                          <>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-4 w-4 ${
                                    star <= evaluation.rating
                                      ? "fill-yellow-400 text-yellow-400"
                                      : "text-muted-foreground/30"
                                  }`}
                                />
                              ))}
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                evaluation.would_rehire
                                  ? "bg-green-500/10 text-green-700 border-green-200 text-xs"
                                  : "bg-red-500/10 text-red-700 border-red-200 text-xs"
                              }
                            >
                              {evaluation.would_rehire ? (
                                <><CheckCircle2 className="h-3 w-3 mr-1" />Herplaatsen</>
                              ) : (
                                <><XCircle className="h-3 w-3 mr-1" />Niet herplaatsen</>
                              )}
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Niet geëvalueerd
                          </Badge>
                        )}
                        
                        {placement.ai_match_score && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Award className="h-3 w-3" />
                            <span>Match: {Math.round(placement.ai_match_score)}%</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Feedback if available */}
                    {evaluation?.feedback && (
                      <div className="mt-3 p-2 bg-muted/50 rounded text-sm text-muted-foreground italic">
                        "{evaluation.feedback}"
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
