import { useState, useEffect, useCallback } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import {
  FileText,
  Edit2,
  Loader2,
  X,
  Save,
  FileDown,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MeetingMinute } from "@/hooks/useMeetingMinutes";
import { useUpdateMeetingMinute } from "@/hooks/notulen/useUpdateMeetingMinute";
import { useDeleteMeetingMinute } from "@/hooks/notulen/useDeleteMeetingMinute";
import { generateMeetingMinutesPDF } from "@/utils/generateMeetingMinutesPDF";
import { StatusSelector } from "./StatusSelector";
import { EditableMetaSection } from "./EditableMetaSection";
import { EditableAgendaSection } from "./EditableAgendaSection";
import { EditableDecisionsSection } from "./EditableDecisionsSection";
import { EditableAttendeesSection } from "./EditableAttendeesSection";
import { toast } from "sonner";

interface MeetingMinuteDetailProps {
  minute: MeetingMinute | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

// Status badge helper (for view mode)
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

// Section component for consistent styling
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
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
  const { updateMeetingMinute, isUpdating } = useUpdateMeetingMinute();
  const { deleteMeetingMinute, isDeleting } = useDeleteMeetingMinute();
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Edited values
  const [editedLocation, setEditedLocation] = useState("");
  const [editedMeetingLink, setEditedMeetingLink] = useState("");
  const [editedNextMeetingDate, setEditedNextMeetingDate] = useState<Date | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [editedStatus, setEditedStatus] = useState<string>("");
  
  // Track if there are unsaved changes
  const hasChanges = minute && (
    editedLocation !== (minute.location || "") ||
    editedMeetingLink !== (minute.meeting_link || "") ||
    editedContent !== (minute.content || "") ||
    editedStatus !== (minute.status || "draft") ||
    (editedNextMeetingDate?.toISOString() || null) !== (minute.next_meeting_date || null)
  );

  // Reset edited values when minute changes or edit mode is entered
  const resetEditedValues = useCallback(() => {
    if (minute) {
      setEditedLocation(minute.location || "");
      setEditedMeetingLink(minute.meeting_link || "");
      setEditedContent(minute.content || "");
      setEditedStatus(minute.status || "draft");
      setEditedNextMeetingDate(
        minute.next_meeting_date ? new Date(minute.next_meeting_date) : null
      );
    }
  }, [minute]);

  // Reset when minute changes
  useEffect(() => {
    resetEditedValues();
  }, [minute?.id, resetEditedValues]);

