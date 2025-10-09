-- FASE 3: Fix Database Schema

-- 1. Add missing columns to ai_knowledge_base
ALTER TABLE ai_knowledge_base 
  ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'unverified';

-- 2. Add type column to business_intelligence  
ALTER TABLE business_intelligence
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'alert',
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_knowledge_last_verified 
  ON ai_knowledge_base(last_verified) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bi_type_severity
  ON business_intelligence(type, severity, detected_at DESC);