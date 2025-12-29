-- Drop the legacy clients table and replace with a VIEW
-- that pulls data from the proper 3-level hierarchy

-- First drop the old clients table (if it exists)
DROP TABLE IF EXISTS public.clients CASCADE;

-- Create a VIEW that simulates the old clients interface
-- using data from client_sublocations -> client_locations -> client_organizations
CREATE VIEW public.clients AS
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

-- Add comment to clarify this is a deprecation view
COMMENT ON VIEW public.clients IS 'Deprecation view - maps to client_sublocations/locations/organizations hierarchy. Will be removed when frontend components are refactored.';

-- Grant permissions on the view
GRANT SELECT ON public.clients TO authenticated;
GRANT SELECT ON public.clients TO anon;