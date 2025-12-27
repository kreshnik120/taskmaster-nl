/**
 * Idempotency Guard Module - Fase 1: Quick Wins
 * 
 * Voorkomt dubbele verwerking van emails door:
 * - Check op email_id/message_id voor start
 * - Lock mechanisme tijdens verwerking
 * - Result caching voor snelle response
 */

// deno-lint-ignore-file no-explicit-any
type SupabaseClient = any;

export interface IdempotencyCheckResult {
  alreadyProcessed: boolean;
  processingLocked: boolean;
  previousResult?: Record<string, unknown>;
  lockId?: string;
}

export interface ProcessingResult {
  success: boolean;
  summary: Record<string, unknown>;
  error?: string;
}

/**
 * Check of email al eerder is verwerkt
 * Returns lock ID als email nog niet verwerkt is
 */
export async function checkIdempotency(
  supabase: SupabaseClient,
  emailId: string | undefined,
  messageId: string | undefined,
  applicationId: string,
  orgId?: string
): Promise<IdempotencyCheckResult> {
  // Geen ID's beschikbaar -> kan niet checken, laat door
  if (!emailId && !messageId) {
    console.log('⚠️ Idempotency check: No email_id or message_id available, proceeding without check');
    return { alreadyProcessed: false, processingLocked: false };
  }
  
  const lookupId = emailId || messageId;
  
  try {
    // Check bestaande entry
    const { data: existing, error: lookupError } = await supabase
      .from('processed_emails')
      .select('*')
      .or(`email_id.eq.${lookupId},message_id.eq.${lookupId}`)
      .maybeSingle();
    
    if (lookupError) {
      console.error('❌ Idempotency lookup error:', lookupError);
      // Bij fout, laat verwerking doorgaan maar log warning
      return { alreadyProcessed: false, processingLocked: false };
    }
    
    if (existing) {
      // Check status
      if (existing.processing_status === 'completed') {
        console.log(`✅ Idempotency: Email already processed successfully at ${existing.completed_at}`);
        return {
          alreadyProcessed: true,
          processingLocked: false,
          previousResult: existing.result_summary as Record<string, unknown>,
        };
      }
      
      if (existing.processing_status === 'processing') {
        // Check of lock nog geldig is (max 5 minuten)
        const lockAge = Date.now() - new Date(existing.processed_at).getTime();
        if (lockAge < 5 * 60 * 1000) {
          console.log(`🔒 Idempotency: Email currently being processed (locked ${Math.round(lockAge/1000)}s ago)`);
          return { alreadyProcessed: false, processingLocked: true };
        }
        
        // Lock verlopen, neem over
        console.log(`⚠️ Idempotency: Stale lock detected (${Math.round(lockAge/1000)}s), taking over`);
        const { error: updateError } = await supabase
          .from('processed_emails')
          .update({ processed_at: new Date().toISOString(), processing_status: 'processing' })
          .eq('id', existing.id);
        
        if (updateError) {
          console.error('❌ Error updating stale lock:', updateError);
        }
        
        return { alreadyProcessed: false, processingLocked: false, lockId: existing.id };
      }
      
      if (existing.processing_status === 'failed') {
        // Retry failed processing
        console.log(`⚠️ Idempotency: Previous processing failed, retrying`);
        const { error: updateError } = await supabase
          .from('processed_emails')
          .update({ 
            processed_at: new Date().toISOString(), 
            processing_status: 'processing',
            error_message: null 
          })
          .eq('id', existing.id);
        
        if (updateError) {
          console.error('❌ Error resetting failed entry:', updateError);
        }
        
        return { alreadyProcessed: false, processingLocked: false, lockId: existing.id };
      }
    }
    
    // Maak nieuwe lock entry
    const { data: newEntry, error: insertError } = await supabase
      .from('processed_emails')
      .insert({
        email_id: emailId,
        message_id: messageId,
        application_id: applicationId,
        processing_status: 'processing',
        org_id: orgId,
      })
      .select('id')
      .single();
    
    if (insertError) {
      // Mogelijk race condition - iemand anders was sneller
      if (insertError.code === '23505') { // Unique constraint violation
        console.log('🔒 Idempotency: Race condition detected, another process got the lock');
        return { alreadyProcessed: false, processingLocked: true };
      }
      console.error('❌ Error creating idempotency lock:', insertError);
      return { alreadyProcessed: false, processingLocked: false };
    }
    
    console.log(`🔓 Idempotency: Lock acquired for email ${lookupId}`);
    return { alreadyProcessed: false, processingLocked: false, lockId: newEntry.id };
    
  } catch (err) {
    console.error('❌ Idempotency check exception:', err);
    return { alreadyProcessed: false, processingLocked: false };
  }
}

/**
 * Markeer verwerking als voltooid
 */
export async function markProcessingComplete(
  supabase: SupabaseClient,
  lockId: string | undefined,
  result: ProcessingResult
): Promise<void> {
  if (!lockId) {
    console.log('⚠️ No lock ID provided, skipping completion marking');
    return;
  }
  
  try {
    const { error } = await supabase
      .from('processed_emails')
      .update({
        processing_status: result.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        result_summary: result.summary,
        error_message: result.error,
      })
      .eq('id', lockId);
    
    if (error) {
      console.error('❌ Error marking processing complete:', error);
    } else {
      console.log(`✅ Processing marked as ${result.success ? 'completed' : 'failed'}`);
    }
  } catch (err) {
    console.error('❌ Exception marking processing complete:', err);
  }
}

/**
 * Release lock bij early exit (geen volledige verwerking)
 */
export async function releaseLock(
  supabase: SupabaseClient,
  lockId: string | undefined
): Promise<void> {
  if (!lockId) return;
  
  try {
    await supabase
      .from('processed_emails')
      .delete()
      .eq('id', lockId);
    
    console.log('🔓 Lock released');
  } catch (err) {
    console.error('❌ Exception releasing lock:', err);
  }
}
