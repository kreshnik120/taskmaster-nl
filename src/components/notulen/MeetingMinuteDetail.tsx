import { format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MapPin,
  Link2,
  Calendar,
  ClipboardList,
  CheckCircle2,
  FileText,
  Users,
  Edit2,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { MeetingMinute, AgendaItem, Decision } from "@/hooks/useMeetingMinutes";

interface MeetingMinuteDetailProps {
  minute: MeetingMinute | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Status badge helper
function getStatusBadge(status: string | null) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary">Concept</Badge>;
    case "pending_approval":
      return (
        <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent">
          Wacht op goedkeuring
        </Badge>
      );
    case "approved":
      return (
        <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-transparent">
          Goedgekeurd
        </Badge>
      );
    case "archived":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Gearchiveerd
        </Badge>
      );
    default:
      return <Badge variant="outline">Onbekend</Badge>;
  }
}

// Meeting type badge helper
function getTypeBadge(type: string | null) {
  const config: Record<string, { label: string; className: string }> = {
    team: {
      label: "Team",
      className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    },
    board: {
      label: "Bestuur",
      className: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    },
    project: {
      label: "Project",
      className: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    },
    klant: {
      label: "Klant",
      className: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    },
    overig: {
      label: "Overig",
      className: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    },
  };
  const c = config[type || "overig"] || config.overig;
  return <Badge className={`${c.className} border-transparent`}>{c.label}</Badge>;
}

// Section component for consistent styling
function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>
          {title}
          {count !== undefined && ` (${count})`}
        </span>
      </div>
      {children}
    </div>
  );
}

// Empty state component
function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-muted-foreground italic py-2">{message}</p>
  );
}

export function MeetingMinuteDetail({
  minute,
  open,
  onOpenChange,
}: MeetingMinuteDetailProps) {
  if (!minute) return null;

  const attendees = minute.meeting_attendees || [];
  const agendaItems = minute.agenda_items || [];
  const decisions = minute.decisions || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader className="space-y-3">
          {/* Type + Status badges */}
          <div className="flex items-center gap-2">
            {getTypeBadge(minute.meeting_type)}
            {getStatusBadge(minute.status)}
          </div>

          <SheetTitle className="text-xl">
            {minute.tasks?.title || "Geen titel"}
          </SheetTitle>

          <SheetDescription>
            {minute.tasks?.start_at
              ? format(
                  new Date(minute.tasks.start_at),
                  "EEEE d MMMM yyyy 'om' HH:mm",
                  { locale: nl }
                )
              : "Geen datum"}
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 pb-6">
            {/* META Section */}
            <Section icon={MapPin} title="Locatie & Details">
              <Card className="p-4 space-y-3">
                {minute.location ? (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <span>{minute.location}</span>
                  </div>
                ) : null}

                {minute.meeting_link ? (
                  <div className="flex items-start gap-2 text-sm">
                    <Link2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <a
                      href={minute.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      Meeting link
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : null}

                {minute.next_meeting_date ? (
                  <div className="flex items-start gap-2 text-sm">
                    <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <span>
                      Volgende vergadering:{" "}
                      {format(new Date(minute.next_meeting_date), "d MMMM yyyy", {
                        locale: nl,
                      })}
                    </span>
                  </div>
                ) : null}

                {!minute.location &&
                  !minute.meeting_link &&
                  !minute.next_meeting_date && (
                    <EmptyState message="Geen locatie of details toegevoegd" />
                  )}
              </Card>
            </Section>

            {/* AGENDA Section */}
            <Section
              icon={ClipboardList}
              title="Agenda"
              count={agendaItems.length}
            >
              <Card className="p-4">
                {agendaItems.length > 0 ? (
                  <ul className="space-y-2">
                    {agendaItems.map((item: AgendaItem, index: number) => (
                      <li
                        key={item.id || index}
                        className="flex items-start gap-3 text-sm"
                      >
                        <span
                          className={`shrink-0 mt-0.5 ${
                            item.discussed
                              ? "text-green-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.discussed ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </span>
                        <span className="flex-1">
                          {item.order}. {item.title}
                        </span>
                        {item.duration_min > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {item.duration_min} min
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState message="Geen agenda items toegevoegd" />
                )}
              </Card>
            </Section>

            {/* DECISIONS Section */}
            <Section
              icon={CheckCircle2}
              title="Beslissingen"
              count={decisions.length}
            >
              <Card className="p-4">
                {decisions.length > 0 ? (
                  <ul className="space-y-3">
                    {decisions.map((decision: Decision, index: number) => (
                      <li key={decision.id || index} className="text-sm">
                        <p className="font-medium">• {decision.text}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {decision.decided_by
                            ? `Besloten door: ${decision.decided_by}`
                            : "Besloten"}
                          {decision.decided_at &&
                            ` op ${format(
                              new Date(decision.decided_at),
                              "d MMM yyyy",
                              { locale: nl }
                            )}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState message="Geen beslissingen vastgelegd" />
                )}
              </Card>
            </Section>

            {/* NOTES Section */}
            <Section icon={FileText} title="Notities">
              <Card className="p-4">
                {minute.content ? (
                  <p className="text-sm whitespace-pre-wrap">{minute.content}</p>
                ) : (
                  <EmptyState message="Geen notities toegevoegd" />
                )}
              </Card>
            </Section>

            {/* ATTENDEES Section */}
            <Section
              icon={Users}
              title="Deelnemers"
              count={attendees.length}
            >
              <Card className="p-4">
                {attendees.length > 0 ? (
                  <ul className="space-y-2">
                    {attendees.map((attendee) => (
                      <li
                        key={attendee.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span>
                            {attendee.profiles?.name ||
                              attendee.external_name ||
                              "Onbekend"}
                          </span>
                          {attendee.role && (
                            <Badge variant="outline" className="text-xs">
                              {attendee.role}
                            </Badge>
                          )}
                        </div>
                        <Badge
                          variant={attendee.attended ? "default" : "secondary"}
                          className={
                            attendee.attended
                              ? "bg-green-500/10 text-green-700 dark:text-green-400 border-transparent"
                              : ""
                          }
                        >
                          {attendee.attended ? "Aanwezig" : "Afwezig"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState message="Geen deelnemers toegevoegd" />
                )}
              </Card>
            </Section>
          </div>
        </ScrollArea>

        <Separator className="my-4" />

        <SheetFooter className="flex-col sm:flex-row gap-2">
          {/* Approval info */}
          {minute.approved_by && minute.approved_at && (
            <p className="text-xs text-muted-foreground flex-1">
              Goedgekeurd op{" "}
              {format(new Date(minute.approved_at), "d MMMM yyyy", {
                locale: nl,
              })}
            </p>
          )}

          {/* Edit button (disabled for Fase 3) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                disabled
                className="opacity-50 cursor-not-allowed"
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Bewerken
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Komt beschikbaar in Fase 3B</p>
            </TooltipContent>
          </Tooltip>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
