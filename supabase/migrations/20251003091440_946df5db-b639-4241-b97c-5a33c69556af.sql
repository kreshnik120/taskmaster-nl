-- Stap 1: Maak professional_id nullable in professional_applications
ALTER TABLE professional_applications 
ALTER COLUMN professional_id DROP NOT NULL;

-- Stap 2: Voeg extra velden toe aan professionals tabel
ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS telefoonnummer TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS adres TEXT,
ADD COLUMN IF NOT EXISTS postcode TEXT,
ADD COLUMN IF NOT EXISTS woonplaats TEXT,
ADD COLUMN IF NOT EXISTS vog_date DATE,
ADD COLUMN IF NOT EXISTS big_nummer TEXT,
ADD COLUMN IF NOT EXISTS heeft_auto BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS heeft_rijbewijs BOOLEAN DEFAULT false;

-- Stap 3: Voeg extracted_data JSONB veld toe aan professional_applications
ALTER TABLE professional_applications
ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT '{}'::jsonb;