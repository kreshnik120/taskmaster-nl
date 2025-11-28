import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface Application {
  id: string;
  email_from: string;
  pipeline_stage: string;
  updated_at: string;
  extracted_data?: {
    naam?: string;
  };
}

interface RecentMovementsWidgetProps {
  applications: Application[];
}

const STAGE_COLORS: Record<string, string> = {
  nieuw: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  screening: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  interview: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  goedgekeurd: "bg-green-500/10 text-green-600 border-green-500/20",
  geplaatst: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

const STAGE_LABELS: Record<string, string> = {
  nieuw: "Nieuw",
  screening: "Screening",
  interview: "Interview",
  goedgekeurd: "Goedgekeurd",
  geplaatst: "Geplaatst",
};

export function RecentMovementsWidget({ applications }: RecentMovementsWidgetProps) {
  // Sorteer op laatste update en neem top 5
  const recentMoves = applications
    .filter(app => app.updated_at)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          Recente Bewegingen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentMoves.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nog geen recente activiteit</p>
          </div>
        ) : (
          recentMoves.map((app) => {
            const candidateName = app.extracted_data?.naam || app.email_from.split('@')[0];
            const stage = app.pipeline_stage || 'nieuw';
            const timeAgo = formatDistanceToNow(new Date(app.updated_at), {
              addSuffix: true,
              locale: nl,
            });

            return (
              <div
                key={app.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {candidateName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-muted-foreground text-xs">→</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
                          STAGE_COLORS[stage] || STAGE_COLORS.nieuw
                        }`}
                      >
                        {STAGE_LABELS[stage] || stage}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span className="whitespace-nowrap">{timeAgo}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
