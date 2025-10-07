-- Create email_events table for Mailgun webhook data
CREATE TABLE public.email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  message_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX idx_email_events_message_id ON public.email_events(message_id);
CREATE INDEX idx_email_events_org_id ON public.email_events(org_id);
CREATE INDEX idx_email_events_timestamp ON public.email_events(timestamp DESC);
CREATE INDEX idx_email_events_event_type ON public.email_events(event_type);

-- Enable Row Level Security
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Policy: Org members can view email events
CREATE POLICY "Org members can view email events"
  ON public.email_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = email_events.org_id
    AND user_organizations.user_id = auth.uid()
  ));

-- Policy: System can insert email events (for webhook handler)
CREATE POLICY "System can insert email events"
  ON public.email_events FOR INSERT
  WITH CHECK (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_events;