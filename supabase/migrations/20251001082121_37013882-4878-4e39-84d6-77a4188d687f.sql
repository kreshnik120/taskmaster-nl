-- AI Knowledge Base voor permanente opslag van belangrijke informatie
CREATE TABLE IF NOT EXISTS public.ai_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'user_preference', 'business_rule', 'workflow_pattern', 'decision_context'
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  confidence_score NUMERIC DEFAULT 1.0, -- 0.0 to 1.0, hoe zeker is de AI van deze informatie
  source TEXT, -- waar komt deze kennis vandaan
  usage_count INTEGER DEFAULT 0, -- hoe vaak is dit gebruikt
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, org_id, category, key)
);

-- AI Learning Events voor feedback tracking en pattern recognition
CREATE TABLE IF NOT EXISTS public.ai_learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'feedback_positive', 'feedback_negative', 'task_completed', 'pattern_detected', 'suggestion_accepted', 'suggestion_rejected'
  context JSONB NOT NULL, -- alle relevante context informatie
  ai_response JSONB, -- wat had de AI gesuggereerd/gezegd
  user_action JSONB, -- wat deed de gebruiker
  outcome TEXT, -- 'success', 'failure', 'partial'
  learning_score NUMERIC, -- hoe waardevol is deze learning event (0.0 - 1.0)
  applied_to_knowledge_base BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Business Intelligence voor bedrijfsinformatie en process patterns
CREATE TABLE IF NOT EXISTS public.business_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  intelligence_type TEXT NOT NULL, -- 'workflow_pattern', 'productivity_insight', 'bottleneck', 'optimization_opportunity'
  title TEXT NOT NULL,
  description TEXT,
  data JSONB NOT NULL, -- alle relevante data
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
  impact_score NUMERIC, -- verwachte impact (0.0 - 10.0)
  status TEXT DEFAULT 'active', -- 'active', 'implemented', 'dismissed'
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation Context voor uitgebreide chat geschiedenis
CREATE TABLE IF NOT EXISTS public.conversation_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL, -- groepeer berichten per conversatie
  category TEXT NOT NULL, -- 'task_management', 'planning', 'reporting', 'question', 'feedback'
  summary TEXT, -- AI-gegenereerde samenvatting van conversatie
  key_points JSONB, -- belangrijke punten uit conversatie
  sentiment TEXT, -- 'positive', 'neutral', 'negative'
  topics TEXT[], -- onderwerpen die besproken zijn
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_context ENABLE ROW LEVEL SECURITY;

-- RLS Policies voor ai_knowledge_base
CREATE POLICY "Users can manage their own knowledge"
  ON public.ai_knowledge_base
  FOR ALL
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = ai_knowledge_base.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

-- RLS Policies voor ai_learning_events
CREATE POLICY "Users can manage their learning events"
  ON public.ai_learning_events
  FOR ALL
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = ai_learning_events.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

-- RLS Policies voor business_intelligence
CREATE POLICY "Org members can view business intelligence"
  ON public.business_intelligence
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = business_intelligence.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can manage business intelligence"
  ON public.business_intelligence
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = business_intelligence.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

-- RLS Policies voor conversation_context
CREATE POLICY "Users can manage their conversation context"
  ON public.conversation_context
  FOR ALL
  USING (user_id = auth.uid());

-- Indexes voor performance
CREATE INDEX idx_ai_knowledge_user_org ON public.ai_knowledge_base(user_id, org_id);
CREATE INDEX idx_ai_knowledge_category ON public.ai_knowledge_base(category);
CREATE INDEX idx_ai_knowledge_confidence ON public.ai_knowledge_base(confidence_score DESC);
CREATE INDEX idx_ai_learning_user_org ON public.ai_learning_events(user_id, org_id);
CREATE INDEX idx_ai_learning_type ON public.ai_learning_events(event_type);
CREATE INDEX idx_ai_learning_created ON public.ai_learning_events(created_at DESC);
CREATE INDEX idx_business_intel_org ON public.business_intelligence(org_id);
CREATE INDEX idx_business_intel_type ON public.business_intelligence(intelligence_type);
CREATE INDEX idx_business_intel_priority ON public.business_intelligence(priority);
CREATE INDEX idx_conversation_user ON public.conversation_context(user_id);
CREATE INDEX idx_conversation_category ON public.conversation_context(category);

-- Triggers voor updated_at
CREATE TRIGGER update_ai_knowledge_updated_at
  BEFORE UPDATE ON public.ai_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_business_intel_updated_at
  BEFORE UPDATE ON public.business_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();