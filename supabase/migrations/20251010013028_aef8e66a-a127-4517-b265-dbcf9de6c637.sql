
-- ============================================
-- PRIORITY 1: AUTO-CATEGORIZE ALERTS TRIGGER
-- ============================================
-- This trigger automatically sets the 'category' field in business_intelligence.data
-- based on the intelligence_type when a new alert is inserted

CREATE OR REPLACE FUNCTION auto_categorize_alert()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set category if it's NULL or missing
  IF NEW.data IS NULL THEN
    NEW.data := '{}'::jsonb;
  END IF;
  
  IF NEW.data->>'category' IS NULL THEN
    -- Map intelligence_type to category
    NEW.data := jsonb_set(
      NEW.data,
      '{category}',
      to_jsonb(
        CASE NEW.intelligence_type
          WHEN 'data_quality' THEN 'data_quality'
          WHEN 'knowledge_gap' THEN 'knowledge_gap'
          WHEN 'broken_sources' THEN 'source_issue'
          WHEN 'bottleneck' THEN 'bottleneck'
          WHEN 'workflow_pattern' THEN 'workflow_pattern'
          WHEN 'optimization_opportunity' THEN 'optimization_opportunity'
          WHEN 'conflict' THEN 'knowledge_conflict'
          WHEN 'inconsistency' THEN 'data_inconsistency'
          ELSE NEW.intelligence_type -- Fallback: use intelligence_type as category
        END
      ),
      true
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger that fires BEFORE INSERT
CREATE TRIGGER set_alert_category_before_insert
  BEFORE INSERT ON business_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION auto_categorize_alert();

-- Backfill existing uncategorized alerts
UPDATE business_intelligence
SET data = jsonb_set(
  COALESCE(data, '{}'::jsonb),
  '{category}',
  to_jsonb(
    CASE intelligence_type
      WHEN 'data_quality' THEN 'data_quality'
      WHEN 'knowledge_gap' THEN 'knowledge_gap'
      WHEN 'broken_sources' THEN 'source_issue'
      WHEN 'bottleneck' THEN 'bottleneck'
      WHEN 'workflow_pattern' THEN 'workflow_pattern'
      WHEN 'optimization_opportunity' THEN 'optimization_opportunity'
      WHEN 'conflict' THEN 'knowledge_conflict'
      WHEN 'inconsistency' THEN 'data_inconsistency'
      ELSE intelligence_type
    END
  ),
  true
)
WHERE data->>'category' IS NULL;

-- Add index for faster category lookups
CREATE INDEX IF NOT EXISTS idx_business_intelligence_category 
  ON business_intelligence ((data->>'category'));

COMMENT ON FUNCTION auto_categorize_alert() IS 
'Automatically categorizes business intelligence alerts based on intelligence_type';
COMMENT ON TRIGGER set_alert_category_before_insert ON business_intelligence IS 
'Auto-categorizes new alerts before insertion to prevent uncategorized data';
