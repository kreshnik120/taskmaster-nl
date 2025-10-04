-- Create professional_clients junction table
CREATE TABLE IF NOT EXISTS public.professional_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(professional_id, client_id)
);

-- Enable RLS
ALTER TABLE public.professional_clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view professional-client relationships"
ON public.professional_clients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.professionals p
    JOIN public.user_organizations uo ON uo.org_id = p.org_id
    WHERE p.id = professional_clients.professional_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Admins and managers can manage professional-client relationships"
ON public.professional_clients
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM public.professionals p
    JOIN public.user_organizations uo ON uo.org_id = p.org_id
    WHERE p.id = professional_clients.professional_id
    AND uo.user_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX idx_professional_clients_professional_id ON public.professional_clients(professional_id);
CREATE INDEX idx_professional_clients_client_id ON public.professional_clients(client_id);
CREATE INDEX idx_professional_clients_is_active ON public.professional_clients(is_active);

-- Add trigger for updated_at
CREATE TRIGGER update_professional_clients_updated_at
BEFORE UPDATE ON public.professional_clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();