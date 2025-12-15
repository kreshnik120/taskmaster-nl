import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveApplicationName } from "@/lib/utils";

interface Application {
  id: string;
  email_from: string;
  pipeline_stage: string;
  updated_at: string;
  extracted_data?: {
    naam?: string;
    telefoon?: string;
    regio?: string;
  };
}

interface RecentMovementsWidgetProps {
  applications: Application[];
  isLoading?: boolean;
  onViewAll?: () => void;
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

export function RecentMovementsWidget({ applications, isLoading, onViewAll }: RecentMovementsWidgetProps) {
  const recentMoves = applications
    .filter(app => app.updated_at)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-100 text-blue-700',
      'bg-green-100 text-green-700',
      'bg-purple-100 text-purple-700',
      'bg-amber-100 text-amber-700',
      'bg-rose-100 text-rose-700',
      'bg-cyan-100 text-cyan-700',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  if (isLoading) {
    return (
      <div className="py-8">
        <h3 className="text-sm font-medium text-foreground mb-4">Recente activiteit</h3>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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
      <div className="space-y-0">
        {recentMoves.map((app, index) => {
          const candidateName = resolveApplicationName(app);
          const stage = app.pipeline_stage || 'nieuw';
          const timeAgo = formatDistanceToNow(new Date(app.updated_at), {
            addSuffix: true,
            locale: nl,
          });
          const exactDateTime = new Date(app.updated_at).toLocaleString('nl-NL', {
            dateStyle: 'short',
            timeStyle: 'short',
          });

          const stageColor = STAGE_COLORS[stage] || { dot: "bg-gray-400", text: "text-gray-600" };
          
          return (
            <HoverCard key={app.id} openDelay={300}>
              <HoverCardTrigger asChild>
                <div 
                  className={`group grid grid-cols-[auto_1fr_auto] gap-3 text-sm items-center hover:bg-accent/50 -mx-2 px-2 py-2 rounded cursor-pointer transition-all duration-200 ${
                    index < recentMoves.length - 1 ? 'border-b border-border/30' : ''
                  }`}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className={`text-[10px] font-medium ${getAvatarColor(candidateName)}`}>
                      {getInitials(candidateName)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-foreground truncate group-hover:font-semibold transition-all">
                      {candidateName}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${stageColor.dot} flex-shrink-0`} />
                      <span className={`${stageColor.text} text-xs`}>
                        {STAGE_LABELS[stage] || stage}
                      </span>
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1 justify-end shrink-0">
                    <span className="text-muted-foreground text-xs" title={exactDateTime}>
                      {timeAgo}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  </div>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-72" side="left" align="start">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{candidateName}</h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {app.extracted_data?.telefoon && (
                      <p>📞 {app.extracted_data.telefoon}</p>
                    )}
                    <p>✉️ {app.email_from}</p>
                    {app.extracted_data?.regio && (
                      <p>📍 {app.extracted_data.regio}</p>
                    )}
                    <p className="text-[10px] mt-2 text-muted-foreground/60">
                      Bijgewerkt: {exactDateTime}
                    </p>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>
      {onViewAll && recentMoves.length >= 5 && (
        <button
          onClick={onViewAll}
          className="text-xs text-primary hover:underline mt-3 transition-all duration-200"
        >
          Bekijk alle activiteit →
        </button>
      )}
    </div>
  );
}
