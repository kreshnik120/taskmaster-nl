-- Add missing columns for knowledge stability tracking
ALTER TABLE public.ai_knowledge_base 
ADD COLUMN IF NOT EXISTS correction_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_correction JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS source_reference TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS requires_verification BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stability_score NUMERIC DEFAULT 1.0;

-- Add helpful comments
COMMENT ON COLUMN ai_knowledge_base.correction_count IS 'Number of times this knowledge has been manually corrected';
COMMENT ON COLUMN ai_knowledge_base.last_correction IS 'JSON object with details of the last manual correction';
COMMENT ON COLUMN ai_knowledge_base.source_reference IS 'Reference to the original source (e.g., continuous-learner:auto-suggestion)';
COMMENT ON COLUMN ai_knowledge_base.requires_verification IS 'Whether this knowledge requires manual verification before use';
COMMENT ON COLUMN ai_knowledge_base.stability_score IS 'Score indicating how stable/reliable this knowledge is (0-1)';

-- Create index for efficient queries on verification status
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_requires_verification 
ON public.ai_knowledge_base(requires_verification) 
WHERE requires_verification = true;

-- Create index for stability score queries
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_stability_score 
ON public.ai_knowledge_base(stability_score) 
WHERE stability_score < 0.8;