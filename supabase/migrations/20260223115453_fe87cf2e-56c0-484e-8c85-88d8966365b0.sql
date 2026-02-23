-- Fix V2: functie_niveau afleiden uit diploma documenten
-- Corrigeert bestaande professionals op basis van hoogste diploma in professional_documents

WITH ranked_diplomas AS (
  SELECT
    pd.professional_id,
    pd.document_name,
    CASE
      WHEN LOWER(pd.document_name) ~ 'hbo.?v|hbo\s*verpleeg|nursing' THEN 7
      WHEN LOWER(pd.document_name) ~ 'verpleegkunde|verpleegkundige' THEN 6
      WHEN LOWER(pd.document_name) ~ 'ggz' THEN 5
      WHEN LOWER(pd.document_name) ~ 'persoonlijk\s*begeleider|evc.*begeleider' THEN 4
      WHEN LOWER(pd.document_name) ~ 'verzorgend.*ig|vig' THEN 3
      WHEN LOWER(pd.document_name) ~ 'begeleider|sociaal.*werker|spw|maatschappelijke.*zorg|pedagogisch|sociaal.maatschappelijk|sociaal.cultureel' THEN 2
      WHEN LOWER(pd.document_name) ~ 'helpende' THEN 1
      ELSE 0
    END as rank,
    CASE
      WHEN LOWER(pd.document_name) ~ 'hbo.?v|hbo\s*verpleeg|nursing' THEN 'HBO-V'
      WHEN LOWER(pd.document_name) ~ 'verpleegkunde|verpleegkundige' THEN 'Verpleegkundige (MBO)'
      WHEN LOWER(pd.document_name) ~ 'ggz' THEN 'GGZ-agoog'
      WHEN LOWER(pd.document_name) ~ 'persoonlijk\s*begeleider|evc.*begeleider' THEN 'Persoonlijk begeleider'
      WHEN LOWER(pd.document_name) ~ 'verzorgend.*ig|vig' THEN 'VIG'
      WHEN LOWER(pd.document_name) ~ 'begeleider|sociaal.*werker|spw|maatschappelijke.*zorg|pedagogisch|sociaal.maatschappelijk|sociaal.cultureel' THEN 'Begeleider'
      WHEN LOWER(pd.document_name) ~ 'helpende' THEN 'Helpende'
      ELSE NULL
    END as afgeleid_niveau
  FROM professional_documents pd
  WHERE pd.document_name IS NOT NULL
),
best_diploma AS (
  SELECT DISTINCT ON (professional_id)
    professional_id,
    afgeleid_niveau,
    rank
  FROM ranked_diplomas
  WHERE rank > 0
  ORDER BY professional_id, rank DESC
)
UPDATE professionals p
SET
  functie_niveau = bd.afgeleid_niveau,
  updated_at = NOW()
FROM best_diploma bd
WHERE p.id = bd.professional_id
  AND p.deleted_at IS NULL
  AND bd.afgeleid_niveau IS NOT NULL;