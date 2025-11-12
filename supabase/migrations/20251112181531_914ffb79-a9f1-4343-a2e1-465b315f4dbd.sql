-- Fix embedding_coverage_summary view voor admin dashboard
-- Probleem: View werkt niet voor service_role queries omdat auth.uid() NULL is
-- Oplossing: Maak org-filtering optioneel - als geen auth.uid(), toon alle orgs

DROP VIEW IF EXISTS embedding_coverage_summary CASCADE;

CREATE VIEW embedding_coverage_summary
WITH (security_invoker = true)
AS
SELECT 
  o.name AS org_name,
  kb.org_id,
  count(*) AS total_kb_items,
  count(ke.knowledge_id) AS items_with_embeddings,
  (count(*) - count(ke.knowledge_id)) AS items_missing_embeddings,
  round((100.0 * count(ke.knowledge_id)::numeric / NULLIF(count(*), 0)::numeric), 2) AS coverage_percentage
FROM ai_knowledge_base kb
LEFT JOIN knowledge_embeddings ke ON ke.knowledge_id = kb.id
JOIN organizations o ON o.id = kb.org_id
WHERE kb.deleted_at IS NULL
  AND (
    -- Voor authenticated users: filter op hun org
    auth.uid() IS NULL  -- service_role context: toon alle orgs
    OR EXISTS (
      SELECT 1 FROM user_organizations uo
      WHERE uo.org_id = kb.org_id
      AND uo.user_id = auth.uid()
    )
  )
GROUP BY kb.org_id, o.name;

-- Grant access to authenticated users en service_role
GRANT SELECT ON embedding_coverage_summary TO authenticated;
GRANT SELECT ON embedding_coverage_summary TO service_role;

COMMENT ON VIEW embedding_coverage_summary IS 
'View voor embedding coverage statistics. 
Security: SECURITY INVOKER met optionele org-filtering.
- Authenticated users: zien alleen hun eigen org
- Service role: ziet alle orgs
- Gebruikt voor admin dashboards en monitoring';
