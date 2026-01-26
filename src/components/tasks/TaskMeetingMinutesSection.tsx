import { useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Loader2 } from "lucide-react";
import { useTaskMeetingMinutes } from "@/hooks/useTaskMeetingMinutes";
import { MeetingMinute } from "@/hooks/useMeetingMinutes";
import { CreateMeetingMinuteDialog } from "@/components/notulen/CreateMeetingMinuteDialog";
import { MeetingMinuteDetail } from "@/components/notulen/MeetingMinuteDetail";

interface TaskMeetingMinutesSectionProps {
  taskId: string;
  taskTitle: string;
}

const TYPE_LABELS: Record<string, string> = {
  team: "Team",
  board: "Bestuur",
  project: "Project",
  klant: "Klant",
  overig: "Overig",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Concept", variant: "secondary" },
  pending_approval: { label: "Wacht op goedkeuring", variant: "outline" },
  approved: { label: "Goedgekeurd", variant: "default" },
  archived: { label: "Gearchiveerd", variant: "outline" },
};

export function TaskMeetingMinutesSection({ taskId, taskTitle }: TaskMeetingMinutesSectionProps) {
  const { minutes, isLoading, refetch } = useTaskMeetingMinutes(taskId);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedMinute, setSelectedMinute] = useState<MeetingMinute | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleMinuteClick = (minute: MeetingMinute) => {
    setSelectedMinute(minute);
    setDetailOpen(true);
  };

  const handleCreateSuccess = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {minutes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Geen notulen gekoppeld aan deze taak
          </p>
        ) : (
          <div className="space-y-2">
            {minutes.map((minute) => {
              const statusConfig = STATUS_CONFIG[minute.status || 'draft'];
              return (
                <div
                  key={minute.id}
                  className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleMinuteClick(minute)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-sm truncate">
                        {minute.tasks?.title || 'Naamloos'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {minute.meeting_type && (
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABELS[minute.meeting_type] || minute.meeting_type}
                        </Badge>
                      )}
                      <Badge variant={statusConfig?.variant || "secondary"} className="text-xs">
                        {statusConfig?.label || "Concept"}
                      </Badge>
                    </div>
                  </div>
                  {minute.tasks?.start_at && (
                    <p className="text-xs text-muted-foreground mt-1 pl-6">
                      {format(new Date(minute.tasks.start_at), "d MMM yyyy", { locale: nl })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Notulen toevoegen
        </Button>
      </div>

      <CreateMeetingMinuteDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
        defaultTitle={taskTitle}
        linkedTaskId={taskId}
      />

      <MeetingMinuteDetail
        minute={selectedMinute}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
