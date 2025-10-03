-- Phase 1.5: Self-Correcting Knowledge System
-- Step 1: Add quality control columns to ai_knowledge_base
ALTER TABLE ai_knowledge_base 
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS validation_failures INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_validation_error TEXT;

-- Create index for faster conflict detection
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_category_key 
ON ai_knowledge_base(category, key);

-- Step 2: Delete incorrect Prisma item labeled as SWZ
DELETE FROM ai_knowledge_base
WHERE id = '3f97e21d-bd18-4a58-a319-61f91bd28b5b';

-- Step 3: Update correct SWZ items with higher confidence
UPDATE ai_knowledge_base
SET confidence_score = 1.0
WHERE key IN (
  'helpende_mbo2_tarieven_stichting_swz',
  'verzorgende_ig_mbo3_tarieven_stichting_swz',
  'verpleegkundige_mbo4_tarieven_stichting_swz',
  'verpleegkundige_hbo_univ_tarieven_stichting_swz'
);

-- Step 4: Insert new SWZ BGL3 tariff data
INSERT INTO ai_knowledge_base (
  user_id,
  org_id,
  category,
  key,
  value,
  confidence_score,
  source
)
SELECT 
  user_id,
  org_id,
  'tarieven',
  'swz_bgl3_tarieven',
  jsonb_build_object(
    'functieniveau', 'BGL 3',
    'klant', 'Stichting SWZ',
    'werkdagen_dagtarief', jsonb_build_object(
      'tijdvak', '07:00-23:00',
      'basis_tarief', 40.00,
      'ort_toeslag_percentage', 0,
      'flexwerker_tarief', 40.00,
      'citozorg_marge', 6.63,
      'all_in_tarief', 46.63
    ),
    'werkdagen_nachttarief', jsonb_build_object(
      'tijdvak', '23:00-07:00 en 00:00-07:00',
      'basis_tarief', 40.00,
      'ort_toeslag_percentage', 20,
      'flexwerker_tarief', 48.00,
      'citozorg_marge', 9.62,
      'all_in_tarief', 57.62
    ),
    'zaterdagtarief', jsonb_build_object(
      'tijdvak', '00:00-24:00',
      'basis_tarief', 40.00,
      'ort_toeslag_percentage', 20,
      'flexwerker_tarief', 48.00,
      'citozorg_marge', 9.62,
      'all_in_tarief', 57.62
    ),
    'zondag_feestdagen', jsonb_build_object(
      'tijdvak', '00:00-24:00',
      'basis_tarief', 40.00,
      'ort_toeslag_percentage', 20,
      'flexwerker_tarief', 48.00,
      'citozorg_marge', 9.62,
      'all_in_tarief', 57.62
    ),
    'kerstavond_oudjaarsavond', jsonb_build_object(
      'tijdvak', '18:00-24:00',
      'basis_tarief', 40.00,
      'ort_toeslag_percentage', 20,
      'flexwerker_tarief', 48.00,
      'citozorg_marge', 9.62,
      'all_in_tarief', 57.62
    )
  ),
  1.0,
  'manual_correction_phase_1_5'
FROM ai_knowledge_base
WHERE key = 'helpende_mbo2_tarieven_stichting_swz'
LIMIT 1;

-- Step 5: Insert SWZ Niveau 2 tariff data
INSERT INTO ai_knowledge_base (
  user_id,
  org_id,
  category,
  key,
  value,
  confidence_score,
  source
)
SELECT 
  user_id,
  org_id,
  'tarieven',
  'swz_niveau2_tarieven',
  jsonb_build_object(
    'functieniveau', 'Niveau 2',
    'klant', 'Stichting SWZ',
    'werkdagen_dagtarief', jsonb_build_object(
      'tijdvak', '07:00-23:00',
      'basis_tarief', 36.00,
      'ort_toeslag_percentage', 0,
      'flexwerker_tarief', 36.00,
      'citozorg_marge', 7.22,
      'all_in_tarief', 43.22
    ),
    'werkdagen_nachttarief', jsonb_build_object(
      'tijdvak', '23:00-07:00 en 00:00-07:00',
      'basis_tarief', 36.00,
      'ort_toeslag_percentage', 20,
      'flexwerker_tarief', 43.20,
      'citozorg_marge', 8.66,
      'all_in_tarief', 51.86
    ),
    'zaterdagtarief', jsonb_build_object(
      'tijdvak', '00:00-24:00',
      'basis_tarief', 36.00,
      'ort_toeslag_percentage', 20,
      'flexwerker_tarief', 43.20,
      'citozorg_marge', 8.66,
      'all_in_tarief', 51.86
    ),
    'zondag_feestdagen', jsonb_build_object(
      'tijdvak', '00:00-24:00',
      'basis_tarief', 36.00,
      'ort_toeslag_percentage', 20,
      'flexwerker_tarief', 43.20,
      'citozorg_marge', 8.66,
      'all_in_tarief', 51.86
    ),
    'kerstavond_oudjaarsavond', jsonb_build_object(
      'tijdvak', '18:00-24:00',
      'basis_tarief', 36.00,
      'ort_toeslag_percentage', 20,
      'flexwerker_tarief', 43.20,
      'citozorg_marge', 8.66,
      'all_in_tarief', 51.86
    )
  ),
  1.0,
  'manual_correction_phase_1_5'
FROM ai_knowledge_base
WHERE key = 'helpende_mbo2_tarieven_stichting_swz'
LIMIT 1;