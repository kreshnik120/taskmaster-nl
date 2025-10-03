-- ============================================
-- SECURITY FIX: Isoleer clients per organisatie
-- ============================================

-- Stap 1: Voeg org_id kolom toe aan clients (nullable eerst)
ALTER TABLE public.clients ADD COLUMN org_id UUID;

-- Stap 2: Vul bestaande clients met de eerste beschikbare organisatie
-- (Alleen als er bestaande data is zonder org_id)
UPDATE public.clients 
SET org_id = (
  SELECT org_id 
  FROM public.user_organizations 
  LIMIT 1
)
WHERE org_id IS NULL;

-- Stap 3: Maak org_id verplicht
ALTER TABLE public.clients 
  ALTER COLUMN org_id SET NOT NULL;

-- Stap 4: Voeg foreign key constraint toe
ALTER TABLE public.clients 
  ADD CONSTRAINT clients_org_id_fkey 
  FOREIGN KEY (org_id) 
  REFERENCES public.organizations(id) 
  ON DELETE CASCADE;

-- Stap 5: Verwijder oude onveilige RLS policies
DROP POLICY IF EXISTS "Users can manage clients in their orgs" ON public.clients;
DROP POLICY IF EXISTS "Users can view clients in their orgs" ON public.clients;

-- Stap 6: Creëer nieuwe veilige RLS policies voor clients
CREATE POLICY "Users can view clients in their orgs"
  ON public.clients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = clients.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert clients in their orgs"
  ON public.clients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = clients.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update clients in their orgs"
  ON public.clients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = clients.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete clients in their orgs"
  ON public.clients
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = clients.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

-- ============================================
-- SECURITY FIX: Beveilig prioritizer_state
-- ============================================

-- Verwijder oude onveilige policies
DROP POLICY IF EXISTS "Users can manage prioritizer state" ON public.prioritizer_state;
DROP POLICY IF EXISTS "Users can view prioritizer state" ON public.prioritizer_state;

-- Creëer nieuwe veilige policies
-- segment_key bevat org_id informatie, dus we extraheren dat
CREATE POLICY "Users can view prioritizer state in their org"
  ON public.prioritizer_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.user_id = auth.uid()
        AND split_part(prioritizer_state.segment_key, '_', 1)::uuid = user_organizations.org_id
    )
  );

CREATE POLICY "Users can manage prioritizer state in their org"
  ON public.prioritizer_state
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.user_id = auth.uid()
        AND split_part(prioritizer_state.segment_key, '_', 1)::uuid = user_organizations.org_id
    )
  );