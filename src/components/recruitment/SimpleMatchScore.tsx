import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  
  const getScoreColor = () => {
    if (roundedScore >= 80) return "text-green-600";
    if (roundedScore >= 60) return "text-primary";
    if (roundedScore >= 40) return "text-amber-600";
    return "text-muted-foreground";
  };

  const getProgressColor = () => {
    if (roundedScore >= 80) return "bg-green-500";
    if (roundedScore >= 60) return "bg-primary";
    if (roundedScore >= 40) return "bg-amber-500";
    return "bg-muted-foreground/30";
  };

  return (
    <Card className="border-0 shadow-sm bg-background/95 backdrop-blur-sm">
      <CardContent className="p-4">
        {/* Hero Score - Apple style centered */}
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <div className="flex items-center justify-center gap-1">
            <span className={cn("text-4xl font-light tracking-tight", getScoreColor())}>
              {roundedScore}
            </span>
            <span className="text-xl text-muted-foreground font-light">%</span>
          </div>
        </div>
        
        {/* Simple progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
          <div 
            className={cn("h-full rounded-full transition-all duration-500", getProgressColor())}
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
