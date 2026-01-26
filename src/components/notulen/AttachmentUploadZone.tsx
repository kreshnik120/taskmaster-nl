import { useState, useRef, useCallback } from "react";
import { Upload, X, File, FileText, Image, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadAttachment, MAX_FILE_SIZE, MAX_FILES_PER_UPLOAD, UploadProgress } from "@/hooks/notulen/useUploadAttachment";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { getFileCategory } from "@/lib/fileHelpers";

interface AttachmentUploadZoneProps {
  meetingMinuteId: string;
  orgId: string;
  disabled?: boolean;
  compact?: boolean;
  onUploadComplete?: () => void;
}

function getFileIcon(fileName: string) {
  const category = getFileCategory(fileName);
  switch (category) {
    case 'pdf':
      return <FileText className="h-4 w-4 text-red-500" />;
    case 'word':
      return <FileText className="h-4 w-4 text-blue-500" />;
    case 'excel':
      return <FileText className="h-4 w-4 text-green-500" />;
    case 'image':
      return <Image className="h-4 w-4 text-purple-500" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}

function UploadProgressItem({ item }: { item: UploadProgress }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-muted/50 rounded-md">
      {item.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      {item.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
      {item.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
      {item.status === 'pending' && getFileIcon(item.fileName)}
      
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{item.fileName}</p>
        {item.status === 'uploading' && (
          <Progress value={item.progress} size="xs" className="mt-1" />
        )}
        {item.status === 'error' && item.error && (
          <p className="text-xs text-destructive truncate">{item.error}</p>
        )}
      </div>
    </div>
  );
}

export function AttachmentUploadZone({
  meetingMinuteId,
  orgId,
  disabled = false,
  compact = false,
  onUploadComplete,
}: AttachmentUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { uploadMultiple, isUploading, uploadProgress } = useUploadAttachment();

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const result = await uploadMultiple(meetingMinuteId, orgId, fileArray);
    
    if (result.successCount > 0) {
      onUploadComplete?.();
    }
  }, [meetingMinuteId, orgId, uploadMultiple, onUploadComplete]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  }, [disabled, isUploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || isUploading) return;

    const files = e.dataTransfer.files;
    handleFiles(files);
  }, [disabled, isUploading, handleFiles]);

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFiles]);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg transition-all cursor-pointer",
          compact ? "p-4" : "p-6",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          (disabled || isUploading) && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.xls,.xlsx"
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled || isUploading}
        />

        <div className="flex flex-col items-center text-center gap-2">
          {isUploading ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : (
            <Upload className={cn(
              "text-muted-foreground",
              compact ? "h-6 w-6" : "h-8 w-8"
            )} />
          )}
          
          <div className="space-y-1">
            <p className={cn(
              "font-medium text-foreground",
              compact ? "text-sm" : "text-base"
            )}>
              {isDragging ? "Laat los om te uploaden" : "Sleep bestanden hier"}
            </p>
            <p className="text-xs text-muted-foreground">
              of klik om te selecteren
            </p>
          </div>

          {!compact && (
            <p className="text-xs text-muted-foreground mt-2">
              PDF, Word, Excel, afbeeldingen (max. 10MB per bestand)
            </p>
          )}
        </div>
      </div>

      {/* Upload progress */}
      {uploadProgress.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Uploaden...
          </p>
          {uploadProgress.map((item, index) => (
            <UploadProgressItem key={index} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
