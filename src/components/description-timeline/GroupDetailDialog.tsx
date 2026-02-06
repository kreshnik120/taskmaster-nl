import { Plus, Minus, Edit3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DiffView } from "@/components/DiffView";
import { GroupedEntry, DescriptionChangeEntry } from "./types";
import { formatRelativeDate } from "./utils";

interface GroupDetailDialogProps {
  group: GroupedEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GroupDetailDialog({ group, open, onOpenChange }: GroupDetailDialogProps) {
  if (!group) return null;

  const getChangeIcon = (changeType?: string) => {
    switch (changeType) {
      case 'added':
        return <Plus className="h-3.5 w-3.5 text-emerald-600" />;
      case 'removed':
        return <Minus className="h-3.5 w-3.5 text-red-600" />;
      case 'modified':
      default:
        return <Edit3 className="h-3.5 w-3.5 text-blue-600" />;
    }
  };

  // Voor groepen: toon diff van oudste naar nieuwste staat
  const oldestEntry = group.lastEntry;
  const newestEntry = group.firstEntry;
  const oldDescription = oldestEntry.metadata?.old_description;
  const newDescription = newestEntry.metadata?.new_description;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            {group.count} wijzigingen door {group.created_by_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tijdsspanne */}
          <div className="text-sm text-muted-foreground">
            {formatRelativeDate(group.startTime)} → {formatRelativeDate(group.endTime)}
          </div>

          {/* Samengevatte diff */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Totale wijziging:</h4>
            <DiffView
              oldText={oldDescription}
              newText={newDescription}
            />
          </div>

          <Separator />

          {/* Individuele entries (collapsed) */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Alle {group.count} stappen:
            </h4>
            <div className="space-y-1 max-h-40 overflow-auto">
              {group.entries.map((entry, idx) => (
                <div 
                  key={entry.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground py-1"
                >
                  {getChangeIcon(entry.metadata?.change_type)}
                  <span>{formatRelativeDate(entry.created_at)}</span>
                  <Badge 
                    variant="outline" 
                    className="text-[9px] px-1 py-0"
                  >
                    {entry.metadata?.change_type === 'added' ? '+' :
                     entry.metadata?.change_type === 'removed' ? '-' : '~'}
                    {Math.abs((entry.metadata?.new_length || 0) - (entry.metadata?.old_length || 0))} chars
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
