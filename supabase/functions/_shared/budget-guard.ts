export async function checkBudgetBeforeAiCall(
  supabase: any,
  org_id: string,
  estimated_cost_eur: number = 0.002 // Gemiddelde cost per call
): Promise<{ allowed: boolean; reason?: string; status?: any }> {
  
  try {
    const { data: status, error } = await supabase
      .rpc('check_budget_status', { 
        _org_id: org_id, 
        _requested_cost_eur: estimated_cost_eur 
      });

    if (error) {
      console.error('Budget check failed:', error);
      // Bij error: sta toe om service niet te blokkeren
      return { allowed: true, reason: 'budget_check_failed' };
    }

    if (!status.allowed) {
      // Trigger alert check async (fire-and-forget)
      supabase.functions.invoke('check-budget-alert', {
        body: { org_id, force_check: false }
      }).catch((err: any) => console.error('Alert trigger failed:', err));

      return { 
        allowed: false, 
        reason: status.reason,
        status 
      };
    }

    // Check if we need to send warning/critical alerts
    if (status.alert_level === 'warning' || status.alert_level === 'critical') {
      // Async alert check
      supabase.functions.invoke('check-budget-alert', {
        body: { org_id, force_check: false }
      }).catch((err: any) => console.error('Alert trigger failed:', err));
    }

    return { allowed: true, status };
    
  } catch (error) {
    console.error('Budget guard error:', error);
    // Bij error: sta toe
    return { allowed: true, reason: 'budget_guard_error' };
  }
}
