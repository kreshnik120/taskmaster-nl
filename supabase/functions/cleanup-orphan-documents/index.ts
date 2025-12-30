// Cleanup Orphan Documents - Scheduled background job
// Version 1.1.0 - Added overige_certificeringen_paths array handling
// Purpose: Scans for database references to files that don't exist in storage and cleans them up
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

const VERSION = '1.1.0';

// Document field mapping for professional_applications table
const DOCUMENT_FIELD_MAP: Record<string, {
  path: string;
  status: string | null;
  extras: string[];
  bucket: string;
}> = {
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

// Configuration
const MAX_APPLICATIONS_PER_RUN = 50;
const MAX_CONCURRENT_CHECKS = 10;
const DELAY_BETWEEN_BATCHES_MS = 500;

interface OrphanStats {
  professionalApplicationsScanned: number;
  applicationDocumentsScanned: number;
  orphansDetected: number;
  orphansCleaned: number;
  arrayOrphansDetected: number;
  arrayOrphansCleaned: number;
  errors: string[];
  details: Array<{
    applicationId: string;
    documentType: string;
    filePath: string;
    action: 'cleaned' | 'error';
    error?: string;
  }>;
}

// Check if file exists in storage using lightweight signed URL check
async function checkFileExists(
  supabase: ReturnType<typeof createAdminClient>,
  bucket: string,
  filePath: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 1); // 1 second expiry - just checking existence
    
    return !error && !!data?.signedUrl;
  } catch {
    return false;
  }
}

