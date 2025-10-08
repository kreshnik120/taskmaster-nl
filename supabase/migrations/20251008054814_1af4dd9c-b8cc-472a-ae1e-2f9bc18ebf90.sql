-- FASE 1 & 2: Meta-Orchestrator Database Schema

-- Tabel voor orchestrator state tracking
CREATE TABLE IF NOT EXISTS orchestrator_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  last_run_at TIMESTAMPTZ DEFAULT now(),
  total_items_processed INT DEFAULT 0,
  categories_created INT DEFAULT 0,
  status TEXT DEFAULT 'idle',
  current_batch INT DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS voor orchestrator_state
ALTER TABLE orchestrator_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view orchestrator state"
  ON orchestrator_state FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM user_organizations
      WHERE org_id = orchestrator_state.org_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage orchestrator state"
  ON orchestrator_state FOR ALL
  USING (true)
  WITH CHECK (true);

-- Tabel voor AI-gegenereerde categorieën
CREATE TABLE IF NOT EXISTS ai_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  parent_category UUID REFERENCES ai_categories(id),
  keywords TEXT[],
  item_count INT DEFAULT 0,
  confidence_score NUMERIC DEFAULT 0.8,
  auto_generated BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, name)
);

-- RLS voor ai_categories
ALTER TABLE ai_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view categories"
  ON ai_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE org_id = ai_categories.org_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage categories"
  ON ai_categories FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index voor snellere lookups
CREATE INDEX IF NOT EXISTS idx_ai_categories_org_id ON ai_categories(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_categories_keywords ON ai_categories USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_orchestrator_state_org_id ON orchestrator_state(org_id);

-- FASE 3: RPC Function voor relevante categorieën ophalen
CREATE OR REPLACE FUNCTION get_relevant_categories(
  user_question TEXT,
  org_id_param UUID DEFAULT NULL
)
RETURNS TABLE(category_name TEXT, confidence NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  question_lower TEXT;
BEGIN
  question_lower := LOWER(user_question);
  
  -- Retourneer categorieën waarvan keywords matchen met vraag
  RETURN QUERY
  SELECT 
    ac.name as category_name,
    ac.confidence_score as confidence
  FROM ai_categories ac
  WHERE 
    (org_id_param IS NULL OR ac.org_id = org_id_param)
    AND (
      -- Keyword matching
      EXISTS (
        SELECT 1 FROM unnest(ac.keywords) k
        WHERE question_lower LIKE '%' || LOWER(k) || '%'
      )
      -- Of naam matching
      OR question_lower LIKE '%' || LOWER(ac.name) || '%'
    )
  ORDER BY ac.confidence_score DESC, ac.item_count DESC
  LIMIT 10;
END;
$$;

-- FASE 4: Trigger functie voor autonomous learning
CREATE OR REPLACE FUNCTION trigger_meta_orchestrator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_org_id UUID;
BEGIN
  -- Alleen voor assistant messages
  IF NEW.role = 'assistant' THEN
    -- Haal org_id op van user
    SELECT uo.org_id INTO user_org_id
    FROM user_organizations uo
    WHERE uo.user_id = NEW.user_id
    LIMIT 1;
    
    IF user_org_id IS NOT NULL THEN
      -- Roep meta-orchestrator aan (async via pg_net)
      PERFORM net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/meta-orchestrator',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body := jsonb_build_object(
          'trigger', 'chat_feedback',
          'message_id', NEW.id,
          'user_id', NEW.user_id,
          'org_id', user_org_id,
          'content', NEW.content
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Maak trigger op chat_messages (alleen als nog niet bestaat)
DROP TRIGGER IF EXISTS auto_learn_from_chat ON chat_messages;
CREATE TRIGGER auto_learn_from_chat
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_meta_orchestrator();

COMMENT ON TABLE orchestrator_state IS 'Tracks meta-orchestrator processing state and progress';
COMMENT ON TABLE ai_categories IS 'AI-generated dynamic categories for knowledge base organization';
COMMENT ON FUNCTION get_relevant_categories IS 'Finds relevant AI categories based on user question keywords';
COMMENT ON FUNCTION trigger_meta_orchestrator IS 'Triggers meta-orchestrator for autonomous learning from chat interactions';