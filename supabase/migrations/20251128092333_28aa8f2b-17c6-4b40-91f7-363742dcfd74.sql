-- ===================================================================
-- Fase 1.1: Fix professionals_functie_niveau_check constraint
-- ===================================================================
-- Huidige constraint accepteert alleen beperkte set waarden,
-- maar frontend gebruikt bredere set. Dit blokkeert conversie.

ALTER TABLE professionals DROP CONSTRAINT IF EXISTS professionals_functie_niveau_check;

ALTER TABLE professionals ADD CONSTRAINT professionals_functie_niveau_check 
CHECK (functie_niveau = ANY (ARRAY[
  'VIG',
  'HBO-V', 
  'Verpleegkundige MBO',
  'Verpleegkundige (MBO)',
  'Helpende',
  'Helpende 2',
  'Begeleider',
  'Persoonlijk begeleider',
  'GGZ-agoog',
  'VP3',
  'VP4'
]));

-- ===================================================================
-- Verificatie: Test constraint met frontend waarden
-- ===================================================================
-- Alle onderstaande functie_niveau waarden moeten nu toegestaan zijn:
-- 'VIG', 'HBO-V', 'Verpleegkundige MBO', 'Helpende', 
-- 'Begeleider', 'Persoonlijk begeleider', 'GGZ-agoog'