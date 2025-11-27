-- Maak org_id nullable in professional_applications tabel
-- Nieuwe sollicitaties kunnen nu zonder organisatie worden aangemaakt
-- Organisatie wordt later toegewezen door recruitment team
ALTER TABLE professional_applications 
ALTER COLUMN org_id DROP NOT NULL;