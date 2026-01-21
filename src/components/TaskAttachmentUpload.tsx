import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Upload, 
  X, 
  FileText, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  File, 
  Loader2,
  Download,
  Trash2,
  Paperclip,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/fileHelpers";

interface Attachment {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

interface TaskAttachmentUploadProps {
  taskId?: string;
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  existingAttachments?: Attachment[];
  onAttachmentDeleted?: () => void;
  compact?: boolean;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB - verhoogd voor grote documenten
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp'
];

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['pdf'].includes(ext || '')) return <FileText className="h-4 w-4 text-red-500" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText className="h-4 w-4 text-blue-500" />;
  if (['xls', 'xlsx'].includes(ext || '')) return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return <ImageIcon className="h-4 w-4 text-purple-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
};

export function TaskAttachmentUpload({
  taskId,
  pendingFiles = [],
  onPendingFilesChange,
  existingAttachments = [],
  onAttachmentDeleted,
  compact = false
}: TaskAttachmentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name} is te groot. Maximaal 10MB toegestaan.`);
      return false;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(`${file.name} is geen toegestaan bestandstype.`);
      return false;
    }
    return true;
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const validFiles: File[] = [];
    Array.from(files).forEach(file => {
      if (validateFile(file)) {
        validFiles.push(file);
      }
    });

    if (validFiles.length > 0 && onPendingFilesChange) {
      onPendingFilesChange([...pendingFiles, ...validFiles]);
    }
  }, [pendingFiles, onPendingFilesChange]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    if (onPendingFilesChange) {
      const newFiles = [...pendingFiles];
      newFiles.splice(index, 1);
      onPendingFilesChange(newFiles);
    }
  };

  const downloadAttachment = async (attachment: Attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from('task-attachments')
        .download(attachment.url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download error:', error);
      toast.error('Kon bestand niet downloaden');
    }
  };

  const deleteAttachment = async (attachment: Attachment) => {
    if (!taskId) return;
    
    setDeleting(attachment.id);
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('task-attachments')
        .remove([attachment.url]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('attachments')
        .delete()
        .eq('id', attachment.id);

      if (dbError) throw dbError;

      toast.success('Bijlage verwijderd');
      onAttachmentDeleted?.();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Kon bijlage niet verwijderen');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Upload Area */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer",
          isDragging 
            ? "border-primary bg-primary/5" 
            : "border-muted-foreground/20 hover:border-muted-foreground/40",
          compact && "p-3"
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload className={cn("mx-auto text-muted-foreground", compact ? "h-6 w-6" : "h-8 w-8")} />
        <p className={cn("text-muted-foreground mt-2", compact ? "text-xs" : "text-sm")}>
          {isDragging ? "Laat los om te uploaden" : "Klik of sleep bestanden hierheen"}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          PDF, Word, Excel, afbeeldingen (max 50MB)
        </p>
      </div>

      {/* Pending Files */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {pendingFiles.length} bestand{pendingFiles.length > 1 ? 'en' : ''} geselecteerd
          </p>
          <div className="space-y-1.5">
      {pendingFiles.map((file, index) => (
              <div 
                key={`pending-${index}`} 
                className="flex items-center justify-between p-2.5 bg-primary/5 border border-primary/20 rounded-lg group animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="p-1.5 rounded-md bg-primary/10">
                    {getFileIcon(file.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 animate-in zoom-in duration-200" />
                </div>
                <Button 
                  type="button"
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing Attachments */}
      {existingAttachments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">
              Bestaande bijlagen ({existingAttachments.length})
            </p>
          </div>
          <div className="space-y-1.5">
            {existingAttachments.map((attachment) => (
              <div 
                key={attachment.id} 
                className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg border border-border/50 group hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getFileIcon(attachment.name)}
                  <span className="text-sm truncate">{attachment.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button 
                    type="button"
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7"
                    onClick={() => downloadAttachment(attachment)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button 
                    type="button"
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteAttachment(attachment)}
                    disabled={deleting === attachment.id}
                  >
                    {deleting === attachment.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Uploaden...</span>
          </div>
          <Progress value={uploadProgress} className="h-1.5" />
        </div>
      )}
    </div>
  );
}

// Helper function to upload files after task is created/updated
export interface UploadResult {
  success: number;
  failed: number;
  uploadedFiles: string[];
}

export async function uploadTaskAttachments(
  taskId: string, 
  files: File[],
  onProgress?: (fileIndex: number, progress: number, fileName: string) => void
): Promise<UploadResult> {
  const result: UploadResult = { success: 0, failed: 0, uploadedFiles: [] };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = `${taskId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    onProgress?.(i, 10, file.name);
    
    const { error: uploadError } = await supabase.storage
      .from('task-attachments')
      .upload(fileName, file);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      result.failed++;
      continue;
    }

    onProgress?.(i, 70, file.name);

    const { error: dbError } = await supabase
      .from('attachments')
      .insert({
        task_id: taskId,
        name: file.name,
        url: fileName,
        file_size: file.size
      });

    if (dbError) {
      console.error('DB error:', dbError);
      result.failed++;
    } else {
      result.success++;
      result.uploadedFiles.push(file.name);
      onProgress?.(i, 100, file.name);
    }
  }

  return result;
}
