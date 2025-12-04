-- Add training_document_id to ai_knowledge_base for traceability
ALTER TABLE public.ai_knowledge_base 
ADD COLUMN IF NOT EXISTS training_document_id UUID REFERENCES public.training_documents(id);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_training_doc ON public.ai_knowledge_base(training_document_id) WHERE training_document_id IS NOT NULL;