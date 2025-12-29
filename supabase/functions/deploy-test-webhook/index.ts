import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-deploy-signature",
};

interface DeploymentPayload {
  deployment_id?: string;
  commit_sha?: string;
  environment?: string;
  triggered_by?: string;
  branch?: string;
  skip_tests?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // Parse deployment payload
    let payload: DeploymentPayload = {};
    try {
      payload = await req.json();
    } catch {
      // Empty body is OK for manual triggers
    }
    
    const deploymentId = payload.deployment_id || `deploy-${Date.now()}`;
    const deploymentSource = payload.triggered_by || "webhook";
    const environment = payload.environment || "production";
    
    console.log(`[deploy-test-webhook] Received deployment event: ${deploymentId} from ${deploymentSource}`);
    
    // Skip tests if requested
    if (payload.skip_tests) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Tests skipped as requested",
          deployment_id: deploymentId
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
    
    // Log deployment event
    await supabase.from("system_events").insert({
      org_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "deployment_received",
      entity_type: "deployment",
      entity_id: deploymentId,
      event_data: {
        deployment_id: deploymentId,
        commit_sha: payload.commit_sha,
        environment,
        triggered_by: deploymentSource,
        branch: payload.branch
      },
      metadata: { source: "deploy-test-webhook" }
    });
    
    // Trigger AI chat tester
    console.log(`[deploy-test-webhook] Triggering ai-chat-tester for deployment ${deploymentId}`);
    
    const testResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat-tester`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        deployment_id: deploymentId,
        deployment_source: deploymentSource
      }),
    });
    
    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      throw new Error(`ai-chat-tester failed: ${testResponse.status} - ${errorText}`);
    }
    
    const testResults = await testResponse.json();
    
    console.log(`[deploy-test-webhook] Test results: ${testResults.passed_tests}/${testResults.total_tests} passed`);
    
    // Send alert if there are failures
    if (testResults.failed_tests > 0 && resendApiKey) {
      console.log(`[deploy-test-webhook] Sending failure alert for ${testResults.failed_tests} failed tests`);
      
      // Get admin emails
      const { data: admins } = await supabase
        .from("profiles")
        .select("email, full_name")
        .not("email", "is", null);
      
      const adminEmails = admins?.map(a => a.email).filter(Boolean) || [];
      
      if (adminEmails.length > 0) {
        const resend = new Resend(resendApiKey);
        
        const failedScenarios = testResults.results
          .filter((r: { passed: boolean }) => !r.passed)
          .map((r: { scenario_id: string; error_message: string | null; validation_details: Array<{ validation: string; passed: boolean }> }) => ({
            id: r.scenario_id,
            error: r.error_message,
            validations: r.validation_details?.filter((v: { passed: boolean }) => !v.passed)
          }));
        
        const failedList = failedScenarios
          .map((s: { id: string; error: string | null; validations: Array<{ validation: string }> }) => {
            const errors = s.error 
              ? `Error: ${s.error}` 
              : s.validations?.map((v: { validation: string }) => v.validation).join(", ");
            return `<li><strong>${s.id}</strong>: ${errors}</li>`;
          })
          .join("");
        
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">🚨 AI Chat Test Failures na Deployment</h2>
            
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0;"><strong>Deployment ID:</strong> ${deploymentId}</p>
              <p style="margin: 8px 0 0 0;"><strong>Environment:</strong> ${environment}</p>
              <p style="margin: 8px 0 0 0;"><strong>Source:</strong> ${deploymentSource}</p>
              ${payload.commit_sha ? `<p style="margin: 8px 0 0 0;"><strong>Commit:</strong> ${payload.commit_sha.substring(0, 7)}</p>` : ""}
            </div>
            
            <h3 style="color: #991b1b;">Test Resultaten</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr>
                <td style="padding: 8px; background: #fee2e2; border-radius: 4px;">
                  <strong style="color: #dc2626;">❌ ${testResults.failed_tests} Gefaald</strong>
                </td>
                <td style="padding: 8px; background: #dcfce7; border-radius: 4px;">
                  <strong style="color: #16a34a;">✅ ${testResults.passed_tests} Geslaagd</strong>
                </td>
                <td style="padding: 8px; background: #f3f4f6; border-radius: 4px;">
                  <strong>⏱️ ${testResults.avg_response_time_ms}ms avg</strong>
                </td>
              </tr>
            </table>
            
            <h3 style="color: #991b1b;">Gefaalde Tests</h3>
            <ul style="list-style-type: none; padding: 0;">
              ${failedList}
            </ul>
            
            <div style="margin-top: 24px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Test Run ID: ${testResults.test_run_id}<br>
                Totale tijd: ${testResults.total_time_ms}ms<br>
                Pass rate: ${testResults.pass_rate}%
              </p>
            </div>
          </div>
        `;
        
        try {
          await resend.emails.send({
            from: "CitoZorg AI <personeel@citozorg.nl>",
            to: adminEmails.slice(0, 5), // Max 5 recipients
            subject: `🚨 AI Chat Test Failures: ${testResults.failed_tests}/${testResults.total_tests} tests gefaald`,
            html: htmlContent,
          });
          
          // Mark alert as sent
          await supabase
            .from("ai_chat_test_runs")
            .update({ alert_sent: true })
            .eq("id", testResults.test_run_id);
          
          console.log(`[deploy-test-webhook] Alert email sent to ${adminEmails.length} admins`);
        } catch (emailError) {
          console.error("[deploy-test-webhook] Failed to send alert email:", emailError);
        }
      }
      
      // Create business intelligence alert
      await supabase.from("business_intelligence").insert({
        org_id: "550e8400-e29b-41d4-a716-446655440000",
        intelligence_type: "test_failure",
        title: `AI Chat Tests Gefaald na Deployment`,
        description: `${testResults.failed_tests} van ${testResults.total_tests} tests gefaald na deployment ${deploymentId}`,
        severity: testResults.failed_tests > 3 ? "critical" : "warning",
        priority: "high",
        status: "active",
        data: {
          deployment_id: deploymentId,
          test_run_id: testResults.test_run_id,
          failed_tests: testResults.failed_tests,
          passed_tests: testResults.passed_tests,
          pass_rate: testResults.pass_rate,
          failed_scenarios: testResults.results.filter((r: { passed: boolean }) => !r.passed).map((r: { scenario_id: string }) => r.scenario_id),
          category: "ai_test_failure"
        }
      });
    }
    
    // Log completion
    await supabase.from("system_events").insert({
      org_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "deployment_tests_completed",
      entity_type: "deployment",
      entity_id: deploymentId,
      event_data: {
        deployment_id: deploymentId,
        test_run_id: testResults.test_run_id,
        passed_tests: testResults.passed_tests,
        failed_tests: testResults.failed_tests,
        pass_rate: testResults.pass_rate,
        status: testResults.status
      },
      metadata: { source: "deploy-test-webhook" }
    });
    
    const totalTime = Date.now() - startTime;
    
    return new Response(
      JSON.stringify({
        success: true,
        deployment_id: deploymentId,
        test_run_id: testResults.test_run_id,
        total_tests: testResults.total_tests,
        passed_tests: testResults.passed_tests,
        failed_tests: testResults.failed_tests,
        pass_rate: testResults.pass_rate,
        status: testResults.status,
        alert_sent: testResults.failed_tests > 0,
        total_time_ms: totalTime
      }),
      { 
        status: testResults.failed_tests > 0 ? 200 : 200, // Always 200 for webhook
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
    
  } catch (error) {
    console.error("[deploy-test-webhook] Fatal error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
