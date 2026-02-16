
ALTER TABLE client_organizations ADD COLUMN IF NOT EXISTS crm_fase TEXT;
ALTER TABLE client_organizations ADD COLUMN IF NOT EXISTS afkorting TEXT;

ALTER TABLE client_sublocations ADD COLUMN IF NOT EXISTS externe_referentie TEXT;
ALTER TABLE client_sublocations ADD COLUMN IF NOT EXISTS bendy_parent_id TEXT;
ALTER TABLE client_sublocations ADD COLUMN IF NOT EXISTS kleur TEXT;
