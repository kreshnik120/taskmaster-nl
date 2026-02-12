import { Sparkles, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { useDienstMatching } from "@/hooks/useDienstMatching";
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

function scoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-slate-400";
}

const breakdownLabels = [
  { key: "functieNiveau" as const, label: "Functieniveau", max: 30 },
  { key: "beschikbaarheid" as const, label: "Beschikbaarheid", max: 25 },
  { key: "certificeringen" as const, label: "Certificeringen", max: 20 },
  { key: "regio" as const, label: "Regio", max: 15 },
  { key: "historie" as const, label: "Historie", max: 10 },
];

function MatchRow({ match, onAssign }: { match: MatchResult; onAssign: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-colors group">
      {/* Score cirkel */}
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
                  <Progress
                    value={(match.breakdown[key] / max) * 100}
                    className="h-1"
                  />
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Professional info */}
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

      {/* Assign button */}
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
        </>
      )}
    </div>
  );
}
