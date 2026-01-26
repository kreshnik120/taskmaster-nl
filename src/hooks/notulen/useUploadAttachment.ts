import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_ATTACHMENTS_QUERY_KEY } from "./useAttachments";
import { toast } from "sonner";

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
] as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_FILES_PER_UPLOAD = 5;

export interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface UploadAttachmentInput {
  meetingMinuteId: string;
  orgId: string;
  file: File;
}

interface UploadResult {
  successCount: number;
  failCount: number;
}

function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "Bestand te groot. Maximum is 10 MB." };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    return { valid: false, error: "Bestandstype niet toegestaan. Gebruik PDF, Word, Excel of afbeeldingen." };
  }
  return { valid: true };
}

function sanitizeFileName(fileName: string): string {
  // Remove special characters, keep alphanumeric, dots, dashes, underscores
  const sanitized = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  // Limit length
  return sanitized.substring(0, 100);
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);

  const uploadAttachment = useCallback(async ({ 
    meetingMinuteId, 
    orgId, 
    file 
  }: UploadAttachmentInput): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Niet ingelogd");

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Sanitize filename and create unique path
    const sanitizedName = sanitizeFileName(file.name);
    const filePath = `${orgId}/${meetingMinuteId}/${crypto.randomUUID()}_${sanitizedName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('meeting-attachments')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error("Upload mislukt. Probeer het opnieuw.");
    }

    // Insert database record
    const { error: dbError } = await supabase
      .from('meeting_minute_attachments')
      .insert({
        meeting_minute_id: meetingMinuteId,
        org_id: orgId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: user.id,
      });

    if (dbError) {
      // Rollback: delete from storage
      await supabase.storage.from('meeting-attachments').remove([filePath]);
      console.error('Database insert error:', dbError);
      throw new Error("Kon bijlage niet registreren.");
    }

    await queryClient.invalidateQueries({ 
      queryKey: [...MEETING_ATTACHMENTS_QUERY_KEY, meetingMinuteId] 
    });
  }, [queryClient]);

  const uploadMultiple = useCallback(async (
    meetingMinuteId: string,
    orgId: string,
    files: File[]
  ): Promise<UploadResult> => {
    if (files.length > MAX_FILES_PER_UPLOAD) {
      toast.error(`Maximaal ${MAX_FILES_PER_UPLOAD} bestanden tegelijk uploaden.`);
      return { successCount: 0, failCount: files.length };
    }

    // Validate all files first
    const validationResults = files.map(file => ({
      file,
      validation: validateFile(file)
    }));

    const invalidFiles = validationResults.filter(r => !r.validation.valid);
    if (invalidFiles.length > 0) {
      for (const { file, validation } of invalidFiles) {
        toast.error(`${file.name}: ${validation.error}`);
      }
      if (invalidFiles.length === files.length) {
        return { successCount: 0, failCount: files.length };
      }
    }

    const validFiles = validationResults.filter(r => r.validation.valid).map(r => r.file);

    // Initialize progress
    setUploadProgress(validFiles.map(file => ({
      fileName: file.name,
      progress: 0,
      status: 'pending',
    })));

    setIsUploading(true);

    let successCount = 0;
    let failCount = invalidFiles.length;

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      
      // Update progress to uploading
      setUploadProgress(prev => prev.map((p, idx) => 
        idx === i ? { ...p, status: 'uploading' as const, progress: 30 } : p
      ));

      try {
        await uploadAttachment({ meetingMinuteId, orgId, file });
        
        // Update progress to success
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'success' as const, progress: 100 } : p
        ));
        
        successCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout';
        
        // Update progress to error
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'error' as const, error: message } : p
        ));
        
        failCount++;
      }
    }

    setIsUploading(false);

    // Show summary toast
    if (successCount > 0 && failCount === 0) {
      toast.success(`${successCount} bijlage${successCount > 1 ? 'n' : ''} geüpload`);
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(`${successCount} geüpload, ${failCount} mislukt`);
    }

    // Clear progress after delay
    setTimeout(() => {
      setUploadProgress([]);
    }, 3000);

    return { successCount, failCount };
  }, [uploadAttachment]);

  const clearProgress = useCallback(() => {
    setUploadProgress([]);
  }, []);

  return { 
    uploadAttachment, 
    uploadMultiple,
    isUploading, 
    uploadProgress,
    clearProgress,
  };
}
