import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";

interface ScoreBreakdown {
  regio: { score: number; match: boolean; reason: string };
  sector: { 
    score: number; 
    match: boolean; 
    reason: string; 
    directMatches?: string[];
    relatedMatches?: string[];
  };
  doelgroep: { score: number; match: boolean; reason: string };
  functie: { score: number; match: boolean; reason: string };
  bureau: { score: number; match: boolean; reason: string };
}

interface MatchScoreBreakdownProps {
  breakdown: ScoreBreakdown;
  totalScore: number;
}

export function MatchScoreBreakdown({ breakdown, totalScore }: MatchScoreBreakdownProps) {
  const criteria = [
    { key: 'regio', label: 'Regio', weight: '30%', ...breakdown.regio },
    { key: 'sector', label: 'Sector', weight: '25%', ...breakdown.sector },
    { key: 'doelgroep', label: 'Doelgroep', weight: '20%', ...breakdown.doelgroep },
    { key: 'functie', label: 'Functieniveau', weight: '15%', ...breakdown.functie },
    { key: 'bureau', label: 'Bureau', weight: '10%', ...breakdown.bureau },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 25) return 'text-green-600';
    if (score >= 15) return 'text-yellow-600';
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

        {/* Criteria Breakdown */}
        <div className="space-y-3">
          {criteria.map((criterion) => {
            const maxScore = parseInt(criterion.weight);
            const percentage = (criterion.score / maxScore) * 100;
            
            return (
              <div key={criterion.key} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {criterion.key === 'sector' && breakdown.sector.relatedMatches && breakdown.sector.relatedMatches.length > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : criterion.match ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TooltipTrigger>
                        {criterion.key === 'sector' && breakdown.sector.relatedMatches && breakdown.sector.relatedMatches.length > 0 && (
                          <TooltipContent>
                            <p className="text-xs">
                              <span className="font-medium">Gerelateerde sectoren:</span><br />
                              {breakdown.sector.relatedMatches.map((rel, idx) => {
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
                                    {rel} ({SECTOR_REL_MAP[rel] || "gerelateerd"}){idx < breakdown.sector.relatedMatches!.length - 1 ? ', ' : ''}
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
                      {criterion.weight}
                    </Badge>
                  </div>
                  <span className={`font-semibold ${getScoreColor(criterion.score)}`}>
                    {criterion.score}/{maxScore}
                  </span>
                </div>
                
                <div className="relative">
                  <Progress 
                    value={percentage} 
                    className="h-2"
                  />
                  <div 
                    className={`absolute top-0 left-0 h-2 rounded-full transition-all ${
                      criterion.key === 'sector' && breakdown.sector.relatedMatches && breakdown.sector.relatedMatches.length > 0
                        ? 'bg-amber-500'
                        : getProgressColor(criterion.score, maxScore)
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
