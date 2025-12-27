import { supabase } from '@/integrations/supabase/client';

export type DocumentAction = 'upload' | 'download' | 'preview' | 'inline_preview' | 'delete';
export type DocumentType = 'cv' | 'vog' | 'diploma' | string; // string for ZZP types

interface AuditLogParams {
  applicationId: string;
  documentType: DocumentType;
  action: DocumentAction;
  filePath?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Log a document action to the audit trail.
 * This function fails silently to avoid breaking document operations.
 */
export async function logDocumentAction({
  applicationId,
  documentType,
  action,
  filePath,
  metadata = {}
}: AuditLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.warn('Cannot log document action: no authenticated user');
      return;
    }

    const { error } = await supabase
      .from('document_audit_logs')
      .insert({
        application_id: applicationId,
        document_type: documentType,
        action,
        file_path: filePath || null,
        performed_by: user.id,
        metadata: {
          ...metadata,
          timestamp_client: new Date().toISOString()
        },
        user_agent: navigator.userAgent
      });

    if (error) {
      console.error('Failed to log document action:', error);
    }
  } catch (error) {
    // Silently fail - audit logging should not break functionality
    console.error('Failed to log document action:', error);
  }
}
