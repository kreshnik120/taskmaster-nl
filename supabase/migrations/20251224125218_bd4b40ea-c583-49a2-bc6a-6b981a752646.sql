-- Voeg ZZP-specifieke kolommen toe aan professionals tabel
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS bedrijfsnaam text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS beroepsaansprakelijkheid_path text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS kvk_uittreksel_path text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS klachtenportaal_wkkgz_path text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS identiteitsbewijs_path text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS bhv_certificaat_path text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS tillift_certificaat_path text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS overige_certificeringen_paths jsonb DEFAULT '[]'::jsonb;

-- Voeg ZZP-specifieke kolommen toe aan professional_applications tabel
ALTER TABLE public.professional_applications ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.professional_applications ADD COLUMN IF NOT EXISTS bedrijfsnaam text;
ALTER TABLE public.professional_applications ADD COLUMN IF NOT EXISTS beroepsaansprakelijkheid_path text;
ALTER TABLE public.professional_applications ADD COLUMN IF NOT EXISTS kvk_uittreksel_path text;
ALTER TABLE public.professional_applications ADD COLUMN IF NOT EXISTS klachtenportaal_wkkgz_path text;
ALTER TABLE public.professional_applications ADD COLUMN IF NOT EXISTS identiteitsbewijs_path text;
ALTER TABLE public.professional_applications ADD COLUMN IF NOT EXISTS bhv_certificaat_path text;
ALTER TABLE public.professional_applications ADD COLUMN IF NOT EXISTS tillift_certificaat_path text;
ALTER TABLE public.professional_applications ADD COLUMN IF NOT EXISTS overige_certificeringen_paths jsonb DEFAULT '[]'::jsonb;

-- Maak storage bucket voor ZZP documenten als die nog niet bestaat
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'zzp-documents',
  'zzp-documents',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies voor ZZP documents bucket
CREATE POLICY "Authenticated users can upload ZZP documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'zzp-documents');

CREATE POLICY "Authenticated users can view ZZP documents" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'zzp-documents');

CREATE POLICY "Authenticated users can delete own ZZP documents" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'zzp-documents');