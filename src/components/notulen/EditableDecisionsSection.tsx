import { useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, Plus, Trash2, Loader2, ListTodo, ExternalLink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MeetingMinute, Decision } from "@/hooks/useMeetingMinutes";
import { useManageDecisions } from "@/hooks/notulen/useManageDecisions";
import { TaskDialog } from "@/components/TaskDialog";

interface EditableDecisionsSectionProps {
  minute: MeetingMinute;
  isEditMode: boolean;
}

export function EditableDecisionsSection({ minute, isEditMode }: EditableDecisionsSectionProps) {
  const { addDecision, removeDecision, linkTaskToDecision, isUpdating } = useManageDecisions();
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [createTaskForDecision, setCreateTaskForDecision] = useState<Decision | null>(null);

  const handleAdd = async () => {
    if (!newText.trim()) return;

    await addDecision(minute.id, newText.trim());

    setNewText("");
    setIsAdding(false);
  };

  const handleCancel = () => {
    setNewText("");
    setIsAdding(false);
  };

  const handleTaskCreated = async (taskId: string) => {
    if (createTaskForDecision) {
      await linkTaskToDecision(minute.id, createTaskForDecision.id, taskId);
      setCreateTaskForDecision(null);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            <span>Beslissingen ({minute.decisions.length})</span>
          </div>
        </div>

        <Card className="p-4">
          {minute.decisions.length === 0 && !isAdding ? (
            <p className="text-sm text-muted-foreground italic">
              Geen beslissingen vastgelegd
            </p>
          ) : (
            <div className="space-y-4">
              {minute.decisions.map((decision) => (
                <div key={decision.id} className="group">
                  <div className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <div className="flex-1">
                      <p className="text-sm">{decision.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground">
                          Besloten door: {decision.decided_by || "-"} op{" "}
                          {decision.decided_at
                            ? format(new Date(decision.decided_at), "d MMM yyyy", {
                                locale: nl,
                              })
                            : "-"}
                        </p>
                        {decision.linked_task_id && (
                          <Badge variant="outline" className="text-xs">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Taak gekoppeld
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isEditMode && (
                      <div className="flex items-center gap-1">
                        {!decision.linked_task_id && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                onClick={() => setCreateTaskForDecision(decision)}
                                disabled={isUpdating}
                              >
                                <ListTodo className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Maak taak van beslissing</TooltipContent>
                          </Tooltip>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                              disabled={isUpdating}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Beslissing verwijderen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Deze beslissing wordt permanent verwijderd.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuleren</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeDecision(minute.id, decision.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Verwijderen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isEditMode && !isAdding && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Beslissing toevoegen
            </Button>
          )}

          {isAdding && (
            <div className="mt-3 p-3 border rounded-md bg-muted/30 space-y-3">
              <Textarea
                placeholder="Beschrijf de genomen beslissing..."
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") handleCancel();
                }}
                className="min-h-[80px]"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Annuleren
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newText.trim() || isUpdating}
                >
                  {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Toevoegen
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Task Dialog for creating task from decision */}
      <TaskDialog
        open={!!createTaskForDecision}
        onOpenChange={(open) => !open && setCreateTaskForDecision(null)}
        onSuccess={() => {
          // Note: TaskDialog doesn't return task ID directly
          // We need to update TaskDialog to support onSuccessWithId
          setCreateTaskForDecision(null);
        }}
      />
    </>
  );
}
