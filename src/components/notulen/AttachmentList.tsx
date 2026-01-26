import { useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { File, FileText, Image, Download, Eye, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { MeetingAttachment } from "@/hooks/notulen/useAttachments";
import { useDeleteAttachment } from "@/hooks/notulen/useDeleteAttachment";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getFileCategory, formatFileSize, canPreview } from "@/lib/fileHelpers";
import { MeetingAttachmentPreviewModal } from "./MeetingAttachmentPreviewModal";

interface AttachmentListProps {
  attachments: MeetingAttachment[];
  isLoading: boolean;
  isEditMode: boolean;
}

function getFileIcon(fileName: string) {
  const category = getFileCategory(fileName);
  switch (category) {
    case 'pdf':
      return <FileText className="h-5 w-5 text-red-500" />;
    case 'word':
      return <FileText className="h-5 w-5 text-blue-500" />;
    case 'excel':
      return <FileText className="h-5 w-5 text-green-500" />;
    case 'image':
      return <Image className="h-5 w-5 text-purple-500" />;
    default:
      return <File className="h-5 w-5 text-muted-foreground" />;
  }
}

interface AttachmentRowProps {
  attachment: MeetingAttachment;
  isEditMode: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function AttachmentRow({ 
  attachment, 
  isEditMode, 
  onPreview, 
  onDownload, 
  onDelete,
  isDeleting 
}: AttachmentRowProps) {
  const isPreviewable = canPreview(attachment.file_name);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group">
      <div className="shrink-0 mt-0.5">
        {getFileIcon(attachment.file_name)}
      </div>
      
      <div className="flex-1 min-w-0">
        <p 
          className="text-sm font-medium truncate" 
          title={attachment.file_name}
        >
          {attachment.file_name}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatFileSize(attachment.file_size)} • Geüpload door {attachment.uploaded_by_name} op{' '}
          {format(new Date(attachment.created_at), 'd MMM yyyy', { locale: nl })}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {isPreviewable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onPreview}
            title="Bekijken"
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onDownload}
          title="Download"
        >
          <Download className="h-4 w-4" />
        </Button>

        {isEditMode && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            disabled={isDeleting}
            title="Verwijderen"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function AttachmentSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
      <Skeleton className="h-5 w-5 rounded" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function AttachmentList({ attachments, isLoading, isEditMode }: AttachmentListProps) {
  const { deleteAttachment, isDeleting } = useDeleteAttachment();
  const [deleteTarget, setDeleteTarget] = useState<MeetingAttachment | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<MeetingAttachment | null>(null);

  const handleDownload = async (attachment: MeetingAttachment) => {
    try {
      const { data, error } = await supabase.storage
        .from('meeting-attachments')
        .download(attachment.file_path);

      if (error) throw error;

      // Create blob URL and trigger download
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast.error("Kon bestand niet downloaden");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      await deleteAttachment(
        deleteTarget.id, 
        deleteTarget.file_path, 
        deleteTarget.meeting_minute_id
      );
    } finally {
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <AttachmentSkeleton />
        <AttachmentSkeleton />
      </div>
    );
  }

  if (attachments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        Nog geen bijlagen toegevoegd
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {attachments.map((attachment) => (
          <AttachmentRow
            key={attachment.id}
            attachment={attachment}
            isEditMode={isEditMode}
            onPreview={() => setPreviewAttachment(attachment)}
            onDownload={() => handleDownload(attachment)}
            onDelete={() => setDeleteTarget(attachment)}
            isDeleting={isDeleting && deleteTarget?.id === attachment.id}
          />
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bijlage verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.file_name}" wordt permanent verwijderd. 
              Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview modal */}
      <MeetingAttachmentPreviewModal
        attachment={previewAttachment}
        open={!!previewAttachment}
        onOpenChange={(open) => !open && setPreviewAttachment(null)}
        onDownload={() => previewAttachment && handleDownload(previewAttachment)}
      />
    </>
  );
}
