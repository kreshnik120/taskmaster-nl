-- Fix V3: Mbo Sociaal werker 4 = MBO niveau 4 = Persoonlijk begeleider (was foutief "Begeleider" nv3)
UPDATE professionals p
SET
  functie_niveau = 'Persoonlijk begeleider',
  updated_at = NOW()
FROM professional_documents pd
WHERE pd.professional_id = p.id
  AND p.deleted_at IS NULL
  AND p.functie_niveau = 'Begeleider'
  AND LOWER(pd.document_name) ~ 'sociaal.*werker\s*4|spw\s*4';