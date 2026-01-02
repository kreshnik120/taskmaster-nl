// Reverify Diploma Signatures - Automatic re-verification for signature_valid diplomas
// Version 1.1.0 - Concurrency lock with heartbeat
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

const VERSION = '1.1.0';
const COMPONENT_NAME = 'reverify-diploma-signatures';
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Statuses that can be re-verified (may upgrade to verified_duo)
const RE_VERIFIABLE_STATUSES = [
  'signature_valid',      // 95% confidence - can upgrade to 100%
  'duo_error',            // Previous DUO error - may be resolved now
  'duo_not_digital',      // Might actually have digital signature
  'manual_review',        // Automatic verification failed
];

// Configuration
const MAX_BATCH_SIZE = 10;           // Max diplomas per run (cost control)
const COOLDOWN_HOURS = 168;          // 7 days between attempts
const MAX_RETRIES = 3;               // Stop after 3 failed attempts

interface ReverificationResult {
  application_id: string;
  previous_status: string;
  new_status: string;
  upgraded: boolean;
  error?: string;
}

interface LockMetadata {
  component: string;
  started_at: string;
  last_heartbeat: string;
  triggered_by: string;
  candidates_count?: number;
  progress?: {
    current: number;
    total: number;
    upgraded: number;
    errors: number;
  };
  completed_at?: string;
  final_summary?: object;
  timeout_at?: string;
  error_at?: string;
}

async function acquireLock(supabase: ReturnType<typeof createAdminClient>, triggeredBy: string, candidatesCount: number) {
  // Check for existing running lock
  const { data: existingRun } = await supabase
    .from('orchestrator_state')
    .select('*')
    .eq('status', 'running')
    .filter('metadata->component', 'eq', COMPONENT_NAME)
    .maybeSingle();

  if (existingRun) {
    const metadata = existingRun.metadata as LockMetadata | null;
    const lastHeartbeat = metadata?.last_heartbeat;
    const timeSinceHeartbeat = lastHeartbeat 
      ? Date.now() - new Date(lastHeartbeat).getTime()
      : Infinity;

    if (timeSinceHeartbeat < HEARTBEAT_TIMEOUT_MS) {
      // Lock is active - block new run
      return {
        acquired: false,
        lockId: null,
        existingLock: existingRun,
        lockAgeSeconds: Math.round(timeSinceHeartbeat / 1000),
      };
    }
    
    // Stale lock - mark as timeout
    console.log(`⚠️ Stale lock detected (${Math.round(timeSinceHeartbeat / 1000)}s), marking as timeout`);
    await supabase
      .from('orchestrator_state')
      .update({ 
        status: 'timeout',
        metadata: { 
          ...metadata,
          timeout_at: new Date().toISOString() 
        }
      })
      .eq('id', existingRun.id);
  }

  // Create new lock
  const lockMetadata: LockMetadata = {
    component: COMPONENT_NAME,
    started_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
    triggered_by: triggeredBy,
    candidates_count: candidatesCount,
    progress: {
      current: 0,
      total: candidatesCount,
      upgraded: 0,
      errors: 0,
    },
  };

  const { data: lockRecord, error: lockError } = await supabase
    .from('orchestrator_state')
    .insert({
      org_id: '550e8400-e29b-41d4-a716-446655440000', // ABCzorg
      status: 'running',
      current_batch: 0,
      total_items_processed: 0,
      metadata: lockMetadata,
    })
    .select()
    .single();

  if (lockError) {
    console.error('❌ Failed to acquire lock:', lockError);
    return { acquired: false, lockId: null, existingLock: null, lockAgeSeconds: 0 };
  }

  console.log(`🔒 Lock acquired: ${lockRecord.id}`);
  return { acquired: true, lockId: lockRecord.id, existingLock: null, lockAgeSeconds: 0 };
}

async function updateHeartbeat(
  supabase: ReturnType<typeof createAdminClient>, 
  lockId: string, 
  progress: { current: number; total: number; upgraded: number; errors: number },
  metadata: LockMetadata
) {
  const updatedMetadata: LockMetadata = {
    ...metadata,
    last_heartbeat: new Date().toISOString(),
    progress,
  };

  await supabase
    .from('orchestrator_state')
    .update({
      current_batch: progress.current,
      total_items_processed: progress.current,
      metadata: updatedMetadata,
    })
    .eq('id', lockId);
}

