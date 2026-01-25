import { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw } from 'lucide-react';
import { WidgetConfigItem } from './WidgetConfigItem';
import { WidgetConfig } from '@/hooks/useWidgetPreferences';

interface WidgetSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: WidgetConfig[];
  onUpdatePreference: (key: string, updates: { isVisible?: boolean; order?: number }) => Promise<void>;
  onReorderWidgets: (newOrder: WidgetConfig[]) => Promise<void>;
  onResetToDefaults: () => Promise<void>;
  saving: boolean;
}

export function WidgetSettingsModal({
  open,
  onOpenChange,
  widgets: propWidgets,
  onUpdatePreference,
  onReorderWidgets,
  onResetToDefaults,
  saving,
}: WidgetSettingsModalProps) {
  const [widgets, setWidgets] = useState(propWidgets);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    setWidgets(propWidgets);
  }, [propWidgets]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleToggleVisibility = async (key: string, isVisible: boolean) => {
    setWidgets(prev => prev.map(w =>
      w.key === key ? { ...w, isVisible } : w
    ));

    await onUpdatePreference(key, { isVisible });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = widgets.findIndex(w => w.key === active.id);
    const newIndex = widgets.findIndex(w => w.key === over.id);

    const newOrder = arrayMove(widgets, oldIndex, newIndex);

    setWidgets(newOrder);

    await onReorderWidgets(newOrder);
  };

  const handleResetConfirm = async () => {
    await onResetToDefaults();
    setResetConfirmOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dashboard Aanpassen</DialogTitle>
            <DialogDescription>
              Sleep widgets om de volgorde te wijzigen. Vink widgets uit om ze te verbergen.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-2 max-h-[400px] overflow-y-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={widgets.map(w => w.key)}
                strategy={verticalListSortingStrategy}
              >
                {widgets.map(widget => (
                  <WidgetConfigItem
                    key={widget.key}
                    widget={widget}
                    onToggleVisibility={handleToggleVisibility}
                    disabled={saving}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setResetConfirmOpen(true)}
              disabled={saving}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Standaard Herstellen
            </Button>

            <Button
              variant="default"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Sluiten
            </Button>
          </DialogFooter>

          {saving && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Bezig met opslaan...
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Widget voorkeuren herstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit zet alle widget instellingen terug naar de standaard configuratie.
              Je persoonlijke aanpassingen gaan verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetConfirm}>
              Herstellen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
