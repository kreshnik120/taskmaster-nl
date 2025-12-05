import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Trophy, Star, GraduationCap, Info } from "lucide-react";
import { type ExpertAdvies } from "@/lib/services/matchingService";
import { cn } from "@/lib/utils";

// Interface matching the actual service response (MatchScoreBreakdown from matchingService.ts)
interface ServiceMatchBreakdown {
  functieMatch: number;
  regioMatch: number;
  sectorMatch: number;
  doelgroepMatch: number;
  mobiliteitMatch: number;
  beschikbaarheidMatch: number;
  werkvormMatch: number;
  beschrijvingMatch?: number;
  certificaatVereistMatch?: number;
  trackRecordBonus?: number;
  expertBonus?: number;
  aiBoost: number;
  totalScore: number;
  normalizedScore: number;
  hasAIBoost: boolean;
  hasTrackRecord?: boolean;
  hasExpertAdvies?: boolean;
  expertAdvies?: ExpertAdvies[];
  aiBoostReasons: string[];
  details: {
    functie?: { match: boolean; reason: string };
    regio?: { match: boolean; reason: string; matchType?: string; afstandKm?: number };
    sector?: { match: boolean; reason: string; directMatches?: string[]; relatedMatches?: string[] };
    doelgroep?: { match: boolean; reason: string; directMatches?: string[]; relatedMatches?: string[] };
    mobiliteit?: { match: boolean; reason: string };
    beschikbaarheid?: { match: boolean; reason: string };
    werkvorm?: { match: boolean; reason: string };
    beschrijving?: { match: boolean; reason: string; matchedKeywords?: string[] };
    certificaatVereist?: { match: boolean; reason: string; matchedCerts?: string[]; missingCerts?: string[] };
    trackRecord?: { score: number; match: boolean; reason: string; wouldRehireRate?: number; avgRating?: number };
    expertAdvies?: { score: number; match: boolean; reason: string; expertCount: number };
    aiBoost?: { score: number; match: boolean; reason: string };
  };
}

interface MatchScoreBreakdownProps {
  breakdown: ServiceMatchBreakdown;
  totalScore: number;
}

