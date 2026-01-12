-- Security Fix: Converteer materialized view naar reguliere view met RLS
-- Dit zorgt ervoor dat budget data alleen zichtbaar is voor de eigen organisatie

-- Drop de materialized view
DROP MATERIALIZED VIEW IF EXISTS org_spending_summary;

-- Recreate als reguliere VIEW met security_invoker voor RLS
CREATE VIEW org_spending_summary WITH (security_invoker = true) AS
SELECT 
  org_id,
  COALESCE(SUM(estimated_cost_eur) FILTER (
    WHERE created_at >= date_trunc('month', NOW())
  ), 0) AS month_spend_eur,
  COUNT(*) FILTER (
    WHERE created_at >= date_trunc('month', NOW())
  ) AS month_calls,
  COALESCE(SUM(estimated_cost_eur) FILTER (
    WHERE created_at >= date_trunc('day', NOW())
  ), 0) AS today_spend_eur,
  COUNT(*) FILTER (
    WHERE created_at >= date_trunc('day', NOW())
  ) AS today_calls,
  COALESCE(SUM(estimated_cost_eur) FILTER (
    WHERE created_at >= (NOW() - INTERVAL '7 days')
  ), 0) AS week_spend_eur,
  COALESCE(AVG(estimated_cost_eur), 0) AS avg_cost_per_call,
  MAX(created_at) AS last_call_at,
  NOW() AS refreshed_at
FROM function_call_logs
WHERE estimated_cost_eur IS NOT NULL
GROUP BY org_id;

-- Grant permissions
GRANT SELECT ON org_spending_summary TO authenticated;