import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getScoreColor, getScoreProgressColor, TRANSITIONS } from "@/lib/constants/designTokens";

interface SimpleMatchScoreProps {
  score: number;
  label?: string;
}

/**
 * Fallback component for when full MatchScoreBreakdown data is not available.
 * Shows only the total percentage with Apple-style minimal design.
 */
export function SimpleMatchScore({ score, label = "Match Score" }: SimpleMatchScoreProps) {
  const roundedScore = Math.round(score);

  return (
    <Card className="border-0 shadow-sm bg-background/95 backdrop-blur-sm">
      <CardContent className="p-4">
        {/* Hero Score - Apple style centered */}
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <div className="flex items-center justify-center gap-1">
            <span className={cn("text-4xl font-light tracking-tight", getScoreColor(roundedScore))}>
              {roundedScore}
            </span>
            <span className="text-xl text-muted-foreground font-light">%</span>
          </div>
        </div>
        
        {/* Simple progress bar - Apple 4px */}
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-2">
          <div 
            className={cn(
              "h-full rounded-full",
              TRANSITIONS.slow,
              getScoreProgressColor(roundedScore)
            )}
            style={{ width: `${roundedScore}%` }}
          />
        </div>
        
        {/* Minimal info text */}
        <p className="text-xs text-muted-foreground/60 text-center mt-3">
          Gedetailleerde breakdown niet beschikbaar
        </p>
      </CardContent>
    </Card>
  );
}
