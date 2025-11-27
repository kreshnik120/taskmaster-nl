-- Voeg CitoZorg organisatie toe als deze nog niet bestaat
INSERT INTO organizations (id, name)
VALUES ('650e8400-e29b-41d4-a716-446655440001', 'CitoZorg')
ON CONFLICT (id) DO NOTHING;

-- Voeg contactgegevens en notities kolommen toe aan clients tabel
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes text;