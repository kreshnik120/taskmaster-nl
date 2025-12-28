// AI Chat Health Monitor - Automatic health checks with email alerts
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

const ORG_ID = '550e8400-e29b-41d4-a716-446655440000';
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between alerts

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  const supabase = createAdminClient();
  
  console.log('🏥 [HEALTH-MONITOR] Starting AI Chat health check...');

  try {
    // 1. CALL AI-CHAT HEALTH ENDPOINT
    const healthUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-chat?health=true`;
    
    const healthResponse = await fetch(healthUrl, {
      headers: { 
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!healthResponse.ok) {
      throw new Error(`Health endpoint returned ${healthResponse.status}: ${await healthResponse.text()}`);
    }
    
    const healthData = await healthResponse.json();
    const isHealthy = healthData.status === 'healthy';
    const isDegraded = healthData.status === 'degraded';
    const isUnhealthy = healthData.status === 'unhealthy';
    
    console.log(`🏥 [HEALTH-MONITOR] Health status: ${healthData.status}`);
    
    // 2. IDENTIFY FAILED AND WARNING CHECKS
    const failedChecks = Object.entries(healthData.checks || {})
      .filter(([_, check]) => (check as any).status === 'error')
      .map(([name, check]) => ({ name, ...(check as any) }));
    
    const warningChecks = Object.entries(healthData.checks || {})
      .filter(([_, check]) => (check as any).status === 'warning')
      .map(([name, check]) => ({ name, ...(check as any) }));
    
    console.log(`🏥 [HEALTH-MONITOR] Failed: ${failedChecks.length}, Warnings: ${warningChecks.length}`);
    
    // 3. LOG TO system_health_log
    const logResult = await supabase.from('system_health_log').insert({
      org_id: ORG_ID,
      check_type: 'ai_chat_health',
      status: healthData.status,
      details: {
        checks: healthData.checks,
        totalDurationMs: healthData.totalDurationMs,
        failed_count: failedChecks.length,
        warning_count: warningChecks.length
      },
      actions_taken: isUnhealthy ? ['alert_triggered'] : []
    });
    
    if (logResult.error) {
      console.error('⚠️ [HEALTH-MONITOR] Failed to log health check:', logResult.error);
    }
    
    let alertSent = false;
    
    // 4. SEND ALERT IF UNHEALTHY OR DEGRADED WITH FAILURES
    if (isUnhealthy || (isDegraded && failedChecks.length > 0)) {
      // Check for recent alert (deduplication - 30 min cooldown)
      const { data: recentAlert } = await supabase
        .from('business_intelligence')
        .select('id')
        .eq('intelligence_type', 'ai_chat_health_alert')
        .eq('status', 'active')
        .gte('detected_at', new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString())
        .maybeSingle();
      
      if (!recentAlert) {
        console.log('🚨 [HEALTH-MONITOR] Creating alert and sending notification...');
        
        // Create alert in business_intelligence
        await supabase.from('business_intelligence').insert({
          org_id: ORG_ID,
          intelligence_type: 'ai_chat_health_alert',
          title: `🚨 AI Chat ${isUnhealthy ? 'Unhealthy' : 'Degraded'}`,
          description: `${failedChecks.length} checks failed: ${failedChecks.map(c => c.name).join(', ')}`,
          severity: isUnhealthy ? 'critical' : 'high',
          status: 'active',
          priority: 'high',
          data: {
            category: 'ai_chat_health',
            health_status: healthData.status,
            failed_checks: failedChecks,
            warning_checks: warningChecks,
            detected_at: new Date().toISOString()
          }
        });
        
        // Send email alert
        await sendHealthAlert(supabase, healthData, failedChecks, warningChecks);
        alertSent = true;
      } else {
        console.log('⏳ [HEALTH-MONITOR] Alert cooldown active, skipping duplicate alert');
      }
    }
    
    // 5. AUTO-RESOLVE OLD ALERTS IF NOW HEALTHY
    if (isHealthy) {
      const { data: resolvedAlerts, error: resolveError } = await supabase
        .from('business_intelligence')
        .update({ 
          status: 'resolved',
          last_updated_at: new Date().toISOString()
        })
        .eq('intelligence_type', 'ai_chat_health_alert')
        .eq('status', 'active')
        .select('id');
      
      if (resolvedAlerts && resolvedAlerts.length > 0) {
        console.log(`✅ [HEALTH-MONITOR] Resolved ${resolvedAlerts.length} previous alert(s)`);
        await sendRecoveryAlert(supabase, healthData);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`🏥 [HEALTH-MONITOR] Completed in ${duration}ms - Status: ${healthData.status}`);
    
    return jsonResponse({
      success: true,
      status: healthData.status,
      checks_performed: Object.keys(healthData.checks || {}).length,
      failed_checks: failedChecks.length,
      warning_checks: warningChecks.length,
      alert_sent: alertSent,
      duration_ms: duration
    });
    
  } catch (error) {
    console.error('❌ [HEALTH-MONITOR] Error:', error);
    
    // Log error to health log
    await supabase.from('system_health_log').insert({
      org_id: ORG_ID,
      check_type: 'ai_chat_health',
      status: 'error',
      details: { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      actions_taken: ['error_logged']
    });
    
    // Send critical alert for monitor failure
    await sendMonitorFailureAlert(supabase, error);
    
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});

async function sendHealthAlert(
  supabase: any, 
  healthData: any, 
  failedChecks: any[],
  warningChecks: any[]
): Promise<void> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.warn('⚠️ [HEALTH-MONITOR] RESEND_API_KEY not configured, skipping email alert');
    return;
  }
  
  const recipients = await getAlertRecipients(supabase);
  if (recipients.length === 0) {
    console.warn('⚠️ [HEALTH-MONITOR] No alert recipients found');
    return;
  }
  
  const subject = `🚨 AI Chat Health Alert - ${failedChecks.length} checks failed`;
  const html = generateAlertEmailHtml(healthData, failedChecks, warningChecks);
  
  for (const recipient of recipients) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ABCzorg AI <noreply@abczorg.nl>',
          to: recipient.email,
          subject,
          html,
        }),
      });
      
      if (response.ok) {
        console.log(`✅ [HEALTH-MONITOR] Alert sent to ${recipient.email}`);
      } else {
        console.error(`❌ [HEALTH-MONITOR] Failed to send alert to ${recipient.email}:`, await response.text());
      }
    } catch (e) {
      console.error(`❌ [HEALTH-MONITOR] Email error for ${recipient.email}:`, e);
    }
  }
}

async function sendRecoveryAlert(supabase: any, healthData: any): Promise<void> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return;
  
  const recipients = await getAlertRecipients(supabase);
  if (recipients.length === 0) return;
  
  const subject = `✅ AI Chat Health Recovered`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">✅ AI Chat Health Recovered</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">All systems are operational</p>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
    <p style="color: #374151; line-height: 1.6;">
      De AI Chat health check is hersteld naar <strong style="color: #10b981;">healthy</strong> status.
    </p>
    
    <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #065f46;">
        Alle ${Object.keys(healthData.checks || {}).length} health checks zijn nu succesvol.
      </p>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
      Timestamp: ${healthData.timestamp}<br>
      Duration: ${healthData.totalDurationMs}ms
    </p>
  </div>
  
  <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 20px;">
    ABCzorg AI Health Monitor
  </p>
</body>
</html>`;
  
  for (const recipient of recipients) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ABCzorg AI <noreply@abczorg.nl>',
          to: recipient.email,
          subject,
          html,
        }),
      });
      console.log(`✅ [HEALTH-MONITOR] Recovery alert sent to ${recipient.email}`);
    } catch (e) {
      console.error(`❌ [HEALTH-MONITOR] Recovery email error:`, e);
    }
  }
}