async function releaseLock(
  supabase: ReturnType<typeof createAdminClient>, 
  lockId: string, 
  status: 'idle' | 'error',
  metadata: LockMetadata,
  summary?: object,
  errorMessage?: string
) {
  const updatedMetadata: LockMetadata = {
    ...metadata,
    last_heartbeat: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    final_summary: summary,
  };

  if (status === 'error') {
    updatedMetadata.error_at = new Date().toISOString();
  }

  await supabase
    .from('orchestrator_state')
    .update({
      status,
      error_message: errorMessage || null,
      metadata: updatedMetadata,
    })
    .eq('id', lockId);

  console.log(`🔓 Lock released: ${lockId} (status: ${status})`);
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  console.log(`🔄 Reverify Diploma Signatures v${VERSION} started`);

  const supabase = createAdminClient();
  let lockId: string | null = null;
  let lockMetadata: LockMetadata | null = null;

  try {
    // Parse optional body for manual trigger
    let forceReverify = false;
    let specificApplicationId: string | null = null;
    
    try {
      const body = await req.json();
      forceReverify = body?.force === true;
      specificApplicationId = body?.application_id || null;
    } catch {
      // No body or invalid JSON - continue with defaults
    }

    // Determine trigger type for logging
    const triggeredBy = specificApplicationId ? 'manual_single' : forceReverify ? 'manual' : 'scheduled';

    // Build query for candidates (before acquiring lock to check if there's work)
    let query = supabase
      .from('professional_applications')
      .select('id, diploma_file_path, diploma_validation_status, reverification_attempts, last_reverification_at, org_id, email_from')
      .not('diploma_file_path', 'is', null)
      .is('deleted_at', null);

    if (specificApplicationId) {
      query = query.eq('id', specificApplicationId);
      console.log(`📋 Manual trigger for application: ${specificApplicationId}`);
    } else {
      query = query
        .in('diploma_validation_status', RE_VERIFIABLE_STATUSES)
        .lt('reverification_attempts', MAX_RETRIES);
      
      if (!forceReverify) {
        const cooldownDate = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
        query = query.or(`last_reverification_at.is.null,last_reverification_at.lt.${cooldownDate}`);
      }
      
      query = query
        .order('last_reverification_at', { ascending: true, nullsFirst: true })
        .limit(MAX_BATCH_SIZE);
    }

    const { data: candidates, error: queryError } = await query;

    if (queryError) {
      console.error('❌ Query error:', queryError);
      return errorResponse(`Query failed: ${queryError.message}`, 500);
    }

    if (!candidates || candidates.length === 0) {
      console.log('✅ No candidates for re-verification');
      return jsonResponse({
        success: true,
        message: 'No candidates for re-verification',
        version: VERSION,
        duration_ms: Date.now() - startTime,
      });
    }

    // Try to acquire lock
    const lockResult = await acquireLock(supabase, triggeredBy, candidates.length);
    
    if (!lockResult.acquired) {
      const existingMetadata = lockResult.existingLock?.metadata as LockMetadata | null;
      console.log(`⏳ Lock not acquired - run already in progress`);
      return jsonResponse({
        success: false,
        message: 'Re-verification already in progress',
        status: 'locked',
        lock_age_seconds: lockResult.lockAgeSeconds,
        progress: existingMetadata?.progress || {},
      }, 409);
    }

    lockId = lockResult.lockId;
    if (!lockId) {
      console.error('❌ Lock ID is null after acquisition');
      return errorResponse('Failed to acquire lock', 500);
    }
    
    lockMetadata = {
      component: COMPONENT_NAME,
      started_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
      triggered_by: triggeredBy,
      candidates_count: candidates.length,
      progress: { current: 0, total: candidates.length, upgraded: 0, errors: 0 },
    };

    console.log(`📋 Found ${candidates.length} candidates for re-verification`);

    const results: ReverificationResult[] = [];
    let upgradedCount = 0;
    let errorCount = 0;

    // Process each candidate
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      const previousStatus = candidate.diploma_validation_status;
      console.log(`\n🔍 Processing ${index + 1}/${candidates.length}: ${candidate.id} (status: ${previousStatus})`);

      try {
        // Update heartbeat before processing
        await updateHeartbeat(supabase, lockId, {
          current: index,
          total: candidates.length,
          upgraded: upgradedCount,
          errors: errorCount,
        }, lockMetadata);

        // Invoke verify-diploma-duo
        const { data: verifyResult, error: verifyError } = await supabase.functions.invoke('verify-diploma-duo', {
          body: { application_id: candidate.id }
        });

        if (verifyError) {
          console.error(`❌ Verification error for ${candidate.id}:`, verifyError);
          
          // Update tracking columns even on error
          await supabase
            .from('professional_applications')
            .update({
              reverification_attempts: (candidate.reverification_attempts || 0) + 1,
              last_reverification_at: new Date().toISOString(),
            })
            .eq('id', candidate.id);

          results.push({
            application_id: candidate.id,
            previous_status: previousStatus,
            new_status: previousStatus,
            upgraded: false,
            error: verifyError.message,
          });
          errorCount++;
          continue;
        }

        // Get updated status
        const { data: updated } = await supabase
          .from('professional_applications')
          .select('diploma_validation_status')
          .eq('id', candidate.id)
          .single();

        const newStatus = updated?.diploma_validation_status || previousStatus;
        const upgraded = newStatus === 'verified_duo' && previousStatus !== 'verified_duo';

        // Update tracking columns
        await supabase
          .from('professional_applications')
          .update({
            reverification_attempts: (candidate.reverification_attempts || 0) + 1,
            last_reverification_at: new Date().toISOString(),
          })
          .eq('id', candidate.id);

        if (upgraded) {
          console.log(`✅ UPGRADED: ${candidate.id} from ${previousStatus} → verified_duo`);
          upgradedCount++;
        } else {
          console.log(`➡️ No change: ${candidate.id} remains ${newStatus}`);
        }

        results.push({
          application_id: candidate.id,
          previous_status: previousStatus,
          new_status: newStatus,
          upgraded,
        });

        // Log to ai_learning_events
        await supabase.from('ai_learning_events').insert({
          org_id: candidate.org_id,
          event_type: 'diploma_reverification',
          context: {
            application_id: candidate.id,
            email: candidate.email_from,
            previous_status: previousStatus,
            new_status: newStatus,
            attempt_number: (candidate.reverification_attempts || 0) + 1,
            version: `v${VERSION}-reverify`,
          },
          outcome: upgraded ? 'upgrade_success' : 'no_change',
          confidence_score: upgraded ? 1.0 : 0.5,
        });

      } catch (err) {
        console.error(`❌ Exception for ${candidate.id}:`, err);
        
        await supabase
          .from('professional_applications')
          .update({
            reverification_attempts: (candidate.reverification_attempts || 0) + 1,
            last_reverification_at: new Date().toISOString(),
          })
          .eq('id', candidate.id);

        results.push({
          application_id: candidate.id,
          previous_status: previousStatus,
          new_status: previousStatus,
          upgraded: false,
          error: err instanceof Error ? err.message : String(err),
        });
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      processed: results.length,
      upgraded: upgradedCount,
      errors: errorCount,
      unchanged: results.length - upgradedCount - errorCount,
    };
    
    console.log(`\n📊 Re-verification complete:`);
    console.log(`   - Processed: ${summary.processed}`);
    console.log(`   - Upgraded: ${summary.upgraded}`);
    console.log(`   - Errors: ${summary.errors}`);
    console.log(`   - Duration: ${duration}ms`);

    // Release lock with success status
    await releaseLock(supabase, lockId, 'idle', lockMetadata, summary);

    return jsonResponse({
      success: true,
      version: VERSION,
      summary,
      results,
      duration_ms: duration,
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);

    // Release lock with error status
    if (lockId && lockMetadata) {
      await releaseLock(
        supabase, 
        lockId, 
        'error', 
        lockMetadata, 
        undefined, 
        error instanceof Error ? error.message : String(error)
      );
    }

    return errorResponse(
      error instanceof Error ? error.message : String(error),
      500
    );
  }
});
