import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  CheckCircle2, 
  Circle,
  AlertCircle,
  FileText,
  Building2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Participant {
  name: string;
  role?: string | null;
  present: boolean;
}

interface AgendaItem {
  item: string;
  discussed: boolean;
  notes?: string | null;
}

interface Decision {
  decision: string;
  owner?: string | null;
  deadline?: string | null;
}

interface MeetingMinuteData {
  title: string;
  meeting_type: string;
  start_at: string;
  location?: string | null;
  client_name?: string | null;
  participants?: Participant[];
  agenda_items?: AgendaItem[];
  decisions?: Decision[];
  notes?: string | null;
  summary?: string | null;
  status: string;
}

interface MeetingMinuteStructuredViewProps {
  data: MeetingMinuteData;
  onSectionClick?: (section: string) => void;
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  team: "Teamoverleg",
  board: "Bestuursvergadering",
  project: "Projectvergadering",
  klant: "Klantvergadering",
  overig: "Overig",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Concept", variant: "secondary" },
  pending_approval: { label: "Ter goedkeuring", variant: "outline" },
  approved: { label: "Goedgekeurd", variant: "default" },
  archived: { label: "Gearchiveerd", variant: "secondary" },
};

export function MeetingMinuteStructuredView({ 
  data, 
  onSectionClick 
}: MeetingMinuteStructuredViewProps) {
  const meetingDate = new Date(data.start_at);
  const statusInfo = STATUS_LABELS[data.status] || STATUS_LABELS.draft;
  
  const presentCount = data.participants?.filter(p => p.present).length || 0;
  const totalParticipants = data.participants?.length || 0;
  
  const discussedCount = data.agenda_items?.filter(a => a.discussed).length || 0;
  const totalAgendaItems = data.agenda_items?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onSectionClick?.("header")}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {MEETING_TYPE_LABELS[data.meeting_type] || data.meeting_type}
                </Badge>
                <Badge variant={statusInfo.variant} className="text-xs">
                  {statusInfo.label}
                </Badge>
              </div>
              <CardTitle className="text-xl">{data.title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{format(meetingDate, "d MMMM yyyy", { locale: nl })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{format(meetingDate, "HH:mm", { locale: nl })}</span>
            </div>
            {data.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{data.location}</span>
              </div>
            )}
            {data.client_name && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{data.client_name}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Participants Section */}
      {totalParticipants > 0 && (
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onSectionClick?.("participants")}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Deelnemers
              <Badge variant="secondary" className="ml-auto text-xs">
                {presentCount}/{totalParticipants} aanwezig
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {data.participants?.map((participant, index) => (
                <div 
                  key={index}
                  className={cn(
                    "p-2 rounded-lg text-sm",
                    participant.present 
                      ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900" 
                      : "bg-muted/50 border border-muted"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{participant.name}</span>
                    {!participant.present && (
                      <Badge variant="secondary" className="text-xs ml-1 shrink-0">
                        Afwezig
                      </Badge>
                    )}
                  </div>
                  {participant.role && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {participant.role}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agenda Section */}
      {totalAgendaItems > 0 && (
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onSectionClick?.("agenda")}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Agenda
              <Badge variant="secondary" className="ml-auto text-xs">
                {discussedCount}/{totalAgendaItems} besproken
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {data.agenda_items?.map((item, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="text-muted-foreground text-sm font-medium w-5 shrink-0">
                    {index + 1}.
                  </span>
                  {item.discussed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <span className={cn(
                      "text-sm",
                      !item.discussed && "text-muted-foreground"
                    )}>
                      {item.item}
                    </span>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        {item.notes}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Decisions Section */}
      {data.decisions && data.decisions.length > 0 && (
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20"
          onClick={() => onSectionClick?.("decisions")}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Beslissingen
              <Badge className="ml-auto text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                {data.decisions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {data.decisions.map((decision, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{decision.decision}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {decision.owner && (
                        <span className="text-xs text-muted-foreground">
                          Eigenaar: <span className="font-medium">{decision.owner}</span>
                        </span>
                      )}
                      {decision.deadline && (
                        <span className="text-xs text-muted-foreground">
                          Deadline: <span className="font-medium">
                            {format(new Date(decision.deadline), "d MMM yyyy", { locale: nl })}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Notes & Summary Section */}
      {(data.summary || data.notes) && (
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onSectionClick?.("notes")}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notities & Samenvatting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.summary && (
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                <p className="text-sm font-medium mb-1">Samenvatting</p>
                <p className="text-sm text-muted-foreground">{data.summary}</p>
              </div>
            )}
            {data.notes && (
              <div>
                <p className="text-sm font-medium mb-1">Notities</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer hint */}
      <p className="text-center text-xs text-muted-foreground">
        Klik op een sectie om details te bekijken of te bewerken
      </p>
    </div>
  );
}
