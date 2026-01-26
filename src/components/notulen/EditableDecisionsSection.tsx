import { useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Plus, Trash2, Loader2 } from "lucide-react";
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
import { MeetingMinute } from "@/hooks/useMeetingMinutes";
import { useManageDecisions } from "@/hooks/notulen/useManageDecisions";

interface EditableDecisionsSectionProps {
  minute: MeetingMinute;
  isEditMode: boolean;
}

export function EditableDecisionsSection({ minute, isEditMode }: EditableDecisionsSectionProps) {
  const { addDecision, removeDecision, isUpdating } = useManageDecisions();
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState("");

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

  return (
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Besloten door: {decision.decided_by || "-"} op{" "}
                      {decision.decided_at
                        ? format(new Date(decision.decided_at), "d MMM yyyy", {
                            locale: nl,
                          })
                        : "-"}
                    </p>
                  </div>
                  {isEditMode && (
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
  );
}
