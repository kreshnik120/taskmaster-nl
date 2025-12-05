import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineMatchPreviewProps {
  clientName: string;
  matchScore: number;
  matchReasoning: string[];
}

/**
 * Inline match preview for hover cards - simplified version
 */
export function InlineMatchPreview({ clientName, matchScore, matchReasoning }: InlineMatchPreviewProps) {
  const roundedScore = Math.round(matchScore);
  
  // Simple score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-foreground';
    if (score >= 60) return 'text-foreground';
    return 'text-muted-foreground';
  };

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
        <div className="flex items-center gap-1.5">
          <span className={cn("text-sm font-medium", getScoreColor(roundedScore))}>
            {roundedScore}
          </span>
          <span className="text-xs text-muted-foreground/60">%</span>
        </div>
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
