// Reverify Diploma Signatures - Automatic re-verification for signature_valid diplomas
// Version 1.0.0 - Initial release
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

const VERSION = '1.0.0';

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

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  console.log(`🔄 Reverify Diploma Signatures v${VERSION} started`);

  try {
    const supabase = createAdminClient();
    
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

    // Build query for candidates
    let query = supabase
      .from('professional_applications')
      .select('id, diploma_file_path, diploma_validation_status, reverification_attempts, last_reverification_at, org_id, email_from')
      .not('diploma_file_path', 'is', null)
      .is('deleted_at', null);

    if (specificApplicationId) {
      // Manual trigger for specific application
      query = query.eq('id', specificApplicationId);
      console.log(`📋 Manual trigger for application: ${specificApplicationId}`);
    } else {
      // Scheduled run - apply filters
      query = query
        .in('diploma_validation_status', RE_VERIFIABLE_STATUSES)
        .lt('reverification_attempts', MAX_RETRIES);
      
      if (!forceReverify) {
        // Apply cooldown - only re-verify if last attempt was > 7 days ago
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

    console.log(`📋 Found ${candidates.length} candidates for re-verification`);

    const results: ReverificationResult[] = [];
    let upgradedCount = 0;
    let errorCount = 0;

    // Process each candidate
    for (const candidate of candidates) {
      const previousStatus = candidate.diploma_validation_status;
      console.log(`\n🔍 Processing: ${candidate.id} (status: ${previousStatus})`);

      try {
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
    
    console.log(`\n📊 Re-verification complete:`);
    console.log(`   - Processed: ${results.length}`);
    console.log(`   - Upgraded: ${upgradedCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Duration: ${duration}ms`);

    return jsonResponse({
      success: true,
      version: VERSION,
      summary: {
        processed: results.length,
        upgraded: upgradedCount,
        errors: errorCount,
        unchanged: results.length - upgradedCount - errorCount,
      },
      results,
      duration_ms: duration,
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : String(error),
      500
    );
  }
});
