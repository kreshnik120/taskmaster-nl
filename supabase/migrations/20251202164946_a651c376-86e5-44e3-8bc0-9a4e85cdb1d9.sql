-- Fase 1: Database uitbreiding voor werkvorm-bewuste plaatsingen

-- 1. Voeg werkvorm en plaatsing_type toe aan assignments tabel
ALTER TABLE public.assignments 
ADD COLUMN IF NOT EXISTS werkvorm TEXT,
ADD COLUMN IF NOT EXISTS plaatsing_type TEXT,
ADD COLUMN IF NOT EXISTS verwachte_einddatum DATE;

-- 2. Voeg CHECK constraints toe voor geldige waarden
ALTER TABLE public.assignments 
ADD CONSTRAINT assignments_werkvorm_check 
CHECK (werkvorm IS NULL OR werkvorm IN ('ZZP', 'Uitzendkracht', 'ABCito constructie'));

ALTER TABLE public.assignments 
ADD CONSTRAINT assignments_plaatsing_type_check 
CHECK (plaatsing_type IS NULL OR plaatsing_type IN ('periode_opdracht', 'langdurig', 'flexibel'));

-- 3. Creëer werkvorm_tarieven tabel voor tarief lookup
CREATE TABLE IF NOT EXISTS public.werkvorm_tarieven (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sublocation_id UUID NOT NULL REFERENCES public.client_sublocations(id) ON DELETE CASCADE,
  functie_niveau TEXT NOT NULL,
  werkvorm TEXT NOT NULL CHECK (werkvorm IN ('ZZP', 'Uitzendkracht', 'ABCito constructie')),
  basis_tarief NUMERIC NOT NULL,
  toeslag_percentage NUMERIC DEFAULT 0,
  btw_percentage NUMERIC DEFAULT 21,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(sublocation_id, functie_niveau, werkvorm)
);

-- 4. Enable RLS op werkvorm_tarieven
ALTER TABLE public.werkvorm_tarieven ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies voor werkvorm_tarieven
CREATE POLICY "Org members can view werkvorm_tarieven"
ON public.werkvorm_tarieven FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM client_sublocations cs
    JOIN client_locations cl ON cl.id = cs.location_id
    JOIN client_organizations co ON co.id = cl.client_org_id
    JOIN user_organizations uo ON uo.org_id = co.org_id
    WHERE cs.id = werkvorm_tarieven.sublocation_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Admins and managers can manage werkvorm_tarieven"
ON public.werkvorm_tarieven FOR ALL
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM client_sublocations cs
    JOIN client_locations cl ON cl.id = cs.location_id
    JOIN client_organizations co ON co.id = cl.client_org_id
    JOIN user_organizations uo ON uo.org_id = co.org_id
    WHERE cs.id = werkvorm_tarieven.sublocation_id
    AND uo.user_id = auth.uid()
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM client_sublocations cs
    JOIN client_locations cl ON cl.id = cs.location_id
    JOIN client_organizations co ON co.id = cl.client_org_id
    JOIN user_organizations uo ON uo.org_id = co.org_id
    WHERE cs.id = werkvorm_tarieven.sublocation_id
    AND uo.user_id = auth.uid()
  )
);

-- 6. Trigger voor updated_at
CREATE TRIGGER update_werkvorm_tarieven_updated_at
BEFORE UPDATE ON public.werkvorm_tarieven
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_timestamp();

-- 7. Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_werkvorm_tarieven_lookup 
ON public.werkvorm_tarieven(sublocation_id, functie_niveau, werkvorm) 
WHERE is_active = true;

-- 8. Index voor assignments werkvorm filtering
CREATE INDEX IF NOT EXISTS idx_assignments_werkvorm ON public.assignments(werkvorm);
CREATE INDEX IF NOT EXISTS idx_assignments_plaatsing_type ON public.assignments(plaatsing_type);