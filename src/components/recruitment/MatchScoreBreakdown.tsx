import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";

// Interface matching the actual service response (MatchScoreBreakdown from matchingService.ts)
interface ServiceMatchBreakdown {
  functieMatch: number;
  regioMatch: number;
  sectorMatch: number;
  doelgroepMatch: number;
  mobiliteitMatch: number;
  beschikbaarheidMatch: number;
  werkvormMatch: number;
  aiBoost: number;
  totalScore: number;
  normalizedScore: number;
  hasAIBoost: boolean;
  aiBoostReasons: string[];
  details: {
    functie?: { match: boolean; reason: string };
    regio?: { match: boolean; reason: string; matchType?: string };
    sector?: { match: boolean; reason: string; directMatches?: string[]; relatedMatches?: string[] };
    doelgroep?: { match: boolean; reason: string; directMatches?: string[]; relatedMatches?: string[] };
    mobiliteit?: { match: boolean; reason: string };
    beschikbaarheid?: { match: boolean; reason: string };
    werkvorm?: { match: boolean; reason: string };
    aiBoost?: { score: number; match: boolean; reason: string };
  };
}

interface MatchScoreBreakdownProps {
  breakdown: ServiceMatchBreakdown;
  totalScore: number;
}

export function MatchScoreBreakdown({ breakdown, totalScore }: MatchScoreBreakdownProps) {
  // Default values for missing breakdown properties
  const defaultDetail = { match: false, reason: 'Geen data beschikbaar' };
  
  // Map top-level scores with details into combined criteria
  const criteria = [
    { 
      key: 'functie', 
      label: 'Functieniveau', 
      maxScore: 25, 
      score: breakdown?.functieMatch ?? 0,
      match: breakdown?.details?.functie?.match ?? false,
      reason: breakdown?.details?.functie?.reason ?? 'Geen data beschikbaar'
    },
    { 
      key: 'regio', 
      label: 'Regio', 
      maxScore: 20, 
      score: breakdown?.regioMatch ?? 0,
      match: breakdown?.details?.regio?.match ?? false,
      reason: breakdown?.details?.regio?.reason ?? 'Geen data beschikbaar'
    },
    { 
      key: 'sector', 
      label: 'Sector', 
      maxScore: 20, 
      score: breakdown?.sectorMatch ?? 0,
      match: breakdown?.details?.sector?.match ?? false,
      reason: breakdown?.details?.sector?.reason ?? 'Geen data beschikbaar',
      directMatches: breakdown?.details?.sector?.directMatches ?? [],
      relatedMatches: breakdown?.details?.sector?.relatedMatches ?? []
    },
    { 
      key: 'doelgroep', 
      label: 'Doelgroep', 
      maxScore: 15, 
      score: breakdown?.doelgroepMatch ?? 0,
      match: breakdown?.details?.doelgroep?.match ?? false,
      reason: breakdown?.details?.doelgroep?.reason ?? 'Geen data beschikbaar',
      directMatches: breakdown?.details?.doelgroep?.directMatches ?? [],
      relatedMatches: breakdown?.details?.doelgroep?.relatedMatches ?? []
    },
    { 
      key: 'mobiliteit', 
      label: 'Mobiliteit', 
      maxScore: 10, 
      score: breakdown?.mobiliteitMatch ?? 0,
      match: breakdown?.details?.mobiliteit?.match ?? false,
      reason: breakdown?.details?.mobiliteit?.reason ?? 'Geen data beschikbaar'
    },
    { 
      key: 'beschikbaarheid', 
      label: 'Beschikbaarheid', 
      maxScore: 5, 
      score: breakdown?.beschikbaarheidMatch ?? 0,
      match: breakdown?.details?.beschikbaarheid?.match ?? false,
      reason: breakdown?.details?.beschikbaarheid?.reason ?? 'Geen data beschikbaar'
    },
    { 
      key: 'werkvorm', 
      label: 'Werkvorm', 
      maxScore: 5, 
      score: breakdown?.werkvormMatch ?? 0,
      match: breakdown?.details?.werkvorm?.match ?? false,
      reason: breakdown?.details?.werkvorm?.reason ?? 'Geen data beschikbaar'
    },
  ];

  // Get sector details for tooltip
  const sectorDetails = breakdown?.details?.sector;

  const getScoreColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-4">
        {/* Total Score */}
        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
          <span className="text-sm font-medium">Totale Match Score</span>
          <Badge variant="outline" className="text-base font-bold">
            {totalScore}%
          </Badge>
        </div>

        {/* AI Boost indicator */}
        {breakdown?.hasAIBoost && breakdown.aiBoost > 0 && (
          <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <span className="text-xs text-purple-700 dark:text-purple-300 font-medium">
              AI Learning Boost: +{breakdown.aiBoost} punten
            </span>
          </div>
        )}

        {/* Criteria Breakdown */}
        <div className="space-y-3">
          {criteria.map((criterion) => {
            const percentage = criterion.maxScore > 0 ? (criterion.score / criterion.maxScore) * 100 : 0;
            const hasRelatedMatches = criterion.key === 'sector' && sectorDetails?.relatedMatches && sectorDetails.relatedMatches.length > 0;
            
            return (
              <div key={criterion.key} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {hasRelatedMatches ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : criterion.match ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TooltipTrigger>
                        {hasRelatedMatches && (
                          <TooltipContent>
                            <p className="text-xs">
                              <span className="font-medium">Gerelateerde sectoren:</span><br />
                              {sectorDetails!.relatedMatches!.map((rel, idx) => {
                                const SECTOR_REL_MAP: Record<string, string> = {
                                  "GHZ": "60% gerelateerd aan GGZ/Jeugdzorg",
                                  "GGZ": "60% gerelateerd aan GHZ/Verslavingszorg",
                                  "VVT": "70% gerelateerd aan Thuiszorg/Ziekenhuis",
                                  "Thuiszorg": "70% gerelateerd aan VVT/Ziekenhuis",
                                  "Jeugdzorg": "50% gerelateerd aan GHZ/GGZ",
                                  "Ziekenhuis/Klinisch": "60% gerelateerd aan VVT/Thuiszorg",
                                  "Verslavingszorg": "60% gerelateerd aan GGZ"
                                };
                                return (
                                  <span key={idx}>
                                    {rel} ({SECTOR_REL_MAP[rel] || "gerelateerd"}){idx < sectorDetails!.relatedMatches!.length - 1 ? ', ' : ''}
                                  </span>
                                );
                              })}
                            </p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                    <span className="font-medium">{criterion.label}</span>
                    <Badge variant="outline" className="text-xs">
                      max {criterion.maxScore}
                    </Badge>
                  </div>
                  <span className={`font-semibold ${getScoreColor(criterion.score, criterion.maxScore)}`}>
                    {criterion.score}/{criterion.maxScore}
                  </span>
                </div>
                
                <div className="relative">
                  <Progress 
                    value={percentage} 
                    className="h-2"
                  />
                  <div 
                    className={`absolute top-0 left-0 h-2 rounded-full transition-all ${
                      hasRelatedMatches
                        ? 'bg-amber-500'
                        : getProgressColor(criterion.score, criterion.maxScore)
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                
                <p className="text-xs text-muted-foreground pl-6">
                  {criterion.reason}
                </p>
              </div>
            );
          })}
        </div>

        {/* Missing Data Warning */}
        {totalScore < 50 && (
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-yellow-700">
                Lage match score - ontbrekende data
              </p>
              <p className="text-xs text-muted-foreground">
                Voeg meer gegevens toe aan het kandidaat profiel voor betere matches.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
