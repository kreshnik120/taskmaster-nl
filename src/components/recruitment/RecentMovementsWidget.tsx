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

const STAGE_LABELS: Record<string, string> = {
  nieuw: "Nieuw",
  screening: "Screening",
  interview: "Interview",
  goedgekeurd: "Goedgekeurd",
  geplaatst: "Geplaatst",
};

const STAGE_COLORS: Record<string, { dot: string; text: string }> = {
  nieuw: { dot: "bg-blue-500", text: "text-blue-600" },
  screening: { dot: "bg-amber-500", text: "text-amber-600" },
  interview: { dot: "bg-sky-500", text: "text-sky-600" },
  goedgekeurd: { dot: "bg-emerald-500", text: "text-emerald-600" },
  geplaatst: { dot: "bg-green-600", text: "text-green-700" },
};

export function RecentMovementsWidget({ applications }: RecentMovementsWidgetProps) {
  const recentMoves = applications
    .filter(app => app.updated_at)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  if (recentMoves.length === 0) {
    return (
      <div className="py-8">
        <h3 className="text-sm font-medium text-foreground mb-4">Recente activiteit</h3>
        <p className="text-sm text-muted-foreground text-center">Nog geen recente activiteit</p>
      </div>
    );
  }

  return (
    <div className="py-8">
      <h3 className="text-sm font-medium text-foreground mb-4">Recente activiteit</h3>
      <div className="space-y-2">
        {recentMoves.map((app) => {
          const candidateName = app.extracted_data?.naam || app.email_from.split('@')[0];
          const stage = app.pipeline_stage || 'nieuw';
          const timeAgo = formatDistanceToNow(new Date(app.updated_at), {
            addSuffix: true,
            locale: nl,
          });

          const stageColor = STAGE_COLORS[stage] || { dot: "bg-gray-400", text: "text-gray-600" };
          
          return (
            <div key={app.id} className="grid grid-cols-[40%_25%_35%] gap-4 text-sm items-center hover:bg-muted/30 -mx-1 px-1 py-1.5 rounded cursor-pointer transition-colors">
              <span className="font-medium text-foreground truncate">
                {candidateName}
              </span>
              <span className="flex items-center gap-1.5 truncate">
                <span className={`w-1.5 h-1.5 rounded-full ${stageColor.dot} flex-shrink-0`} />
                <span className={`${stageColor.text} truncate`}>
                  {STAGE_LABELS[stage] || stage}
                </span>
              </span>
              <span className="text-muted-foreground text-xs text-right">
                {timeAgo}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
