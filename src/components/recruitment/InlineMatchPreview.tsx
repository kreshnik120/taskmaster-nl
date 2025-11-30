import { Building2, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface InlineMatchPreviewProps {
  clientName: string;
  matchScore: number;
  matchReasoning: string[];
}

export function InlineMatchPreview({ clientName, matchScore, matchReasoning }: InlineMatchPreviewProps) {
  const getScoreColor = () => {
    if (matchScore >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (matchScore >= 60) return "text-blue-600 dark:text-blue-400";
    return "text-amber-600 dark:text-amber-400";
  };

  const getBgColor = () => {
    if (matchScore >= 80) return "bg-emerald-50 dark:bg-emerald-950/30";
    if (matchScore >= 60) return "bg-blue-50 dark:bg-blue-950/30";
    return "bg-amber-50 dark:bg-amber-950/30";
  };

  return (
    <div className={`p-3 rounded-lg border ${getBgColor()} border-border/50 space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground truncate">{clientName}</span>
        </div>
        <Badge variant="outline" className={`${getScoreColor()} border-current`}>
          <TrendingUp className="h-3 w-3 mr-1" />
          {matchScore}%
        </Badge>
      </div>
      {matchReasoning.length > 0 && (
        <div className="space-y-1">
          {matchReasoning.slice(0, 2).map((reason, idx) => (
            <p key={idx} className="text-xs text-muted-foreground leading-relaxed">
              • {reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