// Batch check files with rate limiting
async function batchCheckFiles(
  supabase: ReturnType<typeof createAdminClient>,
  checks: Array<{ bucket: string; filePath: string; id: string; docType: string }>
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  // Process in batches of MAX_CONCURRENT_CHECKS
  for (let i = 0; i < checks.length; i += MAX_CONCURRENT_CHECKS) {
    const batch = checks.slice(i, i + MAX_CONCURRENT_CHECKS);
    
    const batchResults = await Promise.all(
      batch.map(async ({ bucket, filePath, id, docType }) => {
        const exists = await checkFileExists(supabase, bucket, filePath);
        return { key: `${id}:${docType}`, exists };
      })
    );
    
    batchResults.forEach(({ key, exists }) => {
      results.set(key, exists);
    });
    
    // Rate limiting delay between batches
    if (i + MAX_CONCURRENT_CHECKS < checks.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }
  
  return results;
}

// Scan and cleanup professional_applications table
async function scanProfessionalApplications(
  supabase: ReturnType<typeof createAdminClient>,
  stats: OrphanStats
): Promise<void> {
  console.log('📋 Scanning professional_applications for orphan documents...');
  
  // Build select columns dynamically
  const pathColumns = Object.values(DOCUMENT_FIELD_MAP).map(f => f.path);
  const selectColumns = ['id', 'email_from', ...pathColumns].join(', ');
  
  // Build OR filter for any non-null file path
  const orFilter = pathColumns.map(col => `${col}.not.is.null`).join(',');
  
  const { data: applications, error } = await supabase
    .from('professional_applications')
    .select(selectColumns)
    .or(orFilter)
    .is('deleted_at', null)
    .limit(MAX_APPLICATIONS_PER_RUN);
  
  if (error) {
    console.error('❌ Error fetching applications:', error);
    stats.errors.push(`Failed to fetch applications: ${error.message}`);
    return;
  }
  
  if (!applications || applications.length === 0) {
    console.log('✅ No applications with file paths found');
    return;
  }
  
  stats.professionalApplicationsScanned = applications.length;
  console.log(`📊 Found ${applications.length} applications with file paths`);
  
  // Collect all file checks needed
  const checks: Array<{ bucket: string; filePath: string; id: string; docType: string }> = [];
  
  // Type the applications properly
  type ApplicationRecord = Record<string, unknown> & { id: string };
  const typedApplications = applications as unknown as ApplicationRecord[];
  
  for (const app of typedApplications) {
    for (const [docType, config] of Object.entries(DOCUMENT_FIELD_MAP)) {
      const filePath = app[config.path] as string | null;
      if (filePath) {
        checks.push({
          bucket: config.bucket,
          filePath,
          id: app.id,
          docType
        });
      }
    }
  }
  
  console.log(`🔍 Checking ${checks.length} file paths in storage...`);
  
  // Batch check all files
  const existenceMap = await batchCheckFiles(supabase, checks);
  
  // Process orphans
  for (const app of typedApplications) {
    for (const [docType, config] of Object.entries(DOCUMENT_FIELD_MAP)) {
      const filePath = app[config.path] as string | null;
      if (!filePath) continue;
      
      const exists = existenceMap.get(`${app.id}:${docType}`);
      
      if (!exists) {
        stats.orphansDetected++;
        console.log(`🗑️ Orphan detected: ${docType} for application ${app.id}`);
        
        // Build update object to clear all related fields
        const updateFields: Record<string, null> = {
          [config.path]: null
        };
        
        if (config.status) {
          updateFields[config.status] = null;
        }
        
        for (const extra of config.extras) {
          updateFields[extra] = null;
        }
        
        // Clear the orphan reference
        const { error: updateError } = await supabase
          .from('professional_applications')
          .update(updateFields)
          .eq('id', app.id);
        
        if (updateError) {
          console.error(`❌ Failed to cleanup ${docType} for ${app.id}:`, updateError);
          stats.errors.push(`Failed to cleanup ${docType} for ${app.id}: ${updateError.message}`);
          stats.details.push({
            applicationId: app.id,
            documentType: docType,
            filePath,
            action: 'error',
            error: updateError.message
          });
        } else {
          stats.orphansCleaned++;
          stats.details.push({
            applicationId: app.id,
            documentType: docType,
            filePath,
            action: 'cleaned'
          });
          console.log(`✅ Cleaned orphan ${docType} for application ${app.id}`);
        }
      }
    }
  }
}

// Scan and cleanup application_documents table
async function scanApplicationDocuments(
  supabase: ReturnType<typeof createAdminClient>,
  stats: OrphanStats
): Promise<void> {
  console.log('📋 Scanning application_documents for orphan records...');
  
  const { data: documents, error } = await supabase
    .from('application_documents')
    .select('id, file_path, document_type, application_id')
    .not('file_path', 'is', null);
  
  if (error) {
    console.error('❌ Error fetching application_documents:', error);
    stats.errors.push(`Failed to fetch application_documents: ${error.message}`);
    return;
  }
  
  if (!documents || documents.length === 0) {
    console.log('✅ No documents found in application_documents table');
    return;
  }
  
  stats.applicationDocumentsScanned = documents.length;
  console.log(`📊 Found ${documents.length} document records`);
  
  // Determine bucket based on document_type using DOCUMENT_FIELD_MAP for consistency
  const getBucket = (docType: string | null): string => {
    if (!docType) return 'application-documents';
    
    // Check DOCUMENT_FIELD_MAP first for consistency
    if (DOCUMENT_FIELD_MAP[docType]) {
      return DOCUMENT_FIELD_MAP[docType].bucket;
    }
    
    // Fallback logic for zzp documents
    if (docType.startsWith('zzp_') || ['beroepsaansprakelijkheid', 'kvk_uittreksel', 'klachtenportaal_wkkgz', 'identiteitsbewijs', 'bhv_certificaat', 'tillift_certificaat', 'overige_certificeringen'].includes(docType)) {
      return 'zzp-documents';
    }
    
    return 'application-documents';
  };
  
  // Collect checks
  const checks = documents.map(doc => ({
    bucket: getBucket(doc.document_type),
    filePath: doc.file_path,
    id: doc.id,
    docType: doc.document_type || 'unknown'
  }));
  
  console.log(`🔍 Checking ${checks.length} file paths in storage...`);
  
  // Batch check all files
  const existenceMap = await batchCheckFiles(supabase, checks);
  
  // Delete orphan records
  for (const doc of documents) {
    const exists = existenceMap.get(`${doc.id}:${doc.document_type || 'unknown'}`);
    
    if (!exists) {
      stats.orphansDetected++;
      console.log(`🗑️ Orphan record detected: ${doc.document_type} (ID: ${doc.id})`);
      
      const { error: deleteError } = await supabase
        .from('application_documents')
        .delete()
        .eq('id', doc.id);
      
      if (deleteError) {
        console.error(`❌ Failed to delete orphan record ${doc.id}:`, deleteError);
        stats.errors.push(`Failed to delete orphan record ${doc.id}: ${deleteError.message}`);
        stats.details.push({
          applicationId: doc.application_id,
          documentType: doc.document_type || 'unknown',
          filePath: doc.file_path,
          action: 'error',
          error: deleteError.message
        });
      } else {
        stats.orphansCleaned++;
        stats.details.push({
          applicationId: doc.application_id,
          documentType: doc.document_type || 'unknown',
          filePath: doc.file_path,
          action: 'cleaned'
        });
        console.log(`✅ Deleted orphan record ${doc.id}`);
      }
    }
  }
}

// Scan and cleanup overige_certificeringen_paths JSONB array
async function scanOverigeCertificeringen(
  supabase: ReturnType<typeof createAdminClient>,
  stats: OrphanStats
): Promise<void> {
  console.log('📋 Scanning overige_certificeringen_paths arrays for orphan files...');
  
  const { data: applications, error } = await supabase
    .from('professional_applications')
    .select('id, email_from, overige_certificeringen_paths')
    .not('overige_certificeringen_paths', 'is', null)
    .is('deleted_at', null)
    .limit(MAX_APPLICATIONS_PER_RUN);
  
  if (error) {
    console.error('❌ Error fetching applications with overige_certificeringen:', error);
    stats.errors.push(`Failed to fetch overige_certificeringen: ${error.message}`);
    return;
  }
  
  if (!applications || applications.length === 0) {
    console.log('✅ No applications with overige_certificeringen_paths found');
    return;
  }
  
  console.log(`📊 Found ${applications.length} applications with overige_certificeringen_paths`);
  
  for (const app of applications) {
    const paths = app.overige_certificeringen_paths as string[] | null;
    
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      continue;
    }
    
    // Check each path in the array
    const validPaths: string[] = [];
    const orphanPaths: string[] = [];
    
    for (const path of paths) {
      if (typeof path !== 'string' || !path) {
        continue;
      }
      
      const exists = await checkFileExists(supabase, 'zzp-documents', path);
      
      if (exists) {
        validPaths.push(path);
      } else {
        orphanPaths.push(path);
        stats.arrayOrphansDetected++;
        console.log(`🗑️ Array orphan detected: ${path} for application ${app.id}`);
      }
    }
    
    // Update if orphans were found
    if (orphanPaths.length > 0) {
      const newValue = validPaths.length > 0 ? validPaths : null;
      
      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ overige_certificeringen_paths: newValue })
        .eq('id', app.id);
      
      if (updateError) {
        console.error(`❌ Failed to cleanup array for ${app.id}:`, updateError);
        stats.errors.push(`Failed to cleanup array for ${app.id}: ${updateError.message}`);
        
        for (const path of orphanPaths) {
          stats.details.push({
            applicationId: app.id,
            documentType: 'overige_certificeringen',
            filePath: path,
            action: 'error',
            error: updateError.message
          });
        }
      } else {
        stats.arrayOrphansCleaned += orphanPaths.length;
        
        for (const path of orphanPaths) {
          stats.details.push({
            applicationId: app.id,
            documentType: 'overige_certificeringen',
            filePath: path,
            action: 'cleaned'
          });
        }
        
        console.log(`✅ Cleaned ${orphanPaths.length} array orphan(s) for application ${app.id}`);
      }
    }
    
    // Rate limiting between applications
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Log cleanup results to system_events
async function logCleanupResults(
  supabase: ReturnType<typeof createAdminClient>,
  stats: OrphanStats,
  durationMs: number
): Promise<void> {
  try {
    await supabase.from('system_events').insert({
      org_id: '550e8400-e29b-41d4-a716-446655440000',
      event_type: 'orphan_documents_cleanup',
      entity_type: 'documents',
      event_data: {
        run_at: new Date().toISOString(),
        version: VERSION,
        professional_applications_scanned: stats.professionalApplicationsScanned,
        application_documents_scanned: stats.applicationDocumentsScanned,
        orphans_detected: stats.orphansDetected,
        orphans_cleaned: stats.orphansCleaned,
        array_orphans_detected: stats.arrayOrphansDetected,
        array_orphans_cleaned: stats.arrayOrphansCleaned,
        errors_count: stats.errors.length,
        duration_ms: durationMs
      },
      metadata: {
        source: 'cleanup-orphan-documents',
        trigger: 'scheduler',
        details: stats.details.slice(0, 50), // Limit details to prevent huge logs
        errors: stats.errors.slice(0, 10)
      }
    });
    console.log('📝 Cleanup results logged to system_events');
  } catch (logError) {
    console.error('❌ Failed to log cleanup results:', logError);
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  console.log(`🧹 Cleanup Orphan Documents v${VERSION} started at:`, new Date().toISOString());

  try {
    const supabase = createAdminClient();
    
    const stats: OrphanStats = {
      professionalApplicationsScanned: 0,
      applicationDocumentsScanned: 0,
      orphansDetected: 0,
      orphansCleaned: 0,
      arrayOrphansDetected: 0,
      arrayOrphansCleaned: 0,
      errors: [],
      details: []
    };

    // Scan all document sources
    await scanProfessionalApplications(supabase, stats);
    await scanApplicationDocuments(supabase, stats);
    await scanOverigeCertificeringen(supabase, stats);

    const durationMs = Date.now() - startTime;

    // Log results
    await logCleanupResults(supabase, stats, durationMs);

    const totalOrphans = stats.orphansDetected + stats.arrayOrphansDetected;
    const totalCleaned = stats.orphansCleaned + stats.arrayOrphansCleaned;

    console.log(`✅ Cleanup completed in ${durationMs}ms`);
    console.log(`📊 Summary: ${totalOrphans} orphans detected, ${totalCleaned} cleaned`);

    return jsonResponse({
      success: true,
      version: VERSION,
      stats: {
        professionalApplicationsScanned: stats.professionalApplicationsScanned,
        applicationDocumentsScanned: stats.applicationDocumentsScanned,
        orphansDetected: stats.orphansDetected,
        orphansCleaned: stats.orphansCleaned,
        arrayOrphansDetected: stats.arrayOrphansDetected,
        arrayOrphansCleaned: stats.arrayOrphansCleaned,
        errorsCount: stats.errors.length
      },
      durationMs
    });

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
