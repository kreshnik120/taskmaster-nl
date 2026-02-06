import { useState, useEffect, useCallback, useMemo } from "react";
import { FileText, RotateCcw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DiffView } from "@/components/DiffView";
import { DescriptionChangeEntry, GroupedEntry, DescriptionTimelineProps } from "./types";
import { groupEntries, formatRelativeDate } from "./utils";
import { GroupedEntryItem } from "./GroupedEntryItem";
import { GroupDetailDialog } from "./GroupDetailDialog";

const MAX_VISIBLE_GROUPS = 3;

export function DescriptionTimeline({ 
  taskId, 
  className, 
  onDescriptionRestore,
  onCountChange,
  onLatestChange
}: DescriptionTimelineProps) {
  const [entries, setEntries] = useState<DescriptionChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<DescriptionChangeEntry | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupedEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [descriptionToRestore, setDescriptionToRestore] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadDescriptionHistory();
  }, [taskId]);

  // Notify parent of count changes and latest change
  useEffect(() => {
    onCountChange?.(entries.length);
    onLatestChange?.(entries.length > 0 ? entries[0] : null);
  }, [entries, onCountChange, onLatestChange]);

  const loadDescriptionHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_action_history')
        .select(`
          id,
          action_text,
          created_at,
          metadata,
          created_by_profile:created_by(name)
        `)
        .eq('task_id', taskId)
        .eq('action_type', 'description_change')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: DescriptionChangeEntry[] = (data || []).map((item: any) => ({
        id: item.id,
        action_text: item.action_text,
        created_at: item.created_at,
        created_by_name: item.metadata?.changed_by_name || item.created_by_profile?.name || 'Onbekend',
        metadata: item.metadata as DescriptionChangeEntry['metadata']
      }));

      setEntries(mapped);
    } catch (error) {
      console.error('Error loading description history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewChange = (entry: DescriptionChangeEntry) => {
    setSelectedEntry(entry);
    setDialogOpen(true);
  };

  const handleViewGroup = (group: GroupedEntry) => {
    setSelectedGroup(group);
    setGroupDialogOpen(true);
  };

  const handleRestoreClick = useCallback((description: string) => {
    setDescriptionToRestore(description);
    setRestoreConfirmOpen(true);
  }, []);

  const handleRestoreConfirm = async () => {
    if (!descriptionToRestore) return;
    
    setRestoring(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ description: descriptionToRestore })
        .eq('id', taskId);

      if (error) throw error;

      toast({
        title: "Beschrijving hersteld",
        description: "De eerdere versie is teruggezet."
      });

      setRestoreConfirmOpen(false);
      setDialogOpen(false);
      setDescriptionToRestore(null);
      onDescriptionRestore?.(descriptionToRestore);
      loadDescriptionHistory();
    } catch (error) {
      console.error('Error restoring description:', error);
      toast({
        title: "Fout",
        description: "Kon de beschrijving niet herstellen.",
        variant: "destructive"
      });
    } finally {
      setRestoring(false);
    }
  };

  // Determine if the latest entry is already shown inline (within 24 hours)
  const isLatestShowingInline = useMemo(() => {
    if (entries.length === 0) return false;
    const latestEntry = entries[0];
    const changeTime = new Date(latestEntry.created_at).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return (now - changeTime) < twentyFourHours;
  }, [entries]);

  // Filter entries: if the first one is shown inline, start from index 1
  const visibleEntries = useMemo(() => {
    return isLatestShowingInline ? entries.slice(1) : entries;
  }, [entries, isLatestShowingInline]);

  // Group entries
  const groupedEntries = useMemo(() => {
    return groupEntries(visibleEntries);
  }, [visibleEntries]);

  // Determine which groups to show based on expanded state
  const displayedGroups = useMemo(() => {
    if (expanded || groupedEntries.length <= MAX_VISIBLE_GROUPS) {
      return groupedEntries;
    }
    return groupedEntries.slice(0, MAX_VISIBLE_GROUPS);
  }, [groupedEntries, expanded]);

  const hiddenCount = groupedEntries.length - MAX_VISIBLE_GROUPS;

  if (loading) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        Verloop laden...
      </div>
    );
  }

  if (groupedEntries.length === 0) {
    return null;
  }

  return (
    <>
      <div className={cn("mt-4", className)}>
        {/* Separator with count */}
        <div className="flex items-center gap-3 mb-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            {isLatestShowingInline ? 'Meer verloop' : 'Verloop'} ({visibleEntries.length})
          </span>
          <Separator className="flex-1" />
        </div>

        {/* Timeline entries */}
        <div className="space-y-1">
          {displayedGroups.map((group, index) => (
            <GroupedEntryItem
              key={group.id}
              group={group}
              index={index}
              isLast={index === displayedGroups.length - 1 && (expanded || hiddenCount <= 0)}
              onViewChange={handleViewChange}
              onViewGroup={handleViewGroup}
            />
          ))}
        </div>

        {/* Expand/collapse button */}
        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 mt-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Minder tonen
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                +{hiddenCount} meer
              </>
            )}
          </Button>
        )}
      </div>

      {/* Single entry detail dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Beschrijving wijziging</DialogTitle>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{formatRelativeDate(selectedEntry.created_at)}</span>
                <span>•</span>
                <span className="font-medium">{selectedEntry.created_by_name}</span>
              </div>

              <DiffView
                oldText={selectedEntry.metadata?.old_description}
                newText={selectedEntry.metadata?.new_description}
              />

              {selectedEntry.metadata?.old_description && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleRestoreClick(selectedEntry.metadata!.old_description!)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                  Terugzetten naar vorige versie
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Group detail dialog */}
      <GroupDetailDialog
        group={selectedGroup}
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
      />

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Beschrijving terugzetten?</AlertDialogTitle>
            <AlertDialogDescription>
              De huidige beschrijving wordt vervangen door de geselecteerde versie. 
              Deze actie wordt opgeslagen in het verloop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Annuleren</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRestoreConfirm}
              disabled={restoring}
            >
              {restoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Herstellen...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Terugzetten
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
