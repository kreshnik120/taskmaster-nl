import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const log = logger.create('DocumentService');

// Document types with their configurations
export interface DocumentConfig {
  type: string;
  label: string;
  category: 'basis' | 'zzp' | 'certificaat' | 'overig';
  required: boolean;
  hasExpiry: boolean;
  expiryMonths?: number; // How many months until expiry (e.g., VOG = 3 months)
}

export const DOCUMENT_CONFIGS: Record<string, DocumentConfig> = {
  cv: { type: 'cv', label: 'CV', category: 'basis', required: true, hasExpiry: false },
  vog: { type: 'vog', label: 'VOG', category: 'basis', required: true, hasExpiry: true, expiryMonths: 3 },
  diploma: { type: 'diploma', label: 'Diploma', category: 'basis', required: true, hasExpiry: false },
  kvk_uittreksel: { type: 'kvk_uittreksel', label: 'KVK Uittreksel', category: 'zzp', required: true, hasExpiry: false },
  beroepsaansprakelijkheid: { type: 'beroepsaansprakelijkheid', label: 'Beroepsaansprakelijkheidsverzekering', category: 'zzp', required: true, hasExpiry: true, expiryMonths: 12 },
  bhv_certificaat: { type: 'bhv_certificaat', label: 'BHV Certificaat', category: 'zzp', required: false, hasExpiry: true, expiryMonths: 24 },
  identiteitsbewijs: { type: 'identiteitsbewijs', label: 'Identiteitsbewijs', category: 'zzp', required: true, hasExpiry: false },
  klachtenportaal_wkkgz: { type: 'klachtenportaal_wkkgz', label: 'Klachtenportaal WKKGZ', category: 'zzp', required: false, hasExpiry: false },
  tillift_certificaat: { type: 'tillift_certificaat', label: 'Tillift Certificaat', category: 'zzp', required: false, hasExpiry: true, expiryMonths: 24 },
};

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: string;
  filename: string;
  file_path: string;
  category: string;
  source: string;
  is_verified: boolean;
  verified_at: string | null;
  expiry_date: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  content_type: string | null;
  metadata: Record<string, unknown> | null;
}

export interface DocumentCompleteness {
  required: DocumentConfig[];
  optional: DocumentConfig[];
  present: string[];
  missing: string[];
  expiring: { type: string; expiryDate: string; daysRemaining: number }[];
  expired: { type: string; expiryDate: string }[];
  completenessPercentage: number;
}

/**
 * Get all documents for an application from the centralized application_documents table
 */
export async function getApplicationDocuments(applicationId: string): Promise<ApplicationDocument[]> {
  const { data, error } = await supabase
    .from('application_documents')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });

  if (error) {
    log.error('Error fetching application documents:', error);
    throw error;
  }

  return (data || []) as ApplicationDocument[];
}

/**
 * Get document completeness status for an application
 */
export async function getDocumentCompleteness(
  applicationId: string,
  werkvorm: string = 'loondienst'
): Promise<DocumentCompleteness> {
  const documents = await getApplicationDocuments(applicationId);
  const presentTypes = documents.map(d => d.document_type);

  // Determine required documents based on werkvorm
  const isZZP = werkvorm?.toLowerCase() === 'zzp';
  
  const required: DocumentConfig[] = [];
  const optional: DocumentConfig[] = [];
  
  Object.values(DOCUMENT_CONFIGS).forEach(config => {
    if (config.category === 'basis') {
      if (config.required) required.push(config);
      else optional.push(config);
    } else if (config.category === 'zzp' && isZZP) {
      if (config.required) required.push(config);
      else optional.push(config);
    }
  });

  const missing = required
    .filter(doc => !presentTypes.includes(doc.type))
    .map(doc => doc.type);

  const present = required
    .filter(doc => presentTypes.includes(doc.type))
    .map(doc => doc.type);

  // Check for expiring documents
  const now = new Date();
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  
  const expiring: { type: string; expiryDate: string; daysRemaining: number }[] = [];
  const expired: { type: string; expiryDate: string }[] = [];

  documents.forEach(doc => {
    if (doc.expiry_date) {
      const expiryDate = new Date(doc.expiry_date);
      if (expiryDate < now) {
        expired.push({ type: doc.document_type, expiryDate: doc.expiry_date });
      } else if (expiryDate <= fourteenDaysFromNow) {
        const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        expiring.push({ type: doc.document_type, expiryDate: doc.expiry_date, daysRemaining });
      }
    }
  });

  // Calculate completeness percentage (expired docs don't count as complete)
  const validPresent = present.filter(type => !expired.some(e => e.type === type));
  const completenessPercentage = required.length > 0 
    ? Math.round((validPresent.length / required.length) * 100)
    : 100;

  return {
    required,
    optional,
    present,
    missing,
    expiring,
    expired,
    completenessPercentage
  };
}

