import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FileText, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { SourceStats } from "@/hooks/useDashboardStats";

interface SourceProgressProps {
  sources: SourceStats[];
  isLoading?: boolean;
}

export function SourceProgress({ sources, isLoading }: SourceProgressProps) {
  const navigate = useNavigate();

  const handleClick = (sourceId: string | null) => {
    if (sourceId) {
      navigate(`/notulen?id=${sourceId}`);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Per Bron
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (sources.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Per Bron
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Geen bronnen gevonden</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card-violet">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5" />
          Per Bron
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sources.map((source) => {
          const progress = source.total > 0 
            ? Math.round((source.completed / source.total) * 100) 
            : 0;
          const isClickable = !!source.sourceId;

          return (
            <div
              key={source.sourceId || 'manual'}
              onClick={() => handleClick(source.sourceId)}
              className={cn(
                "p-3 rounded-xl transition-all duration-200",
                "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
                "border border-white/30 dark:border-white/12",
                "shadow-[0_2px_6px_hsla(270,45%,55%,0.06)]",
                isClickable && "cursor-pointer hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_12px_hsla(270,45%,55%,0.12)]"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-full bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm">
                  {source.sourceId ? (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{source.sourceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.completed}/{source.total} afgerond • {source.open} open
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={progress} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {progress}%
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
