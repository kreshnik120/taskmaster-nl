-- Optimization #3: Database Indexes for Intelligent Caching
-- These indexes dramatically speed up self-trainer and knowledge base queries

-- Index 1: Speed up category + confidence queries (used by self-trainer)
-- This index helps when fetching high-confidence knowledge by category
CREATE INDEX IF NOT EXISTS idx_kb_category_confidence 
ON public.ai_knowledge_base(category, confidence_score DESC) 
WHERE deleted_at IS NULL;

-- Index 2: Speed up learning event queries (filter by applied status)
-- This index helps track which learning events have been applied to KB
CREATE INDEX IF NOT EXISTS idx_learning_events_applied 
ON public.ai_learning_events(applied_to_knowledge_base, created_at DESC);

-- Index 3: Speed up knowledge base lookups by org + category
-- This helps when fetching relevant knowledge for specific orgs
CREATE INDEX IF NOT EXISTS idx_kb_org_category 
ON public.ai_knowledge_base(org_id, category, confidence_score DESC) 
WHERE deleted_at IS NULL;

-- Index 4: Speed up "needs review" queries
CREATE INDEX IF NOT EXISTS idx_kb_needs_review 
ON public.ai_knowledge_base(needs_review, confidence_score) 
WHERE deleted_at IS NULL AND needs_review = true;