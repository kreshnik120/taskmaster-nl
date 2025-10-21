-- Fase 1: Enable Database Triggers voor automatische embedding generatie
-- Deze triggers zorgen ervoor dat elke nieuwe knowledge item direct embeddings krijgt

-- Enable triggers (zijn momenteel disabled)
ALTER TABLE ai_knowledge_base ENABLE TRIGGER generate_embedding_on_insert;
ALTER TABLE ai_knowledge_base ENABLE TRIGGER generate_embedding_on_update;

-- Maak logging tabel voor trigger monitoring
CREATE TABLE IF NOT EXISTS embedding_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID REFERENCES ai_knowledge_base(id) ON DELETE CASCADE,
  trigger_time TIMESTAMPTZ DEFAULT NOW(),
  status TEXT CHECK (status IN ('queued', 'triggered', 'failed', 'completed')),
  request_id BIGINT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE embedding_generation_log ENABLE ROW LEVEL SECURITY;

-- Policy voor admins
CREATE POLICY "Admins can view embedding logs"
  ON embedding_generation_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Verbeter trigger met comprehensive logging
CREATE OR REPLACE FUNCTION queue_embedding_generation()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Log start
  INSERT INTO embedding_generation_log (knowledge_id, status)
  VALUES (NEW.id, 'queued');
  
  -- Trigger edge function
  IF to_regproc('net.http_post') IS NOT NULL THEN
    BEGIN
      SELECT net.http_post(
        url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/generate-embedding',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
        ),
        body := jsonb_build_object('knowledge_id', NEW.id)::text
      ) INTO request_id;
      
      -- Log success
      UPDATE embedding_generation_log 
      SET status = 'triggered', request_id = request_id
      WHERE knowledge_id = NEW.id AND status = 'queued';
      
    EXCEPTION WHEN OTHERS THEN
      -- Log failure
      UPDATE embedding_generation_log 
      SET status = 'failed', error = SQLERRM
      WHERE knowledge_id = NEW.id AND status = 'queued';
    END;
  ELSE
    UPDATE embedding_generation_log 
    SET status = 'failed', error = 'net.http_post not available'
    WHERE knowledge_id = NEW.id AND status = 'queued';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Indexen voor performance
CREATE INDEX IF NOT EXISTS idx_embedding_log_knowledge_id ON embedding_generation_log(knowledge_id);
CREATE INDEX IF NOT EXISTS idx_embedding_log_status ON embedding_generation_log(status);
CREATE INDEX IF NOT EXISTS idx_embedding_log_created_at ON embedding_generation_log(created_at DESC);