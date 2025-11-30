-- Add client_org_id column to clients table to link clients to their organization structure
ALTER TABLE public.clients
ADD COLUMN client_org_id UUID REFERENCES public.client_organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clients.client_org_id IS 'Links legacy client to their organization structure for unified experience';

-- Create index for better query performance
CREATE INDEX idx_clients_client_org_id ON public.clients(client_org_id);

-- Link SWZ client to Stichting SWZ organization
-- First, find the SWZ client and Stichting SWZ org
UPDATE public.clients
SET client_org_id = (
  SELECT id FROM public.client_organizations 
  WHERE name = 'Stichting SWZ' 
  LIMIT 1
)
WHERE company ILIKE '%SWZ%' 
  AND name ILIKE '%SWZ%'
  AND client_org_id IS NULL;