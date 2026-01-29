-- Maak whatsapp-media bucket public zodat storage_url direct werkt
UPDATE storage.buckets 
SET public = true 
WHERE name = 'whatsapp-media';