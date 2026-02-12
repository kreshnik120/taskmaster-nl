import { Sparkles, UserPlus, ChevronDown, ChevronUp, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { useDienstMatching } from "@/hooks/useDienstMatching";
import { useAgentDienstMatching } from "@/hooks/useAgentDienstMatching";
import type { AgentMatchResult } from "@/hooks/useAgentDienstMatching";
import type { DienstData } from "@/hooks/useDienstenPlanning";
import type { MatchResult } from "@/hooks/useDienstMatching";
import { useState } from "react";

interface DienstMatchingSuggestiesProps {
  dienst: DienstData;
  onAssign: (professionalId: string) => void;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-slate-500 dark:text-slate-400";
}

function scoreBorderBg(score: number): string {
  if (score >= 70) return "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30";
  if (score >= 50) return "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30";
  return "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/30";
}

const breakdownLabels = [
  { key: "functieNiveau" as const, label: "Functieniveau", max: 30 },
  { key: "beschikbaarheid" as const, label: "Beschikbaarheid", max: 25 },
  { key: "certificeringen" as const, label: "Certificeringen", max: 20 },
  { key: "regio" as const, label: "Regio", max: 15 },
  { key: "historie" as const, label: "Historie", max: 10 },
];

const agentBreakdownLabels = [
  { key: "functie_niveau" as const, label: "Functieniveau", max: 30 },
  { key: "beschikbaarheid" as const, label: "Beschikbaarheid", max: 25 },
  { key: "certificeringen" as const, label: "Certificeringen", max: 20 },
  { key: "regio" as const, label: "Regio", max: 15 },
  { key: "historie" as const, label: "Historie", max: 10 },
];

function MatchRow({ match, onAssign }: { match: MatchResult; onAssign: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-colors group">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-semibold shrink-0 cursor-help",
              scoreBorderBg(match.totalScore),
              scoreColor(match.totalScore)
            )}>
              {match.totalScore}
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="w-56 p-3">
            <p className="text-xs font-semibold mb-2">Score breakdown</p>
            <div className="space-y-1.5">
              {breakdownLabels.map(({ key, label, max }) => (
                <div key={key} className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{match.breakdown[key]}/{max}</span>
                  </div>
                  <Progress value={(match.breakdown[key] / max) * 100} className="h-1" />
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {match.professional.full_name}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>{match.professional.functie_niveau}</span>
          {match.professional.regio && (
            <>
              <span>·</span>
              <span>{match.professional.regio}</span>
            </>
          )}
        </div>
        {match.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {match.reasons.map((reason, i) => (
              <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal">
                {reason}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-violet-600 dark:text-violet-400 hover:text-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/30"
        onClick={onAssign}
      >
        <UserPlus className="h-3.5 w-3.5 mr-1" />
        Toewijzen
      </Button>
    </div>
  );
}

export function DienstMatchingSuggesties({ dienst, onAssign }: DienstMatchingSuggestiesProps) {
  const { matches, isLoading } = useDienstMatching(dienst);
  const [expanded, setExpanded] = useState(true);
  const { isAnalyzing, agentMatches, executionTime, error: agentError, runAnalysis, clearResults } = useAgentDienstMatching();
  const hasAgentResults = agentMatches.length > 0;

  if (["geannuleerd", "voltooid", "volledig_bezet"].includes(dienst.status)) {
    return null;
  }

  if (isLoading) return null;

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50/30 dark:bg-violet-900/10">
      {/* Header */}
      <button
        className="flex items-center justify-between w-full px-4 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-foreground">AI Suggesties</span>
          {matches.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-violet-100 dark:bg-violet-800/40 text-violet-700 dark:text-violet-300">
              {matches.length}
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <>
          {matches.length === 0 ? (
            <div className="px-4 pb-4">
              <p className="text-xs text-muted-foreground">
                Geen passende professionals gevonden voor deze dienst.
              </p>
            </div>
          ) : (
            <div className="px-1 pb-2 space-y-0.5">
              {matches.map((match) => (
                <MatchRow
                  key={match.professional.id}
                  match={match}
                  onAssign={() => onAssign(match.professional.id)}
                />
              ))}
            </div>
          )}

          {/* Server-side diepere analyse */}
          <div className="px-4 pb-4 pt-1">
            {!hasAgentResults ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                onClick={() => runAnalysis(dienst)}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Diepere analyse...
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    Diepere analyse (met werkhistorie)
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-xs font-semibold text-foreground">Server-side analyse</span>
                    {executionTime && (
                      <span className="text-[10px] text-muted-foreground">({executionTime}ms)</span>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={clearResults}>
                    Sluiten
                  </Button>
                </div>

                <div className="space-y-0.5">
                  {agentMatches.map((m) => (
                    <div key={m.professional_id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-colors group">
                      <div className={cn(
                        "w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-semibold shrink-0",
                        scoreBorderBg(m.total_score),
                        scoreColor(m.total_score)
                      )}>
                        {m.total_score}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate block">{m.full_name}</span>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span>{m.functie_niveau}</span>
                          {m.breakdown.historie > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-violet-600 dark:text-violet-400 font-medium">
                                Historie: {m.breakdown.historie}/10
                              </span>
                            </>
                          )}
                        </div>
                        {m.reasons.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {m.reasons.map((reason, i) => (
                              <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-violet-600 dark:text-violet-400 hover:text-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                        onClick={() => onAssign(m.professional_id)}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        Toewijzen
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {agentError && (
              <p className="text-xs text-destructive mt-2">{agentError}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
