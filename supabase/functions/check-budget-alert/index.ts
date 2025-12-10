import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    const { org_id, force_check = false } = await req.json();

    // Get budget status
    const { data: status, error: statusError } = await supabase
      .rpc('check_budget_status', { _org_id: org_id, _requested_cost_eur: 0 });

    if (statusError) throw statusError;

    // Check if alert needed
    const alertLevel = status.alert_level;
    let alertType: string | null = null;

    if (alertLevel === 'limit_reached') {
      alertType = 'limit_reached_100';
    } else if (alertLevel === 'critical') {
      alertType = 'critical_95';
    } else if (alertLevel === 'warning') {
      alertType = 'warning_80';
    }

    if (!alertType && !force_check) {
      return jsonResponse({ message: 'No alert needed', status });
    }

    // Check if alert already sent recently (deduplicate)
    const { data: recentAlert } = await supabase
      .from('spending_alerts')
      .select('id')
      .eq('org_id', org_id)
      .eq('alert_type', alertType)
      .gte('created_at', new Date(Date.now() - 3600000).toISOString())
      .single();

    if (recentAlert && !force_check) {
      return jsonResponse({ message: 'Alert already sent recently', status });
    }

    // Get org admins with their profiles
    const { data: userOrgs } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('org_id', org_id);
    
    const userIds = userOrgs?.map(u => u.user_id) || [];
    
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .in('user_id', userIds);
    
    const adminIds = adminRoles?.map(r => r.user_id) || [];
    
    const { data: admins } = await supabase
      .from('profiles')
      .select('email, name')
      .in('id', adminIds);

    // Create alert record
    const { data: alert, error: alertError } = await supabase
      .from('spending_alerts')
      .insert({
        org_id,
        alert_type: alertType,
        current_spend_eur: status.current_month_spend,
        budget_limit_eur: status.monthly_budget,
        percentage_used: status.month_percentage,
        period_type: 'monthly',
        action_taken: status.allowed ? 'email_sent' : 'hard_block_enabled',
        metadata: {
          daily_spend: status.current_day_spend,
          daily_budget: status.daily_budget
        }
      })
      .select()
      .single();

    if (alertError) throw alertError;

    // Send email notifications to admins
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    
    for (const admin of admins || []) {
      const email = admin.email;
      const name = admin.name || 'Admin';

      const subject = alertLevel === 'limit_reached'
        ? '🚨 AI Budget Limiet Bereikt!'
        : alertLevel === 'critical'
        ? '⚠️ AI Budget Bijna Op (95%)'
        : '⚡ AI Budget Waarschuwing (80%)';

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">${subject}</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Beste ${name},</p>
    
    <p>Je organisatie heeft <strong>${status.month_percentage}%</strong> van het maandelijkse AI-budget gebruikt.</p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Huidig verbruik:</strong></td>
          <td style="text-align: right;">€${status.current_month_spend.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Maandbudget:</strong></td>
          <td style="text-align: right;">€${status.monthly_budget.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Resterend:</strong></td>
          <td style="text-align: right; color: ${status.month_percentage >= 100 ? '#ef4444' : '#10b981'};">
            €${(status.monthly_budget - status.current_month_spend).toFixed(2)}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Vandaag verbruikt:</strong></td>
          <td style="text-align: right;">€${status.current_day_spend.toFixed(2)}</td>
        </tr>
      </table>
    </div>
    
    ${alertLevel === 'limit_reached' ? `
      <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b;"><strong>⚠️ Actie ondernomen:</strong> ${
          status.allowed 
            ? 'Tijdelijke overschrijding toegestaan - verhoog het budget zo snel mogelijk.'
            : 'Alle AI-functies zijn geblokkeerd tot het budget wordt verhoogd of reset.'
        }</p>
      </div>
    ` : ''}
    
    <p><strong>Aanbevolen acties:</strong></p>
    <ul>
      <li>Bekijk het budgetdashboard in de applicatie</li>
      <li>${alertLevel === 'limit_reached' ? 'Verhoog het maandbudget onmiddellijk' : 'Overweeg het budget te verhogen'}</li>
      <li>Analyseer welke functies het meeste budget verbruiken</li>
      <li>Configureer dagelijkse limieten voor betere controle</li>
    </ul>
    
    <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
      Dit is een geautomatiseerde waarschuwing van het ABCzorg AI-systeem.
    </p>
  </div>
</body>
</html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ABCzorg AI <noreply@abczorg.nl>',
          to: email,
          subject,
          html,
        }),
      });
    }

    return jsonResponse({ 
      success: true, 
      alert_sent: true,
      alert_type: alertType,
      status 
    });

  } catch (error) {
    console.error('Budget alert error:', error);
    return errorResponse(String(error), 500);
  }
});
