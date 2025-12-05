import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface SimpleMatchScoreProps {
  score: number;
  label?: string;
}

/**
 * Fallback component for when full MatchScoreBreakdown data is not available.
 * Shows only the total percentage with a simple progress bar.
 */
export function SimpleMatchScore({ score, label = "Match Score" }: SimpleMatchScoreProps) {
  const roundedScore = Math.round(score);

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-600";
    if (s >= 60) return "text-blue-600";
    if (s >= 40) return "text-amber-600";
    return "text-muted-foreground";
  };

  return (
    <Card className="border-0 shadow-sm bg-background/95 backdrop-blur-sm">
      <CardContent className="p-4">
        {/* Hero Score */}
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <div className="flex items-center justify-center gap-1">
            <span className={cn("text-4xl font-light tracking-tight", getScoreColor(roundedScore))}>
              {roundedScore}
            </span>
            <span className="text-xl text-muted-foreground font-light">%</span>
          </div>
        </div>
        
        {/* Simple progress bar */}
        <Progress value={roundedScore} className="h-1.5" />
        
        {/* Minimal info text */}
        <p className="text-xs text-muted-foreground/60 text-center mt-3">
          Gedetailleerde breakdown niet beschikbaar
        </p>
      </CardContent>
    </Card>
  );
}
