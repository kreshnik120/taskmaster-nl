-- =====================================================
-- FASE 1: QUICK WINS - Audit & Idempotency Tables
-- =====================================================

-- Table: slot_detection_audit
-- Slaat elke slot detectie poging op voor learning & debugging
CREATE TABLE public.slot_detection_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES public.professional_applications(id) ON DELETE SET NULL,
  email_id TEXT,
  message_id TEXT,
  
  -- Input data
  raw_email_text TEXT,
  stripped_reply TEXT,
  offered_slots JSONB,
  
  -- Detection results
  regex_result INTEGER,
  ai_result INTEGER,
  ai_confidence NUMERIC(4,3),
  final_result INTEGER,
  detection_method TEXT, -- 'regex', 'ai', 'manual', 'confirmation_requested'
  
  -- Timing
  processing_time_ms INTEGER,
  
  -- Feedback for learning
  user_confirmed BOOLEAN,
  correct_slot INTEGER,
  feedback_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  org_id UUID REFERENCES public.organizations(id)
);

-- Table: processed_emails (idempotency guard)
-- Voorkomt dubbele verwerking van dezelfde email
CREATE TABLE public.processed_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id TEXT UNIQUE,
  message_id TEXT,
  application_id UUID REFERENCES public.professional_applications(id) ON DELETE SET NULL,
  processing_status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  result_summary JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  org_id UUID REFERENCES public.organizations(id)
);

-- Table: intent_classification_audit
-- Log elke intent classificatie voor learning
CREATE TABLE public.intent_classification_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES public.professional_applications(id) ON DELETE SET NULL,
  email_id TEXT,
  
  -- Input
  stripped_content TEXT,
  content_length INTEGER,
  
  -- Classification results
  detected_intents JSONB, -- Array van {intent: string, confidence: number}
  primary_intent TEXT,
  primary_confidence NUMERIC(4,3),
  
  -- Urgency/frustration detection
  is_urgent BOOLEAN DEFAULT false,
  urgency_score NUMERIC(4,3),
  frustration_indicators JSONB, -- Array van gematchte indicators
  bypass_cooldown BOOLEAN DEFAULT false,
  
  -- Processing
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  org_id UUID REFERENCES public.organizations(id)
);

-- Enable RLS on all new tables
ALTER TABLE public.slot_detection_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intent_classification_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow service role full access
CREATE POLICY "Service role full access on slot_detection_audit"
  ON public.slot_detection_audit FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on processed_emails"
  ON public.processed_emails FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on intent_classification_audit"
  ON public.intent_classification_audit FOR ALL
  USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_slot_detection_audit_app ON public.slot_detection_audit(application_id);
CREATE INDEX idx_slot_detection_audit_created ON public.slot_detection_audit(created_at DESC);
CREATE INDEX idx_processed_emails_email_id ON public.processed_emails(email_id);
CREATE INDEX idx_processed_emails_message_id ON public.processed_emails(message_id);
CREATE INDEX idx_intent_audit_app ON public.intent_classification_audit(application_id);
CREATE INDEX idx_intent_audit_urgent ON public.intent_classification_audit(is_urgent) WHERE is_urgent = true;

-- Add column to professional_applications for last response timestamp (anti-spam tracking)
ALTER TABLE public.professional_applications 
ADD COLUMN IF NOT EXISTS last_ai_response_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_response_count INTEGER DEFAULT 0;