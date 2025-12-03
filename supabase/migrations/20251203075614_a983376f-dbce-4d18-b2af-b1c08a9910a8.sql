-- ===================================================================
-- FASE 16: Security Hardening - Views & PII Access Restriction
-- ===================================================================

-- 1. FIX: assignment_details view - verander naar SECURITY INVOKER
DROP VIEW IF EXISTS public.assignment_details;

CREATE OR REPLACE VIEW public.assignment_details 
WITH (security_invoker = true)
AS
SELECT 
    a.id,
    a.professional_id,
    a.sublocation_id,
    a.hourly_rate_id,
    a.start_date,
    a.end_date,
    a.weekly_hours,
    a.status,
    a.ai_match_score,
    a.ai_match_reasoning,
    a.notes,
    a.created_at,
    a.updated_at,
    p.full_name AS professional_name,
    p.functie_niveau,
    p.werkvorm,
    cs.naam AS sublocation_name,
    cs.plaats AS sublocation_plaats,
    cs.doelgroep,
    cs.sector,
    cl.naam AS location_name,
    cl.plaats AS location_plaats,
    co.name AS organization_name,
    hr.uursoort_naam,
    hr.basis_tarief,
    hr.btw_percentage,
    CASE
        WHEN cs.gekoppelde_bv_org_id = '550e8400-e29b-41d4-a716-446655440000'::uuid THEN 'ABCzorg'
        WHEN cs.gekoppelde_bv_org_id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'::uuid THEN 'CitoZorg'
        ELSE 'Onbekend'
    END AS bemiddelingsbureau
FROM assignments a
JOIN professionals p ON p.id = a.professional_id
JOIN client_sublocations cs ON cs.id = a.sublocation_id
JOIN client_locations cl ON cl.id = cs.location_id
JOIN client_organizations co ON co.id = cl.client_org_id
LEFT JOIN hourly_rates hr ON hr.id = a.hourly_rate_id;

-- 2. FIX: professionals_public view - SECURITY INVOKER + alleen niet-PII kolommen
DROP VIEW IF EXISTS public.professionals_public;

CREATE OR REPLACE VIEW public.professionals_public
WITH (security_invoker = true)
AS
SELECT 
    p.id,
    p.full_name,
    p.functie_niveau,
    p.werkvorm,
    p.status,
    p.regio,
    p.beschikbaarheidsnotities,
    p.org_id,
    p.created_at,
    p.rating,
    p.tags,
    p.skills,
    p.heeft_auto,
    p.heeft_rijbewijs,
    p.provincie
    -- NOTE: PII bewust weggelaten: email, telefoonnummer, adres, postcode, woonplaats, kvk_nummer, btw_nummer, big_nummer
FROM professionals p
WHERE p.deleted_at IS NULL;

-- 3. Create admin-only view voor volledige PII data
CREATE OR REPLACE VIEW public.professionals_admin_view
WITH (security_invoker = true)
AS
SELECT 
    p.*
FROM professionals p
WHERE p.deleted_at IS NULL;

-- 4. Grant permissions op views
GRANT SELECT ON public.assignment_details TO authenticated;
GRANT SELECT ON public.professionals_public TO authenticated;
GRANT SELECT ON public.professionals_admin_view TO authenticated;

-- 5. Comments voor documentatie
COMMENT ON VIEW public.professionals_public IS 'Publieke professional data zonder PII (email, telefoon, adres, BSN-gerelateerd). Voor volledige data gebruik professionals_admin_view (admin only via RLS).';
COMMENT ON VIEW public.professionals_admin_view IS 'Volledige professional data inclusief PII. Alleen toegankelijk voor admins via RLS op professionals tabel.';
COMMENT ON VIEW public.assignment_details IS 'Assignment details view met SECURITY INVOKER - erft RLS van onderliggende tabellen.';