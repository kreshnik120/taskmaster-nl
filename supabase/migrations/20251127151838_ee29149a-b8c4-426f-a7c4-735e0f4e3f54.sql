-- Add matching criteria fields to clients table for intelligent candidate-client matching
ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS regio text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sector text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS doelgroep text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gezochte_functies text[] DEFAULT '{}';

COMMENT ON COLUMN public.clients.regio IS 'Geographic regions where client operates (e.g., Nijmegen, Utrecht, Arnhem)';
COMMENT ON COLUMN public.clients.sector IS 'Healthcare sectors (VVT, GGZ, GHZ, Jeugdzorg, Ziekenhuis, Thuiszorg)';
COMMENT ON COLUMN public.clients.doelgroep IS 'Target audience groups (Ouderen, LVB, Psychiatrie, Somatiek, Kinderen/Jeugd, Verslaving)';
COMMENT ON COLUMN public.clients.gezochte_functies IS 'Desired job levels (VIG, HBO-V, Verpleegkundige MBO, Helpende, Begeleider, etc.)';

-- Create index for array searches (improves matching performance)
CREATE INDEX IF NOT EXISTS idx_clients_matching_fields ON public.clients USING gin (regio, sector, doelgroep, gezochte_functies);