/**
 * Check for documents that are expiring within a certain number of days
 */
export async function checkExpiringDocuments(daysAhead: number = 14): Promise<{
  applicationId: string;
  candidateName: string;
  email: string;
  documentType: string;
  expiryDate: string;
  daysRemaining: number;
}[]> {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const { data, error } = await supabase
    .from('application_documents')
    .select(`
      id,
      application_id,
      document_type,
      expiry_date,
      professional_applications!inner (
        email_from,
        extracted_data
      )
    `)
    .not('expiry_date', 'is', null)
    .lte('expiry_date', futureDate.toISOString().split('T')[0])
    .gte('expiry_date', new Date().toISOString().split('T')[0]);

  if (error) {
    log.error('Error checking expiring documents:', error);
    throw error;
  }

  const now = new Date();
  return (data || []).map((doc: any) => {
    const expiryDate = new Date(doc.expiry_date);
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const extractedData = doc.professional_applications?.extracted_data as Record<string, unknown> || {};
    
    return {
      applicationId: doc.application_id,
      candidateName: (extractedData.naam as string) || 'Onbekend',
      email: doc.professional_applications?.email_from || '',
      documentType: doc.document_type,
      expiryDate: doc.expiry_date,
      daysRemaining
    };
  });
}

/**
 * Register a document in the centralized application_documents table
 */
export async function registerDocument(params: {
  applicationId: string;
  documentType: string;
  filename: string;
  filePath: string;
  category?: 'basis' | 'zzp' | 'certificaat' | 'overig';
  source?: 'manual_upload' | 'email_attachment' | 'api';
  expiryDate?: string | null;
  contentType?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ApplicationDocument> {
  const config = DOCUMENT_CONFIGS[params.documentType];
  const category = params.category || config?.category || 'basis';
  
  // Check if document already exists
  const { data: existing } = await supabase
    .from('application_documents')
    .select('id')
    .eq('application_id', params.applicationId)
    .eq('document_type', params.documentType)
    .maybeSingle();

  if (existing) {
    // Update existing document
    const { data, error } = await supabase
      .from('application_documents')
      .update({
        filename: params.filename,
        file_path: params.filePath,
        category,
        source: params.source || 'manual_upload',
        expiry_date: params.expiryDate,
        content_type: params.contentType,
        metadata: (params.metadata || {}) as Record<string, unknown> as any
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      log.error('Error updating document:', error);
      throw error;
    }

    return data as ApplicationDocument;
  }

  // Insert new document
  const { data, error } = await supabase
    .from('application_documents')
    .insert([{
      application_id: params.applicationId,
      document_type: params.documentType,
      filename: params.filename,
      file_path: params.filePath,
      category,
      source: params.source || 'manual_upload',
      expiry_date: params.expiryDate,
      content_type: params.contentType,
      metadata: (params.metadata || {}) as Record<string, unknown> as any
    }])
    .select()
    .single();

  if (error) {
    log.error('Error registering document:', error);
    throw error;
  }

  return data as ApplicationDocument;
}

/**
 * Calculate expiry date based on document type and issue date
 */
export function calculateExpiryDate(documentType: string, issueDate?: Date): Date | null {
  const config = DOCUMENT_CONFIGS[documentType];
  if (!config?.hasExpiry || !config.expiryMonths) return null;

  const baseDate = issueDate || new Date();
  const expiryDate = new Date(baseDate);
  expiryDate.setMonth(expiryDate.getMonth() + config.expiryMonths);
  
  return expiryDate;
}

/**
 * Mark a document as verified
 */
export async function markDocumentVerified(
  documentId: string,
  verifiedBy: string
): Promise<void> {
  const { error } = await supabase
    .from('application_documents')
    .update({
      is_verified: true,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy
    })
    .eq('id', documentId);

  if (error) {
    log.error('Error marking document as verified:', error);
    throw error;
  }
}

// Complete document field mapping for orphan detection and cleanup
const DOCUMENT_FIELD_MAP: Record<string, { 
  path: string; 
  status: string | null; 
  extras: string[];
  bucket: 'application-cvs' | 'application-documents' | 'zzp-documents';
}> = {
  // Basis documents
  cv: { 
    path: 'cv_file_path', 
    status: null, 
    extras: ['cv_file_name'],
    bucket: 'application-cvs'
  },
  vog: { 
    path: 'vog_file_path',
    status: 'vog_validation_status',
    extras: ['vog_verification_response'],
    bucket: 'application-documents'
  },
  diploma: { 
    path: 'diploma_file_path', 
    status: 'diploma_validation_status',
    extras: ['diploma_verification_response', 'duo_verification_result', 'duo_verified_at'],
    bucket: 'application-documents'
  },
  // ZZP documents
  beroepsaansprakelijkheid: {
    path: 'beroepsaansprakelijkheid_path',
    status: null,
    extras: [],
    bucket: 'zzp-documents'
  },
  kvk_uittreksel: {
    path: 'kvk_uittreksel_path',
    status: null,
    extras: [],
    bucket: 'zzp-documents'
  },
  klachtenportaal_wkkgz: {
    path: 'klachtenportaal_wkkgz_path',
    status: null,
    extras: [],
    bucket: 'zzp-documents'
  },
  identiteitsbewijs: {
    path: 'identiteitsbewijs_path',
    status: null,
    extras: [],
    bucket: 'zzp-documents'
  },
  bhv_certificaat: {
    path: 'bhv_certificaat_path',
    status: null,
    extras: [],
    bucket: 'zzp-documents'
  },
  tillift_certificaat: {
    path: 'tillift_certificaat_path',
    status: null,
    extras: [],
    bucket: 'zzp-documents'
  }
};

/**
 * Check if a document file actually exists in storage
 * If not found, optionally cleanup the orphan reference in the database
 */
export async function checkDocumentExistsInStorage(params: {
  applicationId: string;
  documentType: string;
  filePath: string | null;
  autoCleanupOrphan?: boolean;
}): Promise<{
  exists: boolean;
  wasOrphan: boolean;
  cleanedUp: boolean;
}> {
  if (!params.filePath) {
    return { exists: false, wasOrphan: false, cleanedUp: false };
  }

  const config = DOCUMENT_FIELD_MAP[params.documentType];
  if (!config) {
    log.warn(`Unknown document type for storage check: ${params.documentType}`);
    return { exists: false, wasOrphan: false, cleanedUp: false };
  }
  
  try {
    // Try to get a signed URL - this validates file existence without downloading
    const { data, error } = await supabase.storage
      .from(config.bucket)
      .createSignedUrl(params.filePath, 1);

    if (error) {
      log.warn(`Document not found in storage: ${params.documentType}`, params.filePath, error.message);
      
      if (params.autoCleanupOrphan) {
        await cleanupOrphanDocument(params.applicationId, params.documentType);
        return { exists: false, wasOrphan: true, cleanedUp: true };
      }
      
      return { exists: false, wasOrphan: true, cleanedUp: false };
    }

    return { exists: true, wasOrphan: false, cleanedUp: false };
  } catch (e) {
    log.error('Error checking document storage:', e);
    return { exists: false, wasOrphan: false, cleanedUp: false };
  }
}

/**
 * Batch check multiple documents in storage for an application
 * Uses Promise.all for parallel checking - much more efficient than sequential
 */
export async function batchCheckDocumentsInStorage(params: {
  applicationId: string;
  documents: { type: string; filePath: string | null }[];
  autoCleanupOrphans?: boolean;
}): Promise<Record<string, { exists: boolean; wasOrphan: boolean; cleanedUp: boolean }>> {
  const results: Record<string, { exists: boolean; wasOrphan: boolean; cleanedUp: boolean }> = {};
  
  await Promise.all(
    params.documents.map(async (doc) => {
      if (!doc.filePath) {
        results[doc.type] = { exists: false, wasOrphan: false, cleanedUp: false };
        return;
      }
      
      results[doc.type] = await checkDocumentExistsInStorage({
        applicationId: params.applicationId,
        documentType: doc.type,
        filePath: doc.filePath,
        autoCleanupOrphan: params.autoCleanupOrphans
      });
    })
  );
  
  return results;
}

/**
 * Cleanup orphan document reference from database when file is missing in storage
 */
async function cleanupOrphanDocument(applicationId: string, documentType: string): Promise<void> {
  const config = DOCUMENT_FIELD_MAP[documentType];
  if (!config) {
    log.warn(`Unknown document type for cleanup: ${documentType}`);
    return;
  }

  const updateData: Record<string, unknown> = { [config.path]: null };
  if (config.status) updateData[config.status] = 'missing';
  config.extras.forEach(field => updateData[field] = null);

  const { error } = await supabase
    .from('professional_applications')
    .update(updateData)
    .eq('id', applicationId);

  if (error) {
    log.error('Error cleaning up orphan document:', error);
    return;
  }

  log.debug(`Orphan document cleaned up: ${documentType} for application ${applicationId}`);
  
  // Log the orphan detection in audit trail
  try {
    const { logDocumentAction } = await import('@/lib/documentAuditLogger');
    await logDocumentAction({
      applicationId,
      documentType,
      action: 'orphan_detected',
      metadata: { reason: 'file_not_in_storage', auto_cleanup: true }
    });
  } catch (e) {
    log.warn('Could not log orphan detection:', e);
  }
}

/**
 * Get documents summary for dashboard/widgets
 */
export async function getDocumentsSummary(orgId?: string): Promise<{
  totalApplicationsWithMissingDocs: number;
  expiringWithin7Days: number;
  expiringWithin14Days: number;
  expiredCount: number;
}> {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fourteenDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Get expiring counts
  const { data: expiringDocs, error: expiringError } = await supabase
    .from('application_documents')
    .select('expiry_date')
    .not('expiry_date', 'is', null)
    .lte('expiry_date', fourteenDays.toISOString().split('T')[0]);

  if (expiringError) {
    log.error('Error fetching expiring documents:', expiringError);
    throw expiringError;
  }

  let expiredCount = 0;
  let expiringWithin7Days = 0;
  let expiringWithin14Days = 0;

  (expiringDocs || []).forEach((doc: { expiry_date: string }) => {
    const expiryDate = new Date(doc.expiry_date);
    if (expiryDate < now) {
      expiredCount++;
    } else if (expiryDate <= sevenDays) {
      expiringWithin7Days++;
    } else if (expiryDate <= fourteenDays) {
      expiringWithin14Days++;
    }
  });

  // Get applications with missing required documents
  // This is a simplified check - in production you'd want to check per-application
  const { count: totalApps } = await supabase
    .from('professional_applications')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .neq('pipeline_stage', 'geplaatst');

  const { count: appsWithAllDocs } = await supabase
    .from('professional_applications')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .neq('pipeline_stage', 'geplaatst')
    .not('cv_file_path', 'is', null)
    .not('diploma_file_path', 'is', null);

  const totalApplicationsWithMissingDocs = (totalApps || 0) - (appsWithAllDocs || 0);

  return {
    totalApplicationsWithMissingDocs,
    expiringWithin7Days,
    expiringWithin14Days,
    expiredCount
  };
}