  // Reset edit mode when sheet closes
  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
    }
  }, [open]);

  const handleCancelEdit = useCallback(() => {
    if (hasChanges) {
      setShowDiscardDialog(true);
    } else {
      setIsEditMode(false);
      resetEditedValues();
    }
  }, [hasChanges, resetEditedValues]);

  const handleSave = useCallback(async () => {
    if (!minute || isUpdating) return;

    await updateMeetingMinute(minute.id, {
      location: editedLocation || null,
      meeting_link: editedMeetingLink || null,
      next_meeting_date: editedNextMeetingDate?.toISOString() || null,
      content: editedContent || null,
      status: editedStatus as 'draft' | 'pending_approval' | 'approved' | 'archived',
    });

    setIsEditMode(false);
  }, [minute, isUpdating, updateMeetingMinute, editedLocation, editedMeetingLink, editedNextMeetingDate, editedContent, editedStatus]);

  // Keyboard support: Escape + Cmd/Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      
      // Escape = Cancel edit
      if (e.key === "Escape" && isEditMode) {
        e.preventDefault();
        handleCancelEdit();
      }
      
      // Cmd/Ctrl + S = Save
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && isEditMode) {
        e.preventDefault();
        if (hasChanges && !isUpdating) {
          handleSave();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEditMode, open, hasChanges, isUpdating, handleCancelEdit, handleSave]);

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false);
    setIsEditMode(false);
    resetEditedValues();
  };

  const handleEnterEditMode = () => {
    resetEditedValues();
    setIsEditMode(true);
  };

  const handleExportPDF = async () => {
    if (!minute) return;
    
    setIsExporting(true);
    try {
      await generateMeetingMinutesPDF({ minute });
      toast.success("PDF gedownload");
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error("Kon PDF niet genereren");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!minute) return;
    
    try {
      await deleteMeetingMinute(minute.id);
      setShowDeleteDialog(false);
      onOpenChange(false); // Close sheet
    } catch (error) {
      // Error already handled in hook with toast
    }
  };

  if (!minute) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          className={cn(
            "w-full sm:max-w-xl flex flex-col",
            isEditMode && "bg-muted/20"
          )}
        >
          <SheetHeader className="space-y-3">
            {/* Type + Status badges */}
            <div className="flex items-center gap-2">
              {getTypeBadge(minute.meeting_type)}
              {isEditMode ? (
                <StatusSelector
                  currentStatus={editedStatus}
                  onStatusChange={setEditedStatus}
                  disabled={isUpdating}
                />
              ) : (
                getStatusBadge(minute.status)
              )}
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
              <EditableMetaSection
                minute={minute}
                isEditMode={isEditMode}
                editedLocation={editedLocation}
                editedMeetingLink={editedMeetingLink}
                editedNextMeetingDate={editedNextMeetingDate}
                onLocationChange={setEditedLocation}
                onMeetingLinkChange={setEditedMeetingLink}
                onNextMeetingDateChange={setEditedNextMeetingDate}
              />

              {/* AGENDA Section */}
              <EditableAgendaSection minute={minute} isEditMode={isEditMode} />

              {/* DECISIONS Section */}
              <EditableDecisionsSection minute={minute} isEditMode={isEditMode} />

              {/* NOTES Section */}
              <Section icon={FileText} title="Notities">
                <Card className="p-4">
                  {isEditMode ? (
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      placeholder="Voeg notities toe..."
                      className="min-h-[120px]"
                    />
                  ) : minute.content ? (
                    <p className="text-sm whitespace-pre-wrap">{minute.content}</p>
                  ) : (
                    <EmptyState message="Geen notities toegevoegd" />
                  )}
                </Card>
              </Section>

              {/* ATTENDEES Section */}
              <EditableAttendeesSection minute={minute} isEditMode={isEditMode} />
            </div>
          </ScrollArea>

          <Separator className="my-4" />

          <SheetFooter className="flex-col sm:flex-row gap-2">
            {/* Approval info */}
            {!isEditMode && minute.approved_by && minute.approved_at && (
              <p className="text-xs text-muted-foreground flex-1">
                Goedgekeurd op{" "}
                {format(new Date(minute.approved_at), "d MMMM yyyy", {
                  locale: nl,
                })}
              </p>
            )}

            {isEditMode ? (
              <>
                {/* Delete button - left side */}
                <Button 
                  variant="ghost" 
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isDeleting || isUpdating}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Verwijderen
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={handleCancelEdit}
                  disabled={isUpdating}
                >
                  <X className="h-4 w-4 mr-2" />
                  Annuleren
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={isUpdating || !hasChanges}
                  title="Cmd/Ctrl + S"
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Opslaan
                </Button>
              </>
            ) : (
              <div className="flex gap-2 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  onClick={handleExportPDF}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4 mr-2" />
                  )}
                  Exporteer PDF
                </Button>
                <Button variant="outline" onClick={handleEnterEditMode}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Bewerken
                </Button>
              </div>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Discard changes confirmation dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wijzigingen negeren?</AlertDialogTitle>
            <AlertDialogDescription>
              Je hebt niet-opgeslagen wijzigingen. Weet je zeker dat je deze wilt negeren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Terug</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>
              Wijzigingen negeren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notulen verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              "{minute.tasks?.title}" wordt permanent verwijderd inclusief alle agenda items, 
              beslissingen en deelnemers. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
