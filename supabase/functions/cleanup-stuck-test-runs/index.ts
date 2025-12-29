import { createAdminClient, handleCors, jsonResponse, errorResponse } from '../_shared/core.ts';

const STUCK_THRESHOLD_MINUTES = 5;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createAdminClient();
  const now = new Date();
  const thresholdTime = new Date(now.getTime() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();
  
  console.log(`[CLEANUP-STUCK-TEST-RUNS] Starting cleanup, threshold: ${STUCK_THRESHOLD_MINUTES} minutes`);

  try {
    // 1) Find stuck test runs (running > 5 minutes)
    const { data: stuckRuns, error: fetchErr } = await supabase
      .from('ai_chat_test_runs')
      .select('id, deployment_id, deployment_source, total_tests, passed_tests, failed_tests, started_at')
      .eq('status', 'running')
      .lt('started_at', thresholdTime);

    if (fetchErr) throw fetchErr;

    let cleanedRuns = 0;
    const cleanupReport: Array<{
      run_id: string;
      deployment_id: string | null;
      stuck_duration_minutes: number;
      tests_completed: number;
      tests_total: number;
    }> = [];

    if (stuckRuns && stuckRuns.length > 0) {
      console.log(`[CLEANUP-STUCK-TEST-RUNS] Found ${stuckRuns.length} stuck run(s)`);

      for (const run of stuckRuns) {
        const stuckDuration = Math.round((now.getTime() - new Date(run.started_at).getTime()) / 60000);
        
        // Update status to failed
        const { error: updateErr } = await supabase
          .from('ai_chat_test_runs')
          .update({
            status: 'failed',
            completed_at: now.toISOString(),
            alert_sent: false
          })
          .eq('id', run.id);

        if (updateErr) {
          console.error(`[CLEANUP-STUCK-TEST-RUNS] Failed to update run ${run.id}:`, updateErr);
          continue;
        }

        // Update orphan test results (no response_time_ms = not completed)
        const { error: resultsErr } = await supabase
          .from('ai_chat_test_results')
          .update({
            passed: false,
            error_message: `Test run timeout: automatisch gemarkeerd als failed na ${stuckDuration} minuten`,
            response_time_ms: 0
          })
          .eq('test_run_id', run.id)
          .is('response_time_ms', null);

        if (resultsErr) {
          console.warn(`[CLEANUP-STUCK-TEST-RUNS] Failed to update orphan results for run ${run.id}:`, resultsErr);
        }

        cleanedRuns++;
        cleanupReport.push({
          run_id: run.id,
          deployment_id: run.deployment_id,
          stuck_duration_minutes: stuckDuration,
          tests_completed: (run.passed_tests || 0) + (run.failed_tests || 0),
          tests_total: run.total_tests || 0
        });

        console.log(`[CLEANUP-STUCK-TEST-RUNS] Cleaned run ${run.id}, stuck for ${stuckDuration} min`);
      }
    }

    // 2) Log cleanup report to system_health_log
    if (cleanedRuns > 0) {
      await supabase.from('system_health_log').insert({
        check_name: 'cleanup_stuck_test_runs',
        status: 'ok',
        details: {
          cleaned_runs: cleanedRuns,
          report: cleanupReport,
          threshold_minutes: STUCK_THRESHOLD_MINUTES
        },
        checked_at: now.toISOString()
      });
    }

    const message = cleanedRuns > 0 
      ? `${cleanedRuns} stuck test run(s) opgeruimd` 
      : 'Geen stuck test runs gevonden';

    console.log(`[CLEANUP-STUCK-TEST-RUNS] Completed: ${message}`);

    return jsonResponse({
      ok: true,
      cleaned_runs: cleanedRuns,
      report: cleanupReport,
      message
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[CLEANUP-STUCK-TEST-RUNS] Error:', errorMessage);
    return errorResponse(errorMessage, 500);
  }
});
