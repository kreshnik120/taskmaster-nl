-- ============================================
-- AI Budget Tracking & Spending Limits System
-- ============================================

-- 1. Organisatie Budgets Tabel
CREATE TABLE org_ai_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Budget configuratie
  monthly_budget_eur NUMERIC(10,2) NOT NULL DEFAULT 100.00,
  daily_budget_eur NUMERIC(10,2) DEFAULT 10.00,
  
  -- Alert thresholds (percentage van budget)
  warning_threshold_pct INTEGER NOT NULL DEFAULT 80,
  critical_threshold_pct INTEGER NOT NULL DEFAULT 95,
  
  -- Hard limits
  enforce_hard_limit BOOLEAN NOT NULL DEFAULT true,
  allow_temporary_overage BOOLEAN NOT NULL DEFAULT false,
  
  -- Reset timing
  budget_reset_day INTEGER NOT NULL DEFAULT 1 CHECK (budget_reset_day BETWEEN 1 AND 28),
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Alert state tracking
  warning_sent_at TIMESTAMPTZ,
  critical_sent_at TIMESTAMPTZ,
  limit_reached_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  
  UNIQUE(org_id)
);

CREATE INDEX idx_org_budgets_org_id ON org_ai_budgets(org_id);
CREATE INDEX idx_org_budgets_enforce ON org_ai_budgets(enforce_hard_limit) 
  WHERE enforce_hard_limit = true;

ALTER TABLE org_ai_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all budgets"
  ON org_ai_budgets FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org members can view their budget"
  ON org_ai_budgets FOR SELECT
  USING (user_is_org_member(auth.uid(), org_id));

CREATE TRIGGER update_org_budgets_updated_at
  BEFORE UPDATE ON org_ai_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. Spending Alerts Log Tabel
CREATE TABLE spending_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Alert details
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'warning_80',
    'critical_95', 
    'limit_reached_100',
    'daily_limit_reached',
    'unusual_spike',
    'budget_reset'
  )),
  
  -- Context
  current_spend_eur NUMERIC(10,2) NOT NULL,
  budget_limit_eur NUMERIC(10,2) NOT NULL,
  percentage_used NUMERIC(5,2) NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'monthly')),
  
  -- Action taken
  action_taken TEXT CHECK (action_taken IN (
    'email_sent',
    'rate_limit_applied',
    'hard_block_enabled',
    'notification_only'
  )),
  
  -- Resolution
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spending_alerts_org ON spending_alerts(org_id, created_at DESC);
CREATE INDEX idx_spending_alerts_type ON spending_alerts(alert_type) 
  WHERE resolved_at IS NULL;

ALTER TABLE spending_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all alerts"
  ON spending_alerts FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org members can view their alerts"
  ON spending_alerts FOR SELECT
  USING (user_is_org_member(auth.uid(), org_id));

-- 3. Real-time Spending View
CREATE MATERIALIZED VIEW org_spending_summary AS
SELECT 
  fcl.org_id,
  
  -- Current month
  COALESCE(SUM(fcl.estimated_cost_eur) FILTER (
    WHERE fcl.created_at >= date_trunc('month', NOW())
  ), 0) as month_spend_eur,
  
  COUNT(*) FILTER (
    WHERE fcl.created_at >= date_trunc('month', NOW())
  ) as month_calls,
  
  -- Today
  COALESCE(SUM(fcl.estimated_cost_eur) FILTER (
    WHERE fcl.created_at >= date_trunc('day', NOW())
  ), 0) as today_spend_eur,
  
  COUNT(*) FILTER (
    WHERE fcl.created_at >= date_trunc('day', NOW())
  ) as today_calls,
  
  -- Last 7 days
  COALESCE(SUM(fcl.estimated_cost_eur) FILTER (
    WHERE fcl.created_at >= NOW() - INTERVAL '7 days'
  ), 0) as week_spend_eur,
  
  -- Averages
  COALESCE(AVG(fcl.estimated_cost_eur), 0) as avg_cost_per_call,
  
  -- Last activity
  MAX(fcl.created_at) as last_call_at,
  
  -- Metadata updated
  NOW() as refreshed_at
  
FROM function_call_logs fcl
WHERE fcl.estimated_cost_eur IS NOT NULL
GROUP BY fcl.org_id;

CREATE UNIQUE INDEX idx_spending_summary_org ON org_spending_summary(org_id);

-- 4. Database Function: Check Budget Status
CREATE OR REPLACE FUNCTION check_budget_status(
  _org_id UUID,
  _requested_cost_eur NUMERIC DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  budget_record RECORD;
  spending_record RECORD;
  projected_month_spend NUMERIC;
  projected_day_spend NUMERIC;
  month_pct NUMERIC;
  day_pct NUMERIC;
  alert_level TEXT;
  result JSONB;
BEGIN
  -- Get budget settings
  SELECT * INTO budget_record
  FROM org_ai_budgets
  WHERE org_id = _org_id;
  
  -- If no budget configured, allow unlimited
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'no_budget_configured',
      'unlimited', true
    );
  END IF;
  
  -- Get current spending
  SELECT * INTO spending_record
  FROM org_spending_summary
  WHERE org_id = _org_id;
  
  -- Calculate projections
  projected_month_spend := COALESCE(spending_record.month_spend_eur, 0) + _requested_cost_eur;
  projected_day_spend := COALESCE(spending_record.today_spend_eur, 0) + _requested_cost_eur;
  
  month_pct := (projected_month_spend / NULLIF(budget_record.monthly_budget_eur, 0)) * 100;
  day_pct := CASE 
    WHEN budget_record.daily_budget_eur > 0 
    THEN (projected_day_spend / budget_record.daily_budget_eur) * 100
    ELSE 0
  END;
  
  -- Determine alert level
  IF month_pct >= 100 OR day_pct >= 100 THEN
    alert_level := 'limit_reached';
  ELSIF month_pct >= budget_record.critical_threshold_pct THEN
    alert_level := 'critical';
  ELSIF month_pct >= budget_record.warning_threshold_pct THEN
    alert_level := 'warning';
  ELSE
    alert_level := 'ok';
  END IF;
  
  -- Build result
  result := jsonb_build_object(
    'allowed', CASE
      WHEN alert_level = 'limit_reached' AND budget_record.enforce_hard_limit 
      THEN NOT budget_record.allow_temporary_overage
      ELSE true
    END,
    'alert_level', alert_level,
    'current_month_spend', COALESCE(spending_record.month_spend_eur, 0),
    'current_day_spend', COALESCE(spending_record.today_spend_eur, 0),
    'projected_month_spend', projected_month_spend,
    'projected_day_spend', projected_day_spend,
    'monthly_budget', budget_record.monthly_budget_eur,
    'daily_budget', budget_record.daily_budget_eur,
    'month_percentage', ROUND(month_pct, 2),
    'day_percentage', ROUND(day_pct, 2),
    'reason', CASE
      WHEN alert_level = 'limit_reached' THEN 'budget_limit_reached'
      WHEN alert_level = 'critical' THEN 'approaching_limit'
      WHEN alert_level = 'warning' THEN 'warning_threshold'
      ELSE 'within_budget'
    END
  );
  
  RETURN result;
END;
$$;