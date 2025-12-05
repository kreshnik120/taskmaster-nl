import { Building2 } from "lucide-react";
import { MatchScoreIndicator } from "@/components/ui/match-score-indicator";
import { cn } from "@/lib/utils";

interface InlineMatchPreviewProps {
  clientName: string;
  matchScore: number;
  matchReasoning: string[];
}

/**
 * Apple-style inline match preview for hover cards
 * Simplified design with unified score indicator
 */
export function InlineMatchPreview({ clientName, matchScore, matchReasoning }: InlineMatchPreviewProps) {
  return (
    <div className={cn(
      "p-3 rounded-lg bg-muted/30 space-y-2",
      "transition-colors duration-150"
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{clientName}</span>
        </div>
        <MatchScoreIndicator score={matchScore} size="sm" />
      </div>
      {matchReasoning.length > 0 && (
        <div className="space-y-0.5 pl-6">
          {matchReasoning.slice(0, 2).map((reason, idx) => (
            <p key={idx} className="text-xs text-muted-foreground/80 leading-relaxed">
              {reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