async function sendMonitorFailureAlert(supabase: any, error: unknown): Promise<void> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return;
  
  const recipients = await getAlertRecipients(supabase);
  if (recipients.length === 0) return;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const subject = `🔥 AI Chat Health Monitor FAILURE`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">🔥 Health Monitor Failure</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">The health monitor itself has failed</p>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #991b1b; font-family: monospace; word-break: break-all;">
        ${errorMessage}
      </p>
    </div>
    
    <p style="color: #374151; line-height: 1.6;">
      <strong>Aanbevolen actie:</strong> Check de edge function logs voor meer details.
    </p>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
      Timestamp: ${new Date().toISOString()}
    </p>
  </div>
</body>
</html>`;
  
  for (const recipient of recipients) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ABCzorg AI <noreply@abczorg.nl>',
          to: recipient.email,
          subject,
          html,
        }),
      });
    } catch (e) {
      console.error('Failed to send monitor failure alert:', e);
    }
  }
}

async function getAlertRecipients(supabase: any): Promise<{ email: string; name: string }[]> {
  // Get admin users
  const { data: adminRoles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');
  
  if (!adminRoles || adminRoles.length === 0) {
    return [];
  }
  
  const adminIds = adminRoles.map((r: any) => r.user_id);
  
  const { data: profiles } = await supabase
    .from('profiles')
    .select('email, name')
    .in('id', adminIds)
    .not('email', 'is', null);
  
  return profiles || [];
}

function generateAlertEmailHtml(healthData: any, failedChecks: any[], warningChecks: any[]): string {
  const failedRows = failedChecks.map(check => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #fee2e2; font-weight: 600; color: #991b1b;">${check.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #fee2e2; color: #dc2626; font-family: monospace; font-size: 13px;">${check.message || 'Error'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #fee2e2; color: #6b7280;">${check.durationMs ? `${check.durationMs}ms` : '-'}</td>
    </tr>
  `).join('');
  
  const warningRows = warningChecks.length > 0 ? warningChecks.map(check => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #fef3c7; font-weight: 600; color: #92400e;">${check.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #fef3c7; color: #d97706; font-family: monospace; font-size: 13px;">${check.message || 'Warning'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #fef3c7; color: #6b7280;">${check.durationMs ? `${check.durationMs}ms` : '-'}</td>
    </tr>
  `).join('') : '';
  
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">🚨 AI Chat Health Alert</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">Status: ${healthData.status?.toUpperCase()}</p>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
    <h2 style="color: #dc2626; margin-top: 0; font-size: 18px;">❌ Failed Checks (${failedChecks.length})</h2>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #fef2f2; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #fee2e2;">
          <th style="padding: 12px; text-align: left; color: #991b1b; font-size: 13px;">Check</th>
          <th style="padding: 12px; text-align: left; color: #991b1b; font-size: 13px;">Error</th>
          <th style="padding: 12px; text-align: left; color: #991b1b; font-size: 13px;">Duration</th>
        </tr>
      </thead>
      <tbody>
        ${failedRows}
      </tbody>
    </table>
    
    ${warningChecks.length > 0 ? `
    <h2 style="color: #d97706; margin-top: 30px; font-size: 18px;">⚠️ Warnings (${warningChecks.length})</h2>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #fffbeb; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #fef3c7;">
          <th style="padding: 12px; text-align: left; color: #92400e; font-size: 13px;">Check</th>
          <th style="padding: 12px; text-align: left; color: #92400e; font-size: 13px;">Message</th>
          <th style="padding: 12px; text-align: left; color: #92400e; font-size: 13px;">Duration</th>
        </tr>
      </thead>
      <tbody>
        ${warningRows}
      </tbody>
    </table>
    ` : ''}
    
    <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #991b1b; font-weight: 600;">
        🔧 Aanbevolen acties:
      </p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #7f1d1d;">
        <li>Controleer de edge function logs voor meer details</li>
        <li>Verifieer database connectiviteit</li>
        <li>Check of RPC functies correct zijn gedeployed</li>
      </ul>
    </div>
    
    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 20px;">
      <p style="color: #6b7280; font-size: 14px; margin: 0;">
        <strong>Timestamp:</strong> ${healthData.timestamp}<br>
        <strong>Total Duration:</strong> ${healthData.totalDurationMs}ms<br>
        <strong>Checks Performed:</strong> ${Object.keys(healthData.checks || {}).length}
      </p>
    </div>
  </div>
  
  <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 20px;">
    ABCzorg AI Health Monitor • Auto-check every 5 minutes
  </p>
</body>
</html>`;
}
