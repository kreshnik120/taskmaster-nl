import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { FileText, Plus, Minus, Edit3, ChevronDown, Eye, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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

interface DescriptionChangeEntry {
  id: string;
  action_text: string;
  created_at: string;
  created_by_name?: string;
  metadata?: {
    old_description?: string | null;
    new_description?: string | null;
    change_type?: 'added' | 'modified' | 'removed';
    old_length?: number;
    new_length?: number;
    changed_by_name?: string;
  };
}

interface DescriptionTimelineProps {
  taskId: string;
  className?: string;
  onDescriptionRestore?: (description: string) => void;
  onCountChange?: (count: number) => void;
}

export function DescriptionTimeline({ 
  taskId, 
  className, 
  onDescriptionRestore,
  onCountChange 
}: DescriptionTimelineProps) {
  const [entries, setEntries] = useState<DescriptionChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<DescriptionChangeEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [descriptionToRestore, setDescriptionToRestore] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadDescriptionHistory();
  }, [taskId]);

  // Notify parent of count changes
  useEffect(() => {
    onCountChange?.(entries.length);
  }, [entries.length, onCountChange]);

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

  const getChangeBadge = (changeType?: string) => {
    switch (changeType) {
      case 'added':
        return <Badge variant="success" className="text-[10px] px-1.5 py-0">Toegevoegd</Badge>;
      case 'removed':
        return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Verwijderd</Badge>;
      case 'modified':
      default:
        return <Badge variant="info" className="text-[10px] px-1.5 py-0">Gewijzigd</Badge>;
    }
  };

  const formatRelativeDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    return format(date, "d MMM 'om' HH:mm", { locale: nl });
  };

  const truncateText = (text: string | null | undefined, maxLength: number = 100) => {
    if (!text) return null;
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const handleViewChange = (entry: DescriptionChangeEntry) => {
    setSelectedEntry(entry);
    setDialogOpen(true);
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

      // Close dialogs and refresh
      setRestoreConfirmOpen(false);
      setDialogOpen(false);
      setDescriptionToRestore(null);
      
      // Notify parent if callback provided
      onDescriptionRestore?.(descriptionToRestore);
      
      // Reload history to include the new change
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

  if (loading) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        Verloop laden...
      </div>
    );
  }

  if (entries.length === 0) {
    return null; // Don't show anything if there's no history
  }

  return (
    <>
      <div className={cn("mt-4", className)}>
        {/* Separator with count */}
        <div className="flex items-center gap-3 mb-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            Verloop ({entries.length})
          </span>
          <Separator className="flex-1" />
        </div>

        {/* Timeline entries with fade-in animation */}
        <div className="space-y-2">
          {entries.map((entry, index) => {
            const hasContent = entry.metadata?.old_description || entry.metadata?.new_description;
            
            return (
              <div 
                key={entry.id}
                className="flex items-start gap-2 text-sm group animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Timeline indicator */}
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center",
                    "bg-muted/50 group-hover:bg-muted transition-colors duration-200"
                  )}>
                    {getChangeIcon(entry.metadata?.change_type)}
                  </div>
                  {index < entries.length - 1 && (
                    <div className="w-px h-4 bg-border/50 mt-1" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDate(entry.created_at)}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs font-medium">
                      {entry.created_by_name}
                    </span>
                    {getChangeBadge(entry.metadata?.change_type)}
                  </div>

                  {/* Preview or action */}
                  {hasContent ? (
                    <HoverCard openDelay={300}>
                      <HoverCardTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 mt-1 text-xs text-primary/80 hover:text-primary transition-colors duration-200"
                          onClick={() => handleViewChange(entry)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Bekijk wijziging
                        </Button>
                      </HoverCardTrigger>
                      <HoverCardContent 
                        side="right" 
                        align="start"
                        className="w-80 max-h-48 overflow-auto text-xs"
                      >
                        {entry.metadata?.change_type === 'added' ? (
                          <div>
                            <span className="font-medium text-emerald-600">Toegevoegd:</span>
                            <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                              {truncateText(entry.metadata.new_description, 200)}
                            </p>
                          </div>
                        ) : entry.metadata?.change_type === 'removed' ? (
                          <div>
                            <span className="font-medium text-red-600">Verwijderd:</span>
                            <p className="mt-1 text-muted-foreground line-through whitespace-pre-wrap">
                              {truncateText(entry.metadata.old_description, 200)}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div>
                              <span className="font-medium text-muted-foreground">Was:</span>
                              <p className="mt-0.5 text-muted-foreground/70 line-through whitespace-pre-wrap">
                                {truncateText(entry.metadata?.old_description, 100)}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium text-emerald-600">Werd:</span>
                              <p className="mt-0.5 whitespace-pre-wrap">
                                {truncateText(entry.metadata?.new_description, 100)}
                              </p>
                            </div>
                          </div>
                        )}
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      Geen details beschikbaar
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedEntry && getChangeIcon(selectedEntry.metadata?.change_type)}
              Beschrijving wijziging
            </DialogTitle>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-4">
              {/* Meta info */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{formatRelativeDate(selectedEntry.created_at)}</span>
                <span>•</span>
                <span className="font-medium">{selectedEntry.created_by_name}</span>
                {getChangeBadge(selectedEntry.metadata?.change_type)}
              </div>

              {/* Content comparison */}
              {selectedEntry.metadata?.change_type === 'added' ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-emerald-600">Toegevoegde beschrijving:</h4>
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3">
                    <p className="text-sm whitespace-pre-wrap">
                      {selectedEntry.metadata.new_description || 'Geen inhoud'}
                    </p>
                  </div>
                </div>
              ) : selectedEntry.metadata?.change_type === 'removed' ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-600">Verwijderde beschrijving:</h4>
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
                    <p className="text-sm whitespace-pre-wrap line-through text-muted-foreground">
                      {selectedEntry.metadata.old_description || 'Geen inhoud'}
                    </p>
                  </div>
                  {/* Restore button for removed descriptions */}
                  {selectedEntry.metadata.old_description && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => handleRestoreClick(selectedEntry.metadata!.old_description!)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-2" />
                      Terugzetten naar oude versie
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Old version */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-muted-foreground">Oude versie:</h4>
                      {selectedEntry.metadata?.old_description && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleRestoreClick(selectedEntry.metadata!.old_description!)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Terugzetten
                        </Button>
                      )}
                    </div>
                    <div className="bg-muted/30 border border-border rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {selectedEntry.metadata?.old_description || 'Geen inhoud'}
                      </p>
                    </div>
                  </div>

                  {/* Arrow indicator */}
                  <div className="flex justify-center">
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  </div>

                  {/* New version */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-emerald-600">Nieuwe versie:</h4>
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedEntry.metadata?.new_description || 'Geen inhoud'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
