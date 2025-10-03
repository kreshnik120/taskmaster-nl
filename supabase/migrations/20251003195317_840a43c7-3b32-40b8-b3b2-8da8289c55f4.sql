-- Create knowledge_relationships table for graph building
CREATE TABLE IF NOT EXISTS public.knowledge_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_knowledge_id UUID NOT NULL REFERENCES public.ai_knowledge_base(id) ON DELETE CASCADE,
  target_knowledge_id UUID NOT NULL REFERENCES public.ai_knowledge_base(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  confidence_score NUMERIC NOT NULL DEFAULT 0.8 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  detected_by TEXT NOT NULL DEFAULT 'ai',
  context TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(source_knowledge_id, target_knowledge_id, relationship_type)
);

-- Enable RLS
ALTER TABLE public.knowledge_relationships ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view relationships"
ON public.knowledge_relationships
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ai_knowledge_base kb
    JOIN public.user_organizations uo ON uo.org_id = kb.org_id
    WHERE kb.id = knowledge_relationships.source_knowledge_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can manage relationships"
ON public.knowledge_relationships
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ai_knowledge_base kb
    JOIN public.user_organizations uo ON uo.org_id = kb.org_id
    WHERE kb.id = knowledge_relationships.source_knowledge_id
    AND uo.user_id = auth.uid()
  )
);

-- Create function_call_logs for budget tracking
CREATE TABLE IF NOT EXISTS public.function_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_eur NUMERIC(10,6),
  model_used TEXT,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.function_call_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for function logs
CREATE POLICY "Org members can view their function logs"
ON public.function_call_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = function_call_logs.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "System can insert function logs"
ON public.function_call_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add index for performance
CREATE INDEX idx_knowledge_relationships_source ON public.knowledge_relationships(source_knowledge_id);
CREATE INDEX idx_knowledge_relationships_target ON public.knowledge_relationships(target_knowledge_id);
CREATE INDEX idx_knowledge_relationships_type ON public.knowledge_relationships(relationship_type);
CREATE INDEX idx_function_call_logs_user_org ON public.function_call_logs(user_id, org_id);
CREATE INDEX idx_function_call_logs_created_at ON public.function_call_logs(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_knowledge_relationships_updated_at
BEFORE UPDATE ON public.knowledge_relationships
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();