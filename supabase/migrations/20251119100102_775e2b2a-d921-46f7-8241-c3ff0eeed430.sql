-- Fix: Verwijder restrictieve admin-only policies op business_intelligence
-- Dit zorgt ervoor dat org members (via "Org members can manage" policy) 
-- conflicts kunnen oplossen zonder admin rechten nodig te hebben

DROP POLICY IF EXISTS "Only admins can update business_intelligence" 
  ON public.business_intelligence;

DROP POLICY IF EXISTS "Only admins can insert business_intelligence" 
  ON public.business_intelligence;

DROP POLICY IF EXISTS "Only admins can delete business_intelligence" 
  ON public.business_intelligence;

-- De "Org members can manage business intelligence" policy (CMD=ALL) blijft actief
-- en staat nu UPDATE, INSERT, DELETE toe voor alle org members