import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Trophy, Star, GraduationCap, Info } from "lucide-react";
import { type ExpertAdvies, type CategoryContribution } from "@/lib/services/matchingService";
import { cn } from "@/lib/utils";

// Interface matching the actual service response
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
  klantVoorkeurBonus?: number; // NEW: Client expert preferences bonus
  aiBoost: number;
  totalScore: number;
  normalizedScore: number;
  categoryContributions?: {
    geschiktheid: CategoryContribution;
    locatie: CategoryContribution;
    ervaring: CategoryContribution;
    praktisch: CategoryContribution;
  };
  bonusTotal?: number;
  bonusPercentage?: number;
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
    klantVoorkeur?: { score: number; match: boolean; reason: string; matchedWerkstijlen?: string[]; matchedSpecialismen?: string[] };
    aiBoost?: { score: number; match: boolean; reason: string };
  };
}

interface MatchScoreBreakdownProps {
  breakdown: ServiceMatchBreakdown;
  totalScore: number;
}

// Apple-style category row with points/max display
function CategoryRow({ 
  label, 
  points, 
  max, 
  percentage,
  detail 
}: { 
  label: string; 
  points: number;
  max: number;
  percentage: number;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 group">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-foreground font-medium">{label}</span>
        {detail && (
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {detail}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {/* Progress bar - Apple style 4px */}
        <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-300",
              percentage >= 80 ? "bg-primary" : 
              percentage >= 50 ? "bg-primary/60" : 
              "bg-muted-foreground/30"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {/* Points display */}
        <span className="text-sm tabular-nums text-muted-foreground w-12 text-right">
          <span className={cn(
            "font-medium",
            percentage >= 80 ? "text-foreground" : "text-muted-foreground"
          )}>
            {points}
          </span>
          <span className="text-muted-foreground/60">/{max}</span>
        </span>
      </div>
    </div>
  );
}

// Helper: validate categoryContributions has correct structure (geschiktheid/locatie/ervaring/praktisch with points/max)
function hasValidCategoryStructure(cc: any): boolean {
  if (!cc || typeof cc !== 'object') return false;
  
  return (
    cc.geschiktheid && typeof cc.geschiktheid.points === 'number' && typeof cc.geschiktheid.max === 'number' &&
    cc.locatie && typeof cc.locatie.points === 'number' && typeof cc.locatie.max === 'number' &&
    cc.ervaring && typeof cc.ervaring.points === 'number' && typeof cc.ervaring.max === 'number' &&
    cc.praktisch && typeof cc.praktisch.points === 'number' && typeof cc.praktisch.max === 'number'
  );
}

// Helper: calculate fallback categories from breakdown scores
function calculateFallbackCategories(breakdown: ServiceMatchBreakdown | null | undefined) {
  return {
    geschiktheid: {
      points: (breakdown?.functieMatch || 0) + (breakdown?.sectorMatch || 0) + (breakdown?.doelgroepMatch || 0),
      max: 60,
      percentage: Math.round(((breakdown?.functieMatch || 0) + (breakdown?.sectorMatch || 0) + (breakdown?.doelgroepMatch || 0)) / 60 * 100)
    },
    locatie: {
      points: (breakdown?.regioMatch || 0) + (breakdown?.mobiliteitMatch || 0),
      max: 30,
      percentage: Math.round(((breakdown?.regioMatch || 0) + (breakdown?.mobiliteitMatch || 0)) / 30 * 100)
    },
    ervaring: {
      points: (breakdown?.beschrijvingMatch || 0) + (breakdown?.certificaatVereistMatch || 0),
      max: 25,
      percentage: Math.round(((breakdown?.beschrijvingMatch || 0) + (breakdown?.certificaatVereistMatch || 0)) / 25 * 100)
    },
    praktisch: {
      points: (breakdown?.beschikbaarheidMatch || 0) + (breakdown?.werkvormMatch || 0),
      max: 10,
      percentage: Math.round(((breakdown?.beschikbaarheidMatch || 0) + (breakdown?.werkvormMatch || 0)) / 10 * 100)
    }
  };
}

export function MatchScoreBreakdown({ breakdown, totalScore }: MatchScoreBreakdownProps) {
  // Use categoryContributions only if valid structure, else calculate fallback
  const categories = (breakdown?.categoryContributions && hasValidCategoryStructure(breakdown.categoryContributions))
    ? breakdown.categoryContributions
    : calculateFallbackCategories(breakdown);

  // Expert advies filtering
  const relevantExperts = breakdown?.expertAdvies?.filter(e => 
    e.score > 0 || (e as any).isLocationRelevant
  ) || [];

  // Calculate total bonus
  const bonusTotal = breakdown?.bonusTotal ?? (
    (breakdown?.trackRecordBonus || 0) + 
    (breakdown?.expertBonus || 0) + 
    (breakdown?.aiBoost || 0) +
    (breakdown?.klantVoorkeurBonus || 0)
  );

  return (
    <Card className="border-0 shadow-sm bg-background/95 backdrop-blur-sm">
      <CardContent className="p-4 space-y-3">
        {/* Hero Score - Apple style centered */}
        <div className="text-center py-3 border-b border-border/40">
          <div className="flex items-center justify-center gap-1">
            <span className="text-4xl font-light tracking-tight text-foreground">
              {totalScore}
            </span>
            <span className="text-xl text-muted-foreground font-light">%</span>
          </div>
          {bonusTotal > 0 && (
            <span className="text-xs text-green-600 font-medium">
              +{breakdown?.bonusPercentage || Math.round(bonusTotal * 0.2)}% bonus
            </span>
          )}
        </div>

        {/* Bonus Badges - Subtle pills */}
        {(breakdown?.hasTrackRecord || breakdown?.hasAIBoost || relevantExperts.length > 0) && (
          <div className="flex flex-wrap gap-1.5 justify-center pb-2 border-b border-border/30">
            {breakdown?.hasTrackRecord && breakdown.trackRecordBonus && breakdown.trackRecordBonus > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="gap-1 font-normal text-xs px-2 py-0.5 bg-muted/50">
                      <Trophy className="h-3 w-3 text-amber-500" />
                      +{breakdown.trackRecordBonus}
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
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {breakdown.details.trackRecord.avgRating.toFixed(1)}
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {relevantExperts.length > 0 && (breakdown?.expertBonus || 0) > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="gap-1 font-normal text-xs px-2 py-0.5 bg-muted/50">
                      <GraduationCap className="h-3 w-3 text-blue-500" />
                      +{breakdown?.expertBonus || 0}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    <div className="space-y-1.5">
                      <p className="font-medium">Expert Advies</p>
                      {relevantExperts.slice(0, 3).map((expert, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{expert.specialisme}</span>
                          <span className="tabular-nums">{expert.score}/{expert.maxScore}</span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {breakdown?.hasAIBoost && breakdown.aiBoost > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="gap-1 font-normal text-xs px-2 py-0.5 bg-muted/50">
                      <Sparkles className="h-3 w-3 text-violet-500" />
                      +{breakdown.aiBoost}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                    <p className="font-medium">AI Learning</p>
                    {(breakdown?.aiBoostReasons || []).slice(0, 2).map((reason, idx) => (
                      <p key={idx} className="text-muted-foreground">{reason}</p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {(breakdown?.klantVoorkeurBonus || 0) > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="gap-1 font-normal text-xs px-2 py-0.5 bg-muted/50">
                      <GraduationCap className="h-3 w-3 text-emerald-500" />
                      +{breakdown?.klantVoorkeurBonus}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                    <p className="font-medium">Klant Voorkeur</p>
                    {breakdown?.details?.klantVoorkeur?.matchedWerkstijlen?.slice(0, 2).map((ws, idx) => (
                      <p key={idx} className="text-muted-foreground">{ws}</p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {/* Category Breakdown - Apple style rows */}
        <div className="space-y-0 divide-y divide-border/20">
          <CategoryRow 
            label="Geschiktheid"
            points={categories.geschiktheid.points}
            max={categories.geschiktheid.max}
            percentage={categories.geschiktheid.percentage}
            detail={breakdown?.details?.functie?.reason?.slice(0, 20)}
          />
          <CategoryRow 
            label="Locatie"
            points={categories.locatie.points}
            max={categories.locatie.max}
            percentage={categories.locatie.percentage}
            detail={breakdown?.details?.regio?.afstandKm ? `~${breakdown.details.regio.afstandKm}km` : undefined}
          />
          <CategoryRow 
            label="Ervaring"
            points={categories.ervaring.points}
            max={categories.ervaring.max}
            percentage={categories.ervaring.percentage}
            detail={breakdown?.details?.beschrijving?.matchedKeywords?.length 
              ? `${breakdown.details.beschrijving.matchedKeywords.length} matches` 
              : undefined}
          />
          <CategoryRow 
            label="Praktisch"
            points={categories.praktisch.points}
            max={categories.praktisch.max}
            percentage={categories.praktisch.percentage}
            detail={breakdown?.details?.werkvorm?.reason}
          />
        </div>

        {/* Details toggle - Minimal */}
        {(breakdown?.details?.sector?.directMatches?.length || 
          breakdown?.details?.sector?.relatedMatches?.length ||
          breakdown?.details?.beschrijving?.matchedKeywords?.length) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="w-full">
                <div className="flex items-center justify-center gap-1 pt-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors">
                  <Info className="h-3 w-3" />
                  <span>Details</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <div className="space-y-2">
                  {breakdown?.details?.sector?.directMatches && breakdown.details.sector.directMatches.length > 0 && (
                    <div>
                      <p className="font-medium text-green-600">Sector</p>
                      <p className="text-muted-foreground">{breakdown.details.sector.directMatches.join(', ')}</p>
                    </div>
                  )}
                  {breakdown?.details?.sector?.relatedMatches && breakdown.details.sector.relatedMatches.length > 0 && (
                    <div>
                      <p className="font-medium text-amber-600">Gerelateerd</p>
                      <p className="text-muted-foreground">{breakdown.details.sector.relatedMatches.join(', ')}</p>
                    </div>
                  )}
                  {breakdown?.details?.beschrijving?.matchedKeywords && breakdown.details.beschrijving.matchedKeywords.length > 0 && (
                    <div>
                      <p className="font-medium text-blue-600">Ervaring</p>
                      <p className="text-muted-foreground">{breakdown.details.beschrijving.matchedKeywords.join(', ')}</p>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Low score hint */}
        {totalScore < 50 && (
          <p className="text-xs text-muted-foreground/60 text-center pt-1">
            Meer profieldata nodig
          </p>
        )}
      </CardContent>
    </Card>
  );
}