// Apple-style minimalist score indicator
function ScoreIndicator({ score, label, sublabel }: { score: number; label: string; sublabel?: string }) {
  const getScoreStyle = (s: number) => {
    if (s >= 80) return 'text-foreground';
    if (s >= 50) return 'text-muted-foreground';
    return 'text-muted-foreground/60';
  };

  const getBarColor = (s: number) => {
    if (s >= 80) return 'bg-primary';
    if (s >= 50) return 'bg-muted-foreground/40';
    return 'bg-muted-foreground/20';
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <span className="text-sm text-foreground">{label}</span>
        {sublabel && (
          <span className="text-xs text-muted-foreground ml-2">{sublabel}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn("h-full rounded-full transition-all", getBarColor(score))}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className={cn("text-sm font-medium w-8 text-right", getScoreStyle(score))}>
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}

export function MatchScoreBreakdown({ breakdown, totalScore }: MatchScoreBreakdownProps) {
  // Condensed criteria groups for Apple minimalism
  const geschiktheid = Math.round(
    ((breakdown?.functieMatch || 0) / 25 * 40 + (breakdown?.sectorMatch || 0) / 20 * 30 + (breakdown?.doelgroepMatch || 0) / 15 * 30) / 100 * 100
  );
  
  const locatie = Math.round(
    ((breakdown?.regioMatch || 0) / 20 * 70 + (breakdown?.mobiliteitMatch || 0) / 10 * 30) / 100 * 100
  );
  
  const ervaring = Math.round(
    ((breakdown?.beschrijvingMatch || 0) / 15 * 50 + (breakdown?.certificaatVereistMatch || 0) / 8 * 50) / 100 * 100
  );
  
  const praktisch = Math.round(
    ((breakdown?.beschikbaarheidMatch || 0) / 5 * 60 + (breakdown?.werkvormMatch || 0) / 3 * 40) / 100 * 100
  );

  // Get sublabels from details
  const geschiktheidSub = breakdown?.details?.functie?.reason || '';
  const locatieSub = breakdown?.details?.regio?.afstandKm 
    ? `~${breakdown.details.regio.afstandKm} km` 
    : breakdown?.details?.regio?.reason || '';
  const ervaringSub = breakdown?.details?.beschrijving?.matchedKeywords?.length 
    ? `${breakdown.details.beschrijving.matchedKeywords.length} matches`
    : '';
  const praktischSub = breakdown?.details?.beschikbaarheid?.reason || '';

  // Expert advies filtering
  const relevantExperts = breakdown?.expertAdvies?.filter(e => 
    e.score > 0 || (e as any).isLocationRelevant
  ) || [];

  return (
    <Card className="border-border/40">
      <CardContent className="p-4 space-y-4">
        {/* Total Score - Minimal */}
        <div className="flex items-center justify-between pb-3 border-b border-border/30">
          <span className="text-sm text-muted-foreground">Match Score</span>
          <span className="text-2xl font-semibold tracking-tight">{totalScore}%</span>
        </div>

        {/* Bonus Indicators - Subtle */}
        {(breakdown?.hasTrackRecord || breakdown?.hasAIBoost || relevantExperts.length > 0) && (
          <div className="flex flex-wrap gap-2 pb-3 border-b border-border/30">
            {breakdown?.hasTrackRecord && breakdown.trackRecordBonus && breakdown.trackRecordBonus > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <Trophy className="h-3 w-3" />
                      +{breakdown.trackRecordBonus}
                      {breakdown.details?.trackRecord?.wouldRehireRate !== undefined && (
                        <span className="text-muted-foreground ml-1">
                          ({breakdown.details.trackRecord.wouldRehireRate.toFixed(0)}%)
                        </span>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <div className="space-y-1">
                      <p className="font-medium">Track Record</p>
                      {breakdown.details?.trackRecord?.wouldRehireRate !== undefined && (
                        <p>{breakdown.details.trackRecord.wouldRehireRate.toFixed(0)}% zou opnieuw inhuren</p>
                      )}
                      {breakdown.details?.trackRecord?.avgRating && (
                        <p className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-current" />
                          {breakdown.details.trackRecord.avgRating.toFixed(1)} gemiddelde rating
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {relevantExperts.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <GraduationCap className="h-3 w-3" />
                      +{breakdown.expertBonus || 0}
                      <span className="text-muted-foreground">({relevantExperts.length})</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    <div className="space-y-2">
                      <p className="font-medium">Expert Advies</p>
                      {relevantExperts.slice(0, 3).map((expert, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-4">
                          <span>{expert.specialisme}</span>
                          <span className="text-muted-foreground">{expert.score}/{expert.maxScore}</span>
                        </div>
                      ))}
                      {relevantExperts.length > 3 && (
                        <p className="text-muted-foreground">+{relevantExperts.length - 3} meer</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {breakdown?.hasAIBoost && breakdown.aiBoost > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <Sparkles className="h-3 w-3" />
                      +{breakdown.aiBoost}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <p className="font-medium">AI Learning Boost</p>
                    {breakdown.aiBoostReasons.slice(0, 2).map((reason, idx) => (
                      <p key={idx} className="text-muted-foreground">{reason}</p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {/* Core Metrics - Clean list */}
        <div className="space-y-0">
          <ScoreIndicator 
            score={geschiktheid} 
            label="Geschiktheid" 
            sublabel={geschiktheidSub}
          />
          <ScoreIndicator 
            score={locatie} 
            label="Locatie" 
            sublabel={locatieSub}
          />
          <ScoreIndicator 
            score={ervaring} 
            label="Ervaring" 
            sublabel={ervaringSub}
          />
          <ScoreIndicator 
            score={praktisch} 
            label="Praktisch" 
            sublabel={praktischSub}
          />
        </div>

        {/* Detailed breakdown toggle - Optional */}
        {(breakdown?.details?.sector?.directMatches?.length || 
          breakdown?.details?.sector?.relatedMatches?.length ||
          breakdown?.details?.beschrijving?.matchedKeywords?.length) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="w-full">
                <div className="flex items-center justify-center gap-1 pt-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <Info className="h-3 w-3" />
                  <span>Details</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm text-xs">
                <div className="space-y-2">
                  {breakdown?.details?.sector?.directMatches?.length > 0 && (
                    <div>
                      <p className="font-medium text-green-600">Sector match</p>
                      <p>{breakdown.details.sector.directMatches.join(', ')}</p>
                    </div>
                  )}
                  {breakdown?.details?.sector?.relatedMatches?.length > 0 && (
                    <div>
                      <p className="font-medium text-amber-600">Gerelateerde sector</p>
                      <p>{breakdown.details.sector.relatedMatches.join(', ')}</p>
                    </div>
                  )}
                  {breakdown?.details?.beschrijving?.matchedKeywords?.length > 0 && (
                    <div>
                      <p className="font-medium text-blue-600">Ervaring matches</p>
                      <p>{breakdown.details.beschrijving.matchedKeywords.join(', ')}</p>
                    </div>
                  )}
                  {breakdown?.details?.certificaatVereist?.matchedCerts?.length > 0 && (
                    <div>
                      <p className="font-medium text-purple-600">Certificaten</p>
                      <p>{breakdown.details.certificaatVereist.matchedCerts.join(', ')}</p>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Low score hint - Minimal */}
        {totalScore < 50 && (
          <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border/30">
            Meer profieldata nodig voor betere matches
          </p>
        )}
      </CardContent>
    </Card>
  );
}
