
ALTER TABLE client_sublocations ADD COLUMN IF NOT EXISTS interne_opmerking TEXT;
ALTER TABLE client_organizations ADD COLUMN IF NOT EXISTS invoice_bedrijfsnaam TEXT;
ALTER TABLE client_organizations ADD COLUMN IF NOT EXISTS invoice_adres TEXT;
ALTER TABLE client_organizations ADD COLUMN IF NOT EXISTS invoice_postcode TEXT;
ALTER TABLE client_organizations ADD COLUMN IF NOT EXISTS invoice_plaats TEXT;
