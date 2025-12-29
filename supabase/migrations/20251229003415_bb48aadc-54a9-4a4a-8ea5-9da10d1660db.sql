-- Fix security definer view warning by explicitly setting SECURITY INVOKER
-- This ensures RLS policies of underlying tables are respected

DROP VIEW IF EXISTS public.clients;

CREATE VIEW public.clients 
WITH (security_invoker = true) AS
SELECT 
    cs.id,
    cs.naam AS name,
    co.name AS company,
    COALESCE(cs.telefoon, cl.telefoon) AS phone,
    NULL::text AS email,
    cs.sector,
    cs.doelgroep,
    ARRAY[cs.provincie]::text[] AS regio,
    co.org_id,
    cs.is_active,
    cs.created_at,
    COALESCE(cs.adres, cl.adres) AS address,
    1 AS tier,
    40 AS weekly_hours,
    cs.plaats,
    co.id AS organization_id,
    cl.id AS location_id,
    co.logo_url
FROM client_sublocations cs
JOIN client_locations cl ON cs.location_id = cl.id
JOIN client_organizations co ON cl.client_org_id = co.id;

COMMENT ON VIEW public.clients IS 'Deprecation view - maps to client_sublocations/locations/organizations hierarchy. Will be removed when frontend components are refactored.';

GRANT SELECT ON public.clients TO authenticated;
GRANT SELECT ON public.clients TO anon;