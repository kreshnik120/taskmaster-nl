// Automatic cleanup of stale orchestrator_state records older than 30 days
// Version 1.0.0 - Initial implementation
// Targets: timeout, error, completed (not: idle, running)
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

const VERSION = '1.0.0';
const RETENTION_DAYS = 30;

// Statuses that are safe to delete (not idle or running)
const DELETABLE_STATUSES = ['timeout', 'error', 'completed'];

// Never delete records from these critical components
const PROTECTED_COMPONENTS = ['master-scheduler'];

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  console.log(`🧹 Cleanup Orchestrator State v${VERSION} starting...`);

  try {
    const supabase = createAdminClient();
    
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    console.log(`📅 Cutoff date: ${cutoffDate.toISOString()} (${RETENTION_DAYS} days ago)`);

    // Step 1: Find deletable records
    const { data: candidates, error: fetchError } = await supabase
      .from('orchestrator_state')
      .select('id, status, metadata, last_run_at, created_at')
      .in('status', DELETABLE_STATUSES)
      .lt('created_at', cutoffDate.toISOString());

    if (fetchError) throw fetchError;

    if (!candidates || candidates.length === 0) {
      console.log('✅ No stale orchestrator records to clean up');
      return jsonResponse({
        success: true,
        version: VERSION,
        deleted: 0,
        message: 'No stale records found',
        execution_time_ms: Date.now() - startTime
      });
    }

    console.log(`🔍 Found ${candidates.length} candidate records for cleanup`);

    // Step 2: Filter out protected components
    const toDelete: string[] = [];
    const protectedRecords: { id: string; component: string; status: string }[] = [];
    const statusBreakdown: Record<string, number> = {};
    const componentBreakdown: Record<string, number> = {};

    for (const record of candidates) {
      const component = (record.metadata as Record<string, unknown>)?.component as string || 'unknown';
      
      if (PROTECTED_COMPONENTS.includes(component)) {
        protectedRecords.push({ id: record.id, component, status: record.status });
        continue;
      }

      toDelete.push(record.id);
      statusBreakdown[record.status] = (statusBreakdown[record.status] || 0) + 1;
      componentBreakdown[component] = (componentBreakdown[component] || 0) + 1;
    }

    if (protectedRecords.length > 0) {
      console.log(`🛡️ Protected ${protectedRecords.length} records from critical components`);
    }

    if (toDelete.length === 0) {
      console.log('✅ All candidates were protected - nothing to delete');
      return jsonResponse({
        success: true,
        version: VERSION,
        deleted: 0,
        protected: protectedRecords.length,
        message: 'All records protected',
        execution_time_ms: Date.now() - startTime
      });
    }

    // Step 3: Delete in batches
    const batchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize);
      
      const { error: deleteError, count } = await supabase
        .from('orchestrator_state')
        .delete({ count: 'exact' })
        .in('id', batch);

      if (deleteError) {
        console.error(`⚠️ Error deleting batch ${i}-${i + batch.length}:`, deleteError.message);
      } else {
        deletedCount += count || 0;
        console.log(`✅ Deleted batch: ${count} records`);
      }
    }

    console.log(`🧹 Cleanup complete: ${deletedCount} records deleted`);

    // Step 4: Log to business intelligence for significant cleanups
    if (deletedCount > 0) {
      await supabase.from('business_intelligence').insert({
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        intelligence_type: 'data_quality',
        title: `Orchestrator Cleanup: ${deletedCount} records verwijderd`,
        description: `Automatische cleanup van stale orchestrator records ouder dan ${RETENTION_DAYS} dagen.`,
        severity: 'info',
        status: 'resolved',
        data: {
          category: 'orchestrator_cleanup',
          records_deleted: deletedCount,
          records_protected: protectedRecords.length,
          status_breakdown: statusBreakdown,
          component_breakdown: componentBreakdown,
          retention_days: RETENTION_DAYS,
          cutoff_date: cutoffDate.toISOString()
        }
      });
    }

    // Step 5: Log function execution
    await supabase.from('function_call_logs').insert({
      function_name: 'cleanup-orchestrator-state',
      org_id: '550e8400-e29b-41d4-a716-446655440000',
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      success: true,
      execution_time_ms: Date.now() - startTime,
      model_used: 'none'
    });

    return jsonResponse({
      success: true,
      version: VERSION,
      deleted: deletedCount,
      protected: protectedRecords.length,
      status_breakdown: statusBreakdown,
      component_breakdown: componentBreakdown,
      retention_days: RETENTION_DAYS,
      execution_time_ms: Date.now() - startTime,
      message: `Cleaned ${deletedCount} stale records (protected ${protectedRecords.length})`
    });

  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
