import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList, Plus, Trash2, Loader2 } from "lucide-react";
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
import { useManageAgendaItems } from "@/hooks/notulen/useManageAgendaItems";

interface EditableAgendaSectionProps {
  minute: MeetingMinute;
  isEditMode: boolean;
}

export function EditableAgendaSection({ minute, isEditMode }: EditableAgendaSectionProps) {
  const { addAgendaItem, removeAgendaItem, toggleDiscussed, isUpdating } = useManageAgendaItems();
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState("15");

  const handleAdd = async () => {
    if (!newTitle.trim()) return;

    await addAgendaItem(minute.id, {
      title: newTitle.trim(),
      duration_min: parseInt(newDuration) || 15,
      discussed: false,
    });

    setNewTitle("");
    setNewDuration("15");
    setIsAdding(false);
  };

  const handleCancel = () => {
    setNewTitle("");
    setNewDuration("15");
    setIsAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ClipboardList className="h-4 w-4" />
          <span>Agenda ({minute.agenda_items.length} items)</span>
        </div>
      </div>

      <Card className="p-4">
        {minute.agenda_items.length === 0 && !isAdding ? (
          <p className="text-sm text-muted-foreground italic">
            Geen agenda items toegevoegd
          </p>
        ) : (
          <div className="space-y-2">
            {minute.agenda_items
              .sort((a, b) => a.order - b.order)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 py-1.5 group"
                >
                  <Checkbox
                    checked={item.discussed}
                    onCheckedChange={() => toggleDiscussed(minute.id, item.id)}
                    disabled={isUpdating}
                  />
                  <span
                    className={`flex-1 text-sm ${
                      item.discussed ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {item.order}. {item.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.duration_min} min
                  </span>
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
                          <AlertDialogTitle>Agenda item verwijderen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{item.title}" wordt verwijderd van de agenda.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuleren</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeAgendaItem(minute.id, item.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Verwijderen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
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
            Agenda item toevoegen
          </Button>
        )}

        {isAdding && (
          <div className="mt-3 p-3 border rounded-md bg-muted/30 space-y-3">
            <div className="space-y-2">
              <Input
                placeholder="Titel van agenda item..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") handleCancel();
                }}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="120"
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">minuten</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Annuleren
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!newTitle.trim() || isUpdating}
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
