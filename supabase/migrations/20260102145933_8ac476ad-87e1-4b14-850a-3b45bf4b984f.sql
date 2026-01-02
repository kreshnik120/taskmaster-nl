-- Circuit Breaker State Table voor externe service bescherming
-- Version: 1.0.0

CREATE TABLE IF NOT EXISTS public.circuit_breaker_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  half_open_at TIMESTAMPTZ,
  last_error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_service ON public.circuit_breaker_state(service_name);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state ON public.circuit_breaker_state(state);

-- Enable RLS
ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

-- Policy: service role heeft volledige toegang (edge functions)
CREATE POLICY "Service role full access" ON public.circuit_breaker_state
  FOR ALL USING (true) WITH CHECK (true);

-- Initial record voor verify-diploma-duo
INSERT INTO public.circuit_breaker_state (service_name, state, metadata) 
VALUES (
  'verify-diploma-duo', 
  'closed',
  '{"failure_threshold": 5, "cooldown_ms": 1800000, "success_threshold": 2}'::jsonb
)
ON CONFLICT (service_name) DO NOTHING;

-- Trigger voor updated_at
CREATE OR REPLACE FUNCTION update_circuit_breaker_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_circuit_breaker_updated_at
  BEFORE UPDATE ON public.circuit_breaker_state
  FOR EACH ROW
  EXECUTE FUNCTION update_circuit_breaker_timestamp();

-- Comment
COMMENT ON TABLE public.circuit_breaker_state IS 'Circuit breaker state tracking voor externe services - beschermt tegen cascading failures';