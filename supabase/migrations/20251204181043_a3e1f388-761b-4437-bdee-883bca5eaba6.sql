-- Verwijder duplicate sublocaties: behoud records met meeste data (kostenplaats + beschrijving)
-- Per location_id + naam combinatie: behoud beste record, verwijder rest

DELETE FROM client_sublocations
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY location_id, naam
        ORDER BY 
          -- Prioriteit: records met kostenplaats + beschrijving eerst
          CASE WHEN kostenplaats IS NOT NULL AND publieke_opmerking IS NOT NULL THEN 0
               WHEN kostenplaats IS NOT NULL THEN 1
               WHEN publieke_opmerking IS NOT NULL THEN 2
               ELSE 3 END,
          -- Bij gelijke data: oudste record behouden
          created_at ASC
      ) as rn
    FROM client_sublocations
    WHERE is_active = true
  ) ranked
  WHERE rn > 1
);