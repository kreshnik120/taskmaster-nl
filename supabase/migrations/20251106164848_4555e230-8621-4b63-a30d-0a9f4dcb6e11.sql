-- Stap 1: Voeg source_type en freshness tracking toe aan ai_knowledge_base
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ai_knowledge_base' AND column_name = 'source_type') THEN
    ALTER TABLE ai_knowledge_base ADD COLUMN source_type TEXT DEFAULT 'unknown';
  END IF;
END $$;

ALTER TABLE ai_knowledge_base 
ADD COLUMN IF NOT EXISTS data_freshness_days INTEGER DEFAULT 90,
ADD COLUMN IF NOT EXISTS last_kvk_check TIMESTAMP,
ADD COLUMN IF NOT EXISTS kvk_source_data JSONB;

-- Index voor snelle "is data fresh?" lookup
CREATE INDEX IF NOT EXISTS idx_knowledge_freshness ON ai_knowledge_base(key, last_kvk_check) 
WHERE deleted_at IS NULL;

-- Stap 2: KVK API Cache tabel (secondary cache layer)
CREATE TABLE IF NOT EXISTS kvk_validation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kvk_nummer TEXT NOT NULL UNIQUE,
  org_id UUID REFERENCES organizations(id),
  api_response JSONB NOT NULL,
  cached_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '90 days',
  hit_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kvk_cache_lookup ON kvk_validation_cache(kvk_nummer, expires_at);
CREATE INDEX IF NOT EXISTS idx_kvk_cache_org ON kvk_validation_cache(org_id, cached_at);

-- Enable RLS
ALTER TABLE kvk_validation_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kvk_validation_cache' AND policyname = 'Org members can view kvk cache') THEN
    CREATE POLICY "Org members can view kvk cache"
    ON kvk_validation_cache FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM user_organizations
        WHERE user_organizations.org_id = kvk_validation_cache.org_id
        AND user_organizations.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kvk_validation_cache' AND policyname = 'System can manage kvk cache') THEN
    CREATE POLICY "System can manage kvk cache"
    ON kvk_validation_cache FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- Stap 3: Update bestaande correcte entries met metadata
UPDATE ai_knowledge_base
SET 
  source_type = 'verified_correction',
  last_kvk_check = NOW(),
  data_freshness_days = 90
WHERE id IN (
  '0e916dbf-d6bc-48eb-8305-28b50269dabb', -- CitoZorg
  'a3281868-0de8-41bf-a25c-0f7e26071606'  -- ABCzorg
) AND source_type IS NULL